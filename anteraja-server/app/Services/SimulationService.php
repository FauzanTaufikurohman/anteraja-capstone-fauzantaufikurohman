<?php

namespace App\Services;

use App\Models\Shipment;
use App\Models\SimulationRun;
use Illuminate\Support\Facades\DB;

class SimulationService
{
    public function __construct(private ShipmentService $shipments) {}

    /** @return array{config: array, state: array, samples: array, correctionPlan: string} */
    public function preview(string $trackingNumber, array $data): array
    {
        return $this->execute($this->shipments->find($trackingNumber), $data);
    }

    public function create(string $trackingNumber, array $data): SimulationRun
    {
        return DB::transaction(function () use ($trackingNumber, $data): SimulationRun {
            $shipment = $this->shipments->find($trackingNumber);
            $result = $this->execute($shipment, $data);
            $hasExcursion = $result['state']['productC'] < (float) $shipment->product->min_temp_c
                || $result['state']['productC'] > (float) $shipment->product->max_temp_c;
            $run = $shipment->simulationRuns()->create([
                'total_steps' => $data['durationSeconds'],
                'has_excursion' => $hasExcursion,
                'scenario_type' => $data['disturbance'],
                'parameters' => $result['config'],
                'notes' => $data['notes'] ?? null,
            ]);

            $run->timeSeriesLogs()->createMany(array_map(
                fn(array $sample): array => [
                    'step_seconds' => $sample['elapsedSeconds'],
                    'air_temp_c' => $sample['airC'],
                    'product_temp_c' => $sample['productC'],
                    'sensor_temp_c' => $sample['sensorC'],
                    'q_cooling_active' => $sample['coolingActive'],
                ],
                $result['samples'],
            ));

            $this->shipments->updateThermalData($shipment, [
                'thermalConfig' => $result['config'],
                'thermalState' => $result['state'],
            ]);

            return $run->load('timeSeriesLogs');
        });
    }

    public function advanceMonitoring(string $trackingNumber): Shipment
    {
        return DB::transaction(function () use ($trackingNumber): Shipment {
            $shipment = $this->shipments->find($trackingNumber);
            $config = $this->thermalConfig($shipment);
            $state = $this->thermalState($shipment);

            for ($second = 0; $second < 5; $second++) {
                $state = $this->step($state, $config, (float) $shipment->thermalParameters->mass_kg);
            }

            $this->shipments->updateThermalData($shipment, ['thermalState' => $state]);

            return $this->shipments->find($trackingNumber);
        });
    }

    /** @return array{config: array, state: array, samples: array, correctionPlan: string} */
    private function execute(Shipment $shipment, array $data): array
    {
        $config = array_replace($this->thermalConfig($shipment), $data['thermalConfig'] ?? []);
        $state = $data['thermalState'] ?? $this->thermalState($shipment);
        $disturbance = $data['disturbance'];

        if ($data['correctDisturbance'] ?? false) {
            $config = $this->applyCorrection($config, $disturbance);
            $disturbance = 'none';
        }

        $config = $this->configureDisturbance($config, $disturbance);
        $duration = min(8 * 60 * 60, max(1, (int) $data['durationSeconds']));
        $sampleEvery = max(1, (int) floor($duration / 120));
        $samples = [$this->sample($state, 0)];

        for ($second = 1; $second <= $duration; $second++) {
            $state = $this->step($state, $config, (float) $shipment->thermalParameters->mass_kg);
            if ($second % $sampleEvery === 0 || $second === $duration) {
                $samples[] = $this->sample($state, $second);
            }
        }

        return [
            'config' => $config,
            'state' => $state,
            'samples' => $samples,
            'correctionPlan' => $this->correctionPlan($data['disturbance']),
        ];
    }

    private function thermalConfig(Shipment $shipment): array
    {
        $thermal = $shipment->thermalParameters;

        return [
            'setpointC' => (float) $thermal->target_setpoint_c,
            'ambientC' => (float) $thermal->ambient_temp_c,
            'enclosureConductanceWPerK' => (float) $thermal->conductance_ua,
            'productSpecificHeatJPerKgK' => (float) $thermal->specific_heat_cp,
            'productConductanceWPerK' => (float) $thermal->h_product_air,
            'airHeatCapacityJPerK' => (float) $thermal->air_heat_capacity,
            'coolingCapacityW' => (float) $thermal->cooling_capacity_w,
            'coolingEfficiency' => (float) $thermal->cooling_efficiency,
            'sensorTimeConstantSeconds' => (float) $thermal->tau_sensor,
            'sensorOffsetC' => (float) $thermal->sensor_bias,
            'hysteresisC' => (float) $thermal->hysteresis_margin_c,
            'doorOpen' => (bool) $thermal->door_open,
            'powerAvailable' => (bool) $thermal->power_available,
        ];
    }

