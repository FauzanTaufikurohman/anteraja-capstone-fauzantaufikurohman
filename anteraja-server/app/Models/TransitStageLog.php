<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransitStageLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['shipment_id', 'stage_name', 'started_at', 'notes'];

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime'];
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }
}
