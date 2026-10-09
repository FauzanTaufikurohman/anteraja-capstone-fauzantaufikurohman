<?php

namespace App\Models;

use App\Support\ShipmentListCache;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;

class Shipment extends Model
{
    use HasUuids;

    protected static function booted(): void
    {
        static::saved(static function (): void {
            DB::afterCommit(static fn () => ShipmentListCache::invalidate());
        });
        static::deleted(static function (): void {
            DB::afterCommit(static fn () => ShipmentListCache::invalidate());
        });
    }

    protected $fillable = [
        'product_id',
        'tracking_number',
        'origin',
        'destination',
        'current_stage',
        'status',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function thermalParameters(): HasOne
    {
        return $this->hasOne(ShipmentThermalParameter::class);
    }

    public function transitStageLogs(): HasMany
    {
        return $this->hasMany(TransitStageLog::class);
    }

    public function simulationRuns(): HasMany
    {
        return $this->hasMany(SimulationRun::class);
    }
}
