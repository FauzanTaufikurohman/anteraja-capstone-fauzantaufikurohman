<?php

namespace App\Services;

use App\Models\SimulationRun;
use Illuminate\Support\Facades\DB;

class SimulationService
{
    public function __construct(private ShipmentService $shipments) {}

    public function create(string $trackingNumber, array $data): SimulationRun
    {
        return DB::transaction(function () use ($trackingNumber, $data): SimulationRun {
            $shipment = $this->shipments->find($trackingNumber);
            $run = $shipment->simulationRuns()->create([
                'total_steps' => $data['totalSteps'],
                'has_excursion' => $data['hasExcursion'],
                'scenario_type' => $data['disturbance'],
                'parameters' => $data['thermalConfig'],
                'notes' => $data['notes'] ?? null,
            ]);

            $run->timeSeriesLogs()->createMany(array_map(
                fn (array $sample): array => [
                    'step_seconds' => $sample['elapsedSeconds'],
                    'air_temp_c' => $sample['airC'],
                    'product_temp_c' => $sample['productC'],
                    'sensor_temp_c' => $sample['sensorC'],
                    'q_cooling_active' => $sample['coolingActive'],
                ],
                $data['samples'],
            ));

            $this->shipments->updateThermalData($shipment, [
                'thermalConfig' => $data['thermalConfig'],
                'thermalState' => $data['thermalState'],
            ]);

            return $run->load('timeSeriesLogs');
        });
    }
}
