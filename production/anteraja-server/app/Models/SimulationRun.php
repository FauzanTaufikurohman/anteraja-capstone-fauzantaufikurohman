<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SimulationRun extends Model
{
    use HasUuids;

    protected $fillable = [
        'shipment_id',
        'run_timestamp',
        'total_steps',
        'has_excursion',
        'scenario_type',
        'parameters',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'run_timestamp' => 'immutable_datetime',
            'has_excursion' => 'boolean',
            'parameters' => 'array',
        ];
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function timeSeriesLogs(): HasMany
    {
        return $this->hasMany(SimulationTimeSeriesLog::class);
    }
}
