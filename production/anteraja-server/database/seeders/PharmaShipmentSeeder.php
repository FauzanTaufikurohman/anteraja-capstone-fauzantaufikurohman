<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Shipment;
use Illuminate\Database\Seeder;

class PharmaShipmentSeeder extends Seeder
{
    public function run(): void
    {
        $samples = [
            ['DPSVA-20260924-001', 'APOTEK JAYA ABADI', 'APOTEK MANDIRI', 'Cold chain', 2.5, 5.5, 'Dalam pengantaran'],
            ['DPSVA-20260924-002', 'APOTEK MANDIRI', 'APOTEK GILA PHARMA', 'Cold chain', 1.2, 7.2, 'Dalam pengantaran'],
            ['DPSVA-20260924-003', 'APOTEK GILA PHARMA', 'APOTEK JAYA ABADI', 'Ambient', 3.1, 22.0, 'Selesai'],
        ];

        foreach ($samples as [$tracking, $origin, $destination, $category, $weight, $temperature, $status]) {
            $ambient = $category === 'Ambient';
            $product = Product::query()->firstOrCreate(
                ['category' => $category],
                [
                    'name' => $category,
                    'min_temp_c' => $ambient ? 15 : 2,
                    'max_temp_c' => $ambient ? 25 : 8,
                ],
            );
            $stage = match ($status) {
                'Selesai' => 'Delivered',
                'Dalam pengantaran' => 'In Transit',
                default => 'Preparation',
            };
            $shipment = Shipment::query()->firstOrCreate(
                ['tracking_number' => $tracking],
                [
                    'product_id' => $product->id,
                    'origin' => $origin,
                    'destination' => $destination,
                    'current_stage' => $stage,
                    'status' => $status === 'Selesai' ? 'Completed' : 'In Transit',
                ],
            );

            $shipment->thermalParameters()->firstOrCreate([], [
                'mass_kg' => $weight,
                'specific_heat_cp' => 3500,
                'conductance_ua' => 1.2,
                'h_product_air' => 2.4,
                'air_heat_capacity' => 2500,
                'ambient_temp_c' => 30,
                'cooling_capacity_w' => $ambient ? 0 : 120,
                'cooling_efficiency' => 1,
                'tau_sensor' => 15,
                'sensor_bias' => 0,
                'target_setpoint_c' => $ambient ? 20 : 5,
                'hysteresis_margin_c' => 1,
                'air_temp_c' => $temperature,
                'product_temp_c' => $temperature,
                'sensor_temp_c' => $temperature,
            ]);

            $shipment->transitStageLogs()->firstOrCreate(['stage_name' => $stage]);
        }
    }
}
