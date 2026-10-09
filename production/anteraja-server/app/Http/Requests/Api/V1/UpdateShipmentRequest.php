<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateShipmentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'origin' => ['sometimes', 'string', 'max:150'],
            'destination' => ['sometimes', 'string', 'max:150'],
            'category' => ['sometimes', 'string', 'max:50'],
            'weight' => ['sometimes', 'numeric', 'gt:0', 'max:999.999'],
            'temperature' => ['sometimes', 'numeric', 'between:-100,200'],
            'status' => ['sometimes', 'string', 'in:Dalam persiapan,Siap dikirim,Dalam pengantaran,Ditahan,Karantina,Selesai'],
            'thermalConfig' => ['sometimes', 'array'],
            'thermalConfig.setpointC' => ['sometimes', 'numeric', 'between:-100,200'],
            'thermalConfig.ambientC' => ['sometimes', 'numeric', 'between:-100,200'],
            'thermalConfig.enclosureConductanceWPerK' => ['sometimes', 'numeric', 'min:0'],
            'thermalConfig.productSpecificHeatJPerKgK' => ['sometimes', 'numeric', 'gt:0'],
            'thermalConfig.productConductanceWPerK' => ['sometimes', 'numeric', 'min:0'],
            'thermalConfig.airHeatCapacityJPerK' => ['sometimes', 'numeric', 'gt:0'],
            'thermalConfig.coolingCapacityW' => ['sometimes', 'numeric', 'min:0'],
            'thermalConfig.coolingEfficiency' => ['sometimes', 'numeric', 'between:0,1'],
            'thermalConfig.sensorTimeConstantSeconds' => ['sometimes', 'numeric', 'gt:0'],
            'thermalConfig.sensorOffsetC' => ['sometimes', 'numeric', 'between:-100,100'],
            'thermalConfig.hysteresisC' => ['sometimes', 'numeric', 'min:0'],
            'thermalConfig.doorOpen' => ['sometimes', 'boolean'],
            'thermalConfig.powerAvailable' => ['sometimes', 'boolean'],
            'thermalState' => ['sometimes', 'array'],
            'thermalState.airC' => ['sometimes', 'numeric', 'between:-100,200'],
            'thermalState.productC' => ['sometimes', 'numeric', 'between:-100,200'],
            'thermalState.sensorC' => ['sometimes', 'numeric', 'between:-100,200'],
            'thermalState.coolingActive' => ['sometimes', 'boolean'],
            'thermalState.elapsedSeconds' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
