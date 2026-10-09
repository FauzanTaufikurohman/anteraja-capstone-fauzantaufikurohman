<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Shipment;
use App\Models\ShipmentThermalParameter;
use Illuminate\Database\Eloquent\Builder;
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

    private const TEMPERATURE_HOLD_NOTE_PREFIX = 'automatic-temperature-hold;previous-stage=';

    public function list(): Collection
    {
        return $this->shipmentQuery()
            ->latest('shipments.created_at')
            ->get()
            ->map(fn (Shipment $shipment): Shipment => $this->attachReadRelations($shipment));
    }

    public function serverSideList(array $parameters): array
    {
        $search = trim($parameters['search'] ?? '');
        $start = (int) ($parameters['start'] ?? 0);
        $length = (int) ($parameters['length'] ?? 25);
        $sortColumns = [
            0 => 'shipments.tracking_number',
            1 => 'shipments.origin',
            2 => 'shipments.destination',
            3 => 'products.category',
            4 => 'shipments.current_stage',
            5 => 'shipments.updated_at',
        ];
        $orderColumn = $parameters['orderColumn'] ?? null;
        $orderDirection = ($parameters['orderDirection'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $query = $this->shipmentQuery();
        $recordsTotal = (clone $query)->count('shipments.id');

        if ($search !== '') {
            $like = '%'.Str::lower($search).'%';
            $query->where(function (Builder $query) use ($like): void {
                $columns = [
                    'shipments.tracking_number',
                    'shipments.origin',
                    'shipments.destination',
                    'products.category',
                    'shipments.current_stage',
                ];
                $query->whereRaw("LOWER({$columns[0]}) LIKE ?", [$like]);

                foreach (array_slice($columns, 1) as $column) {
                    $query->orWhereRaw("LOWER({$column}) LIKE ?", [$like]);
                }

                $query->orWhereRaw(
                    "LOWER(CASE shipments.current_stage
                        WHEN 'Preparation' THEN 'Dalam persiapan'
                        WHEN 'Loading' THEN 'Siap dikirim'
                        WHEN 'In Transit' THEN 'Dalam pengantaran'
                        WHEN 'Held' THEN 'Ditahan'
                        WHEN 'Quarantine' THEN 'Karantina'
                        WHEN 'Delivered' THEN 'Selesai'
                        ELSE shipments.current_stage
                    END) LIKE ?",
                    [$like],
                );
            });
        }

        $recordsFiltered = $search === ''
            ? $recordsTotal
            : (clone $query)->count('shipments.id');

        if (isset($sortColumns[$orderColumn])) {
            $query->orderBy($sortColumns[$orderColumn], $orderDirection);
        } else {
            $query->orderByDesc('shipments.created_at');
        }

        $shipments = $query
            ->orderByDesc('shipments.id')
            ->offset($start)
            ->limit($length)
            ->get()
            ->map(fn (Shipment $shipment): Shipment => $this->attachReadRelations($shipment));

        return [
            'recordsTotal' => $recordsTotal,
            'recordsFiltered' => $recordsFiltered,
            'data' => $shipments,
        ];
    }

    public function find(string $trackingNumber): Shipment
    {
        $shipment = $this->shipmentQuery()
            ->where('tracking_number', $trackingNumber)
            ->firstOrFail();

        return $this->attachReadRelations($shipment);
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
            $this->syncTemperatureStage($shipment);

            return $this->find($shipment->tracking_number);
        });
    }

    public function update(string $trackingNumber, array $data): Shipment
    {
        return DB::transaction(function () use ($trackingNumber, $data): Shipment {
            $shipment = $this->find($trackingNumber);
            $categoryChanged = array_key_exists('category', $data)
                && $shipment->product->category !== $data['category'];
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

            $this->updateThermalData($shipment, $data, $categoryChanged);

            return $shipment;
        });
    }

    public function updateThermalData(Shipment $shipment, array $data, bool $categoryChanged = false): void
    {
        $parameters = $shipment->thermalParameters;
        $attributes = [];
        $resetActiveDisturbance = $categoryChanged;

        if (array_key_exists('weight', $data)) {
            $attributes['mass_kg'] = $data['weight'];
            $resetActiveDisturbance = $resetActiveDisturbance
                || (float) $parameters->mass_kg !== (float) $data['weight'];
        }

        if (array_key_exists('thermalConfig', $data)) {
            $configAttributes = $this->thermalConfigAttributes($data['thermalConfig']);
            $resetActiveDisturbance = $resetActiveDisturbance
                || $this->thermalConfigurationChanged($parameters, $configAttributes);
            $attributes = array_merge($attributes, $configAttributes);
        }

        if (array_key_exists('thermalState', $data)) {
            $attributes = array_merge($attributes, $this->thermalStateAttributes($data['thermalState']));
        }

        if (array_key_exists('temperature', $data) && ! array_key_exists('thermalState', $data)) {
            $attributes['product_temp_c'] = $data['temperature'];
        }

        if ($resetActiveDisturbance) {
            $attributes['active_disturbance'] = null;
        }

        if (array_key_exists('activeDisturbance', $data)) {
            $attributes['active_disturbance'] = $data['activeDisturbance'];
        }

        if ($attributes !== []) {
            $parameters->update($attributes);
            $shipment->touch();
        }

        $this->syncTemperatureStage($shipment);
    }

    private function syncTemperatureStage(Shipment $shipment): void
    {
        $temperature = (float) $shipment->thermalParameters->product_temp_c;
        $outsideRange = $temperature < (float) $shipment->product->min_temp_c
            || $temperature > (float) $shipment->product->max_temp_c;

        if ($outsideRange) {
            if (in_array($shipment->current_stage, ['Held', 'Quarantine', 'Delivered'], true)) {
                return;
            }

            $previousStage = $shipment->current_stage;
            $shipment->update([
                'current_stage' => 'Held',
                'status' => 'Excursion Detected',
            ]);
            $shipment->transitStageLogs()->create([
                'stage_name' => 'Held',
                'notes' => self::TEMPERATURE_HOLD_NOTE_PREFIX.$previousStage,
            ]);

            return;
        }

        if ($shipment->current_stage !== 'Held') {
            return;
        }

        $holdLog = $shipment->transitStageLogs()
            ->where('stage_name', 'Held')
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->first();
        $notes = (string) ($holdLog?->notes ?? '');
        if (! str_starts_with($notes, self::TEMPERATURE_HOLD_NOTE_PREFIX)) {
            return;
        }

        $previousStage = substr($notes, strlen(self::TEMPERATURE_HOLD_NOTE_PREFIX));
        if (! array_key_exists($previousStage, self::STAGE_TO_STATUS)) {
            return;
        }

        $status = self::STAGE_TO_STATUS[$previousStage];
        $shipment->update([
            'current_stage' => $previousStage,
            'status' => $this->shipmentStatus($status),
        ]);
        $shipment->transitStageLogs()->create(['stage_name' => $previousStage]);
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

    private function shipmentQuery(): Builder
    {
        $thermalColumns = [
            'shipment_id',
            'mass_kg',
            'specific_heat_cp',
            'conductance_ua',
            'h_product_air',
            'air_heat_capacity',
            'ambient_temp_c',
            'cooling_capacity_w',
            'cooling_efficiency',
            'tau_sensor',
            'sensor_bias',
            'target_setpoint_c',
            'hysteresis_margin_c',
            'door_open',
            'power_available',
            'air_temp_c',
            'product_temp_c',
            'sensor_temp_c',
            'cooling_active',
            'elapsed_seconds',
            'active_disturbance',
            'created_at',
            'updated_at',
        ];

        return Shipment::query()
            ->join('products', 'products.id', '=', 'shipments.product_id')
            ->join('shipment_thermal_parameters as thermal_parameters', 'thermal_parameters.shipment_id', '=', 'shipments.id')
            ->select([
                'shipments.*',
                'products.category as eager_product_category',
                'products.min_temp_c as eager_product_min_temp_c',
                'products.max_temp_c as eager_product_max_temp_c',
            ])
            ->addSelect(array_map(
                fn (string $column): string => "thermal_parameters.{$column} as eager_thermal_{$column}",
                $thermalColumns,
            ));
    }

    private function attachReadRelations(Shipment $shipment): Shipment
    {
        $thermalAttributes = [];

        foreach (
            [
                'shipment_id',
                'mass_kg',
                'specific_heat_cp',
                'conductance_ua',
                'h_product_air',
                'air_heat_capacity',
                'ambient_temp_c',
                'cooling_capacity_w',
                'cooling_efficiency',
                'tau_sensor',
                'sensor_bias',
                'target_setpoint_c',
                'hysteresis_margin_c',
                'door_open',
                'power_available',
                'air_temp_c',
                'product_temp_c',
                'sensor_temp_c',
                'cooling_active',
                'elapsed_seconds',
                'active_disturbance',
                'created_at',
                'updated_at',
            ] as $column
        ) {
            $thermalAttributes[$column] = $shipment->getAttribute("eager_thermal_{$column}");
        }

        $shipment->setRelation('product', (new Product)->newFromBuilder([
            'category' => $shipment->getAttribute('eager_product_category'),
            'min_temp_c' => $shipment->getAttribute('eager_product_min_temp_c'),
            'max_temp_c' => $shipment->getAttribute('eager_product_max_temp_c'),
        ]));
        $shipment->setRelation('thermalParameters', (new ShipmentThermalParameter)->newFromBuilder($thermalAttributes));

        return $shipment;
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

    private function thermalConfigurationChanged(ShipmentThermalParameter $parameters, array $attributes): bool
    {
        foreach ($attributes as $column => $value) {
            $current = $parameters->getAttribute($column);
            $changed = is_numeric($current) && is_numeric($value)
                ? (float) $current !== (float) $value
                : $current !== $value;

            if ($changed) {
                return true;
            }
        }

        return false;
    }
}