    private function thermalState(Shipment $shipment): array
    {
        $thermal = $shipment->thermalParameters;

        return [
            'airC' => (float) $thermal->air_temp_c,
            'productC' => (float) $thermal->product_temp_c,
            'sensorC' => (float) $thermal->sensor_temp_c,
            'coolingActive' => (bool) $thermal->cooling_active,
            'elapsedSeconds' => (int) $thermal->elapsed_seconds,
        ];
    }

    private function configureDisturbance(array $config, string $disturbance): array
    {
        $config = array_merge($config, [
            'doorOpen' => false,
            'powerAvailable' => true,
            'coolingEfficiency' => 1,
        ]);

        return match ($disturbance) {
            'door-open' => array_merge($config, ['doorOpen' => true]),
            'power-loss' => array_merge($config, ['powerAvailable' => false]),
            'sensor-drift' => array_merge($config, ['sensorOffsetC' => $config['sensorOffsetC'] + 3]),
            'weak-cooling' => array_merge($config, ['coolingEfficiency' => 0.3]),
            default => $config,
        };
    }

    private function applyCorrection(array $config, string $disturbance): array
    {
        return match ($disturbance) {
            'door-open' => array_merge($config, ['doorOpen' => false]),
            'power-loss' => array_merge($config, ['powerAvailable' => true]),
            'sensor-drift' => array_merge($config, ['sensorOffsetC' => $config['sensorOffsetC'] - 3]),
            'weak-cooling' => array_merge($config, ['coolingEfficiency' => 1]),
            default => $config,
        };
    }

    private function step(array $state, array $config, float $massKg): array
    {
        $dt = 1;
        $range = max(0.1, $massKg) * $config['productSpecificHeatJPerKgK'];
        $upperThreshold = $config['setpointC'] + $config['hysteresisC'] / 2;
        $lowerThreshold = $config['setpointC'] - $config['hysteresisC'] / 2;
        $coolingActive = $state['coolingActive'];

        if (! $config['powerAvailable']) {
            $coolingActive = false;
        } elseif ($state['sensorC'] >= $upperThreshold) {
            $coolingActive = true;
        } elseif ($state['sensorC'] <= $lowerThreshold) {
            $coolingActive = false;
        }

        $enclosureHeatW = $config['enclosureConductanceWPerK'] * ($config['ambientC'] - $state['airC']);
        $productHeatW = $config['productConductanceWPerK'] * ($state['productC'] - $state['airC']);
        $doorHeatW = $config['doorOpen'] ? max(0, $config['ambientC'] - $state['airC']) * 8 : 0;
        $coolingW = $coolingActive ? $config['coolingCapacityW'] * $config['coolingEfficiency'] : 0;
        $airC = $state['airC'] + (($enclosureHeatW + $productHeatW + $doorHeatW - $coolingW) / $config['airHeatCapacityJPerK']) * $dt;
        $productC = $state['productC'] + (($config['productConductanceWPerK'] * ($state['airC'] - $state['productC'])) / $range) * $dt;
        $sensorTargetC = $airC + $config['sensorOffsetC'];
        $response = 1 - exp(-$dt / max(0.1, $config['sensorTimeConstantSeconds']));
        $sensorC = $state['sensorC'] + ($sensorTargetC - $state['sensorC']) * $response;

        return [
            'airC' => $airC,
            'productC' => $productC,
            'sensorC' => $sensorC,
            'coolingActive' => $coolingActive,
            'elapsedSeconds' => $state['elapsedSeconds'] + $dt,
        ];
    }

    private function sample(array $state, int $elapsedSeconds): array
    {
        return [
            'elapsedSeconds' => $elapsedSeconds,
            'airC' => $state['airC'],
            'productC' => $state['productC'],
            'sensorC' => $state['sensorC'],
            'coolingActive' => $state['coolingActive'],
        ];
    }

    private function correctionPlan(string $disturbance): string
    {
        return match ($disturbance) {
            'door-open' => 'Tutup pintu kontainer untuk menghentikan masuknya panas.',
            'power-loss' => 'Pulihkan daya agar sistem pendingin dapat bekerja kembali.',
            'sensor-drift' => 'Kalibrasi sensor dengan suhu referensi; ini memperbaiki pembacaan, bukan suhu produk.',
            'weak-cooling' => 'Pulihkan kapasitas pendingin dan periksa sumber gangguan.',
            default => 'Tidak ada gangguan aktif yang perlu dikoreksi.',
        };
    }
}
