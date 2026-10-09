<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'category', 'min_temp_c', 'max_temp_c'];

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }
}
