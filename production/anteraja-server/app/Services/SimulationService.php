<?php

namespace App\Services;

use App\Models\Shipment;
use App\Models\SimulationRun;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SimulationService
{
    public function __construct(private ShipmentService $shipments) {}

    /** @return array{config: array, initialState: array, state: array, samples: array, correctionPlan: string, recoverySeconds: ?int} */
    public function preview(string $trackingNumber, array $data): array
    {
        $data['correctDisturbance'] = false;

        return $this->execute($this->shipments->find($trackingNumber), $data);
    }

    public function previewCorrective(string $trackingNumber, array $data): array
    {
        $shipment = $this->shipments->find($trackingNumber);
        $this->assertActiveDisturbance($shipment, $data['disturbance']);
        unset($data['thermalState']);
        $data['correctDisturbance'] = true;
        $result = $this->execute($shipment, $data);
        $minimumTemperature = (float) $shipment->product->min_temp_c;
        $maximumTemperature = (float) $shipment->product->max_temp_c;
        $result['recommendedSetpointC'] = ($minimumTemperature + $maximumTemperature) / 2;
        $result['recommendedCoolingCapacityW'] = $this->recommendedCoolingCapacity($shipment, $data);
        $result['coolingRecommendationMessage'] = $this->coolingRecommendationMessage(
            $shipment,
            $result['recommendedCoolingCapacityW'],
        );

        return $result;
    }

    public function create(string $trackingNumber, array $data): SimulationRun
    {
        return $this->persist($trackingNumber, $data, false);
    }

    public function createCorrective(string $trackingNumber, array $data): SimulationRun
    {
        return $this->persist($trackingNumber, $data, true);
    }

    private function persist(string $trackingNumber, array $data, bool $isCorrective): SimulationRun
    {
        return DB::transaction(function () use ($trackingNumber, $data, $isCorrective): SimulationRun {
            $shipment = $this->shipments->find($trackingNumber);
            if ($isCorrective) {
                $this->assertActiveDisturbance($shipment, $data['disturbance']);
                unset($data['thermalState']);
            }

            $data['correctDisturbance'] = $isCorrective;
            $result = $this->execute($shipment, $data);
            $hasExcursion = $result['state']['productC'] < (float) $shipment->product->min_temp_c
                || $result['state']['productC'] > (float) $shipment->product->max_temp_c;
            if ($isCorrective && $hasExcursion) {
                throw ValidationException::withMessages([
                    'thermalState' => 'Suhu inti belum kembali ke rentang target. Tambah durasi atau kapasitas pendingin, lalu uji kembali.',
                ]);
            }

            $run = $shipment->simulationRuns()->create([
                'total_steps' => $data['durationSeconds'],
                'has_excursion' => $hasExcursion,
                'scenario_type' => $isCorrective
                    ? 'corrective-' . $data['disturbance']
                    : $data['disturbance'],
                'parameters' => $result['config'],
                'notes' => $data['notes'] ?? null,
            ]);

            DB::table('simulation_time_series_logs')->insert(array_map(
                fn(array $sample): array => [
                    'simulation_run_id' => $run->id,
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
                'activeDisturbance' => $isCorrective || $data['disturbance'] === 'none'
                    ? null
                    : $data['disturbance'],
            ]);

            return $run;
        });
    }

    private function assertActiveDisturbance(Shipment $shipment, string $disturbance): void
    {
        if ($shipment->thermalParameters->active_disturbance !== $disturbance) {
            throw ValidationException::withMessages([
                'disturbance' => 'Simpan simulasi gangguan yang sesuai sebelum menguji Perbaikan.',
            ]);
        }
    }

    private function recommendedCoolingCapacity(Shipment $shipment, array $data): ?int
    {
        $minimumTemperature = (float) $shipment->product->min_temp_c;
        $maximumTemperature = (float) $shipment->product->max_temp_c;
        if ((float) $shipment->thermalParameters->product_temp_c < $minimumTemperature) {
            return null;
        }

        $minimumCapacity = 0.0;
        $maximumAllowedCapacity = 5000.0;
        $maximumCapacity = max(
            10.0,
            (float) ($data['thermalConfig']['coolingCapacityW'] ?? $shipment->thermalParameters->cooling_capacity_w),
        );

        $data['thermalConfig'] = array_replace($data['thermalConfig'] ?? [], [
            'coolingCapacityW' => $maximumCapacity,
        ]);

        $candidateTemperature = $this->execute($shipment, $data, false, false)['state']['productC'];
        while ($candidateTemperature > $maximumTemperature && $maximumCapacity < $maximumAllowedCapacity) {
            $minimumCapacity = $maximumCapacity;
            $maximumCapacity = min($maximumCapacity * 2, $maximumAllowedCapacity);
            $data['thermalConfig']['coolingCapacityW'] = $maximumCapacity;
            $candidateTemperature = $this->execute($shipment, $data, false, false)['state']['productC'];
        }

        if ($candidateTemperature > $maximumTemperature) {
            return null;
        }

        for ($iteration = 0; $iteration < 4; $iteration++) {
            $candidateCapacity = ($minimumCapacity + $maximumCapacity) / 2;
            $data['thermalConfig']['coolingCapacityW'] = $candidateCapacity;
            $candidateTemperature = $this->execute($shipment, $data, false, false)['state']['productC'];

            if ($candidateTemperature <= $maximumTemperature) {
                $maximumCapacity = $candidateCapacity;
            } else {
                $minimumCapacity = $candidateCapacity;
            }
        }

        $recommendedCapacity = (int) (ceil($maximumCapacity / 10) * 10);
        $data['thermalConfig']['coolingCapacityW'] = $recommendedCapacity;
        $verifiedTemperature = $this->execute($shipment, $data, false, false)['state']['productC'];

        return $verifiedTemperature >= $minimumTemperature && $verifiedTemperature <= $maximumTemperature
            ? $recommendedCapacity
            : null;
    }

    private function coolingRecommendationMessage(Shipment $shipment, ?int $recommendedCapacity): string
    {
        if ((float) $shipment->thermalParameters->product_temp_c < (float) $shipment->product->min_temp_c) {
            return 'Suhu inti berada di bawah rentang. Menambah daya pendingin tidak dapat menghangatkan produk; model ini belum mencakup pemanas.';
        }

        if ($recommendedCapacity === null) {
            return 'Model belum menemukan kapasitas hingga 5.000 W yang mencapai rentang dalam durasi ini. Tambah durasi atau periksa parameter termal.';
        }

        return "Estimasi model: daya minimum sekitar {$recommendedCapacity} W untuk mencapai rentang pada setpoint dan durasi ini. Verifikasi kemampuan unit pendingin di lapangan.";
    }

    public function advanceMonitoring(string $trackingNumber): Shipment
    {
        return DB::transaction(function () use ($trackingNumber): Shipment {
            $shipment = $this->shipments->find($trackingNumber);
            $config = $this->thermalConfig($shipment);
            $state = $this->thermalState($shipment);
            $sensorResponse = $this->sensorResponse($config);

            for ($second = 0; $second < 5; $second++) {
                $state = $this->step(
                    $state,
                    $config,
                    (float) $shipment->thermalParameters->mass_kg,
                    $sensorResponse,
                );
            }

            $this->shipments->updateThermalData($shipment, ['thermalState' => $state]);

            return $shipment;
        });
    }

    /** @return array{config: array, initialState: array, state: array, samples: array, correctionPlan: string, recoverySeconds: ?int} */
    private function execute(
        Shipment $shipment,
        array $data,
        bool $collectSamples = true,
        bool $trackRecovery = true,
    ): array {
        $config = array_replace($this->thermalConfig($shipment), $data['thermalConfig'] ?? []);
        $state = $data['thermalState'] ?? $this->thermalState($shipment);
        $initialState = $state;
        $disturbance = $data['disturbance'];

        if ($data['correctDisturbance'] ?? false) {
            $config = $this->applyCorrection($config, $disturbance);
            $disturbance = 'none';
        }

        $config = $this->configureDisturbance($config, $disturbance);
        $duration = min(8 * 60 * 60, max(1, (int) $data['durationSeconds']));
        $sampleEvery = max(1, (int) floor($duration / 120));
        $samples = $collectSamples ? [$this->sample($state, 0)] : [];
        $isCorrective = $data['correctDisturbance'] ?? false;
        $sensorResponse = $this->sensorResponse($config);
        $isInRange = fn(float $temperature): bool => $temperature >= (float) $shipment->product->min_temp_c
            && $temperature <= (float) $shipment->product->max_temp_c;
        $recoverySeconds = $trackRecovery && $isCorrective && $isInRange((float) $state['productC']) ? 0 : null;

        for ($second = 1; $second <= $duration; $second++) {
            $state = $this->step(
                $state,
                $config,
                (float) $shipment->thermalParameters->mass_kg,
                $sensorResponse,
            );
            if ($trackRecovery && $isCorrective && $recoverySeconds === null && $isInRange((float) $state['productC'])) {
                $recoverySeconds = $second;
            }

            if ($collectSamples && ($second % $sampleEvery === 0 || $second === $duration)) {
                $samples[] = $this->sample($state, $second);
            }
        }

        return [
            'config' => $config,
            'initialState' => $initialState,
            'state' => $state,
            'samples' => $samples,
            'correctionPlan' => $this->correctionPlan($data['disturbance']),
            'recoverySeconds' => $recoverySeconds,
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

    private function sensorResponse(array $config): float
    {
        return 1 - exp(-1 / max(0.1, $config['sensorTimeConstantSeconds']));
    }

    private function step(array $state, array $config, float $massKg, float $sensorResponse): array
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
        $sensorC = $state['sensorC'] + ($sensorTargetC - $state['sensorC']) * $sensorResponse;

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
