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
            'totalSteps' => ['required', 'integer', 'min:1', 'max:28800'],
            'hasExcursion' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'thermalConfig' => ['required', 'array'],
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
            'thermalState' => ['required', 'array'],
            'thermalState.airC' => ['required', 'numeric', 'between:-100,200'],
            'thermalState.productC' => ['required', 'numeric', 'between:-100,200'],
            'thermalState.sensorC' => ['required', 'numeric', 'between:-100,200'],
            'thermalState.coolingActive' => ['required', 'boolean'],
            'thermalState.elapsedSeconds' => ['required', 'integer', 'min:0'],
            'samples' => ['required', 'array', 'min:1', 'max:500'],
            'samples.*.elapsedSeconds' => ['required', 'integer', 'min:0'],
            'samples.*.airC' => ['required', 'numeric', 'between:-100,200'],
            'samples.*.productC' => ['required', 'numeric', 'between:-100,200'],
            'samples.*.sensorC' => ['required', 'numeric', 'between:-100,200'],
            'samples.*.coolingActive' => ['required', 'boolean'],
        ];
    }
}