<?php

namespace App\Models;

use App\Support\ShipmentListCache;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class ShipmentThermalParameter extends Model
{
    protected static function booted(): void
    {
        static::saved(static function (): void {
            DB::afterCommit(static fn () => ShipmentListCache::invalidate());
        });
        static::deleted(static function (): void {
            DB::afterCommit(static fn () => ShipmentListCache::invalidate());
        });
    }

    protected $primaryKey = 'shipment_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
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
    ];

    protected function casts(): array
    {
        return [
            'door_open' => 'boolean',
            'power_available' => 'boolean',
            'cooling_active' => 'boolean',
            'elapsed_seconds' => 'integer',
        ];
    }
}
