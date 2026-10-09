<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreSimulationRunRequest extends FormRequest
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
            'disturbance' => ['required', 'string', 'in:none,door-open,power-loss,sensor-drift,weak-cooling'],
            'durationSeconds' => ['required', 'integer', 'min:1', 'max:28800'],
            'correctDisturbance' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
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
            'thermalState.airC' => ['required_with:thermalState', 'numeric', 'between:-100,200'],
            'thermalState.productC' => ['required_with:thermalState', 'numeric', 'between:-100,200'],
            'thermalState.sensorC' => ['required_with:thermalState', 'numeric', 'between:-100,200'],
            'thermalState.coolingActive' => ['required_with:thermalState', 'boolean'],
            'thermalState.elapsedSeconds' => ['required_with:thermalState', 'integer', 'min:0'],
        ];
    }
}
