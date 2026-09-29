<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Shipment;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ShipmentService
{
    private const STATUS_TO_STAGE = [
        'Dalam persiapan' => 'Preparation',
        'Siap dikirim' => 'Loading',
        'Dalam pengantaran' => 'In Transit',
        'Ditahan' => 'Held',
        'Karantina' => 'Quarantine',
        'Selesai' => 'Delivered',
    ];

    private const STAGE_TO_STATUS = [
        'Preparation' => 'Dalam persiapan',
        'Loading' => 'Siap dikirim',
        'In Transit' => 'Dalam pengantaran',
        'Held' => 'Ditahan',
        'Quarantine' => 'Karantina',
        'Delivered' => 'Selesai',
    ];

    public function list(): Collection
    {
        return Shipment::query()->with(['product', 'thermalParameters'])->latest()->get();
    }

    public function find(string $trackingNumber): Shipment
    {
        return Shipment::query()
            ->with(['product', 'thermalParameters'])
            ->where('tracking_number', $trackingNumber)
            ->firstOrFail();
    }

    public function create(array $data): Shipment
    {
        return DB::transaction(function () use ($data): Shipment {
            $category = $data['category'];
            $product = $this->productForCategory($category);
            $status = $data['status'] ?? 'Dalam persiapan';
            $temperature = $data['temperature'] ?? $this->rangeFor($category)['midpoint'];
            $config = $data['thermalConfig'] ?? [];
            $state = $data['thermalState'] ?? [];

            $shipment = Shipment::query()->create([
                'product_id' => $product->id,
                'tracking_number' => $data['id'] ?? 'ANT-PHARMA-'.Str::upper(Str::random(10)),
                'origin' => $data['origin'],
                'destination' => $data['destination'],
                'current_stage' => self::STATUS_TO_STAGE[$status],
                'status' => $this->shipmentStatus($status),
            ]);

            $shipment->thermalParameters()->create(array_merge(
                $this->defaultParameters($category, (float) $data['weight'], (float) $temperature),
                $this->thermalConfigAttributes($config),
                $this->thermalStateAttributes($state),
            ));
            $shipment->transitStageLogs()->create(['stage_name' => self::STATUS_TO_STAGE[$status]]);

            return $shipment->load(['product', 'thermalParameters']);
        });
    }

    public function update(string $trackingNumber, array $data): Shipment
    {
        return DB::transaction(function () use ($trackingNumber, $data): Shipment {
            $shipment = $this->find($trackingNumber);
            $attributes = [];

            foreach (['origin', 'destination'] as $field) {
                if (array_key_exists($field, $data)) {
                    $attributes[$field] = $data[$field];
                }
            }

            if (array_key_exists('category', $data)) {
                $shipment->product()->associate($this->productForCategory($data['category']));
                $shipment->save();
            }

            if (array_key_exists('status', $data)) {
                $attributes['current_stage'] = self::STATUS_TO_STAGE[$data['status']];
                $attributes['status'] = $this->shipmentStatus($data['status']);
                $shipment->transitStageLogs()->create([
                    'stage_name' => $attributes['current_stage'],
                ]);
            }

            if ($attributes !== []) {
                $shipment->update($attributes);
            }

            $this->updateThermalData($shipment, $data);

            return $this->find($trackingNumber);
        });
    }

    public function updateThermalData(Shipment $shipment, array $data): void
    {
        $parameters = $shipment->thermalParameters;
        $attributes = [];

        if (array_key_exists('weight', $data)) {
            $attributes['mass_kg'] = $data['weight'];
        }

        if (array_key_exists('thermalConfig', $data)) {
            $attributes = array_merge($attributes, $this->thermalConfigAttributes($data['thermalConfig']));
        }

        if (array_key_exists('thermalState', $data)) {
            $attributes = array_merge($attributes, $this->thermalStateAttributes($data['thermalState']));
        }

        if (array_key_exists('temperature', $data) && ! array_key_exists('thermalState', $data)) {
            $attributes['product_temp_c'] = $data['temperature'];
        }

        if ($attributes !== []) {
            $parameters->update($attributes);
            $shipment->touch();
        }
    }

    public static function statusLabel(string $stage): string
    {
        return self::STAGE_TO_STATUS[$stage] ?? 'Dalam persiapan';
    }

    private function productForCategory(string $category): Product
    {
        $range = $this->rangeFor($category);

        return Product::query()->firstOrCreate(
            ['category' => $category],
            [
                'name' => $category,
                'min_temp_c' => $range['min'],
                'max_temp_c' => $range['max'],
            ],
        );
    }

    private function rangeFor(string $category): array
    {
        $normalized = Str::lower($category);
        $min = str_contains($normalized, 'ambient') ? 15 : (str_contains($normalized, 'frozen') ? -20 : 2);
        $max = str_contains($normalized, 'ambient') ? 25 : (str_contains($normalized, 'frozen') ? -10 : 8);

        return ['min' => $min, 'max' => $max, 'midpoint' => ($min + $max) / 2];
    }

    private function shipmentStatus(string $status): string
    {
        return match ($status) {
            'Selesai' => 'Completed',
            'Karantina', 'Ditahan' => 'Excursion Detected',
            default => 'In Transit',
        };
    }

    private function defaultParameters(string $category, float $weight, float $temperature): array
    {
        $range = $this->rangeFor($category);

        return [
            'mass_kg' => $weight,
            'specific_heat_cp' => 3500,
            'conductance_ua' => 1.2,
            'h_product_air' => 2.4,
            'air_heat_capacity' => 2500,
            'ambient_temp_c' => 30,
            'cooling_capacity_w' => str_contains(Str::lower($category), 'ambient') ? 0 : 120,
            'cooling_efficiency' => 1,
            'tau_sensor' => 15,
            'sensor_bias' => 0,
            'target_setpoint_c' => $range['midpoint'],
            'hysteresis_margin_c' => 1,
            'door_open' => false,
            'power_available' => true,
            'air_temp_c' => $temperature,
            'product_temp_c' => $temperature,
            'sensor_temp_c' => $temperature,
            'cooling_active' => false,
            'elapsed_seconds' => 0,
        ];
    }

    private function thermalConfigAttributes(array $config): array
    {
        $fields = [
            'setpointC' => 'target_setpoint_c',
            'ambientC' => 'ambient_temp_c',
            'enclosureConductanceWPerK' => 'conductance_ua',
            'productSpecificHeatJPerKgK' => 'specific_heat_cp',
            'productConductanceWPerK' => 'h_product_air',
            'airHeatCapacityJPerK' => 'air_heat_capacity',
            'coolingCapacityW' => 'cooling_capacity_w',
            'coolingEfficiency' => 'cooling_efficiency',
            'sensorTimeConstantSeconds' => 'tau_sensor',
            'sensorOffsetC' => 'sensor_bias',
            'hysteresisC' => 'hysteresis_margin_c',
            'doorOpen' => 'door_open',
            'powerAvailable' => 'power_available',
        ];

        return collect($fields)
            ->filter(fn (string $column, string $key): bool => array_key_exists($key, $config))
            ->mapWithKeys(fn (string $column, string $key): array => [$column => $config[$key]])
            ->all();
    }

    private function thermalStateAttributes(array $state): array
    {
        $fields = [
            'airC' => 'air_temp_c',
            'productC' => 'product_temp_c',
            'sensorC' => 'sensor_temp_c',
            'coolingActive' => 'cooling_active',
            'elapsedSeconds' => 'elapsed_seconds',
        ];

        return collect($fields)
            ->filter(fn (string $column, string $key): bool => array_key_exists($key, $state))
            ->mapWithKeys(fn (string $column, string $key): array => [$column => $state[$key]])
            ->all();
    }
}
