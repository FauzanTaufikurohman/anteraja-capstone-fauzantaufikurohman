<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SimulationTimeSeriesLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'simulation_run_id',
        'step_seconds',
        'air_temp_c',
        'product_temp_c',
        'sensor_temp_c',
        'q_cooling_active',
    ];

    protected function casts(): array
    {
        return ['q_cooling_active' => 'boolean'];
    }
}
