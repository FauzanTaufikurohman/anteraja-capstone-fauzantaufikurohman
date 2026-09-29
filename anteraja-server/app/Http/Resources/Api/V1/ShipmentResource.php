<?php

namespace App\Http\Resources\Api\V1;

use App\Services\ShipmentService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShipmentResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $thermal = $this->thermalParameters;

        return [
            'id' => $this->tracking_number,
            'origin' => $this->origin,
            'destination' => $this->destination,
            'category' => $this->product->category,
            'weight' => (float) $thermal->mass_kg,
            'temperature' => (float) $thermal->product_temp_c,
            'status' => ShipmentService::statusLabel($this->current_stage),
            'updatedAt' => $this->updated_at?->toISOString(),
            'thermalConfig' => [
                'setpointC' => (float) $thermal->target_setpoint_c,
                'ambientC' => (float) $thermal->ambient_temp_c,
                'enclosureConductanceWPerK' => (float) $thermal->conductance_ua,
                'productSpecificHeatJPerKgK' => (float) $thermal->specific_heat_cp,
                'productConductanceWPerK' => (float) $thermal->h_product_air,
                'airHeatCapacityJPerK' => (float) $thermal->air_heat_capacity,
                'coolingCapacityW' => (float) $thermal->cooling_capacity_w,
                'coolingEfficiency' => (float) $thermal->cooling_efficiency,
                'sensorTimeConstantSeconds' => (float) $thermal->tau_sensor,
                'sensorOffsetC' => (float) $thermal->sensor_bias,
                'hysteresisC' => (float) $thermal->hysteresis_margin_c,
                'doorOpen' => $thermal->door_open,
                'powerAvailable' => $thermal->power_available,
            ],
            'thermalState' => [
                'airC' => (float) $thermal->air_temp_c,
                'productC' => (float) $thermal->product_temp_c,
                'sensorC' => (float) $thermal->sensor_temp_c,
                'coolingActive' => $thermal->cooling_active,
                'elapsedSeconds' => $thermal->elapsed_seconds,
            ],
        ];
    }
}
