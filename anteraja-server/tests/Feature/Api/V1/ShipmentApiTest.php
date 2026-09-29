<?php

namespace Tests\Feature\Api\V1;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShipmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_shipment_and_returns_frontend_contract(): void
    {
        $response = $this->postJson('/api/v1/shipments', $this->shipmentPayload());

        $response->assertCreated()
            ->assertJsonPath('data.id', 'DPSVA-TEST-001')
            ->assertJsonPath('data.thermalConfig.setpointC', 5);
        $this->assertDatabaseHas('shipments', [
            'tracking_number' => 'DPSVA-TEST-001',
            'origin' => 'APOTEK JAYA ABADI',
        ]);
        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'mass_kg' => 2.5,
            'product_temp_c' => 5.5,
        ]);
    }

    public function test_lists_shipments_in_the_frontend_resource_shape(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $this->getJson('/api/v1/shipments')
            ->assertOk()
            ->assertJsonPath('data.0.id', 'DPSVA-TEST-001')
            ->assertJsonPath('data.0.thermalState.productC', 5.5);
    }

    public function test_rejects_shipment_without_required_fields(): void
    {
        $response = $this->postJson('/api/v1/shipments', []);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['origin', 'destination', 'category', 'weight']);
        $this->assertDatabaseCount('shipments', 0);
    }

    public function test_updates_shipment_status_and_thermal_state(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $response = $this->patchJson('/api/v1/shipments/DPSVA-TEST-001', [
            'status' => 'Karantina',
            'thermalState' => [
                'airC' => 9.2,
                'productC' => 8.4,
                'sensorC' => 9.0,
                'coolingActive' => true,
                'elapsedSeconds' => 15,
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'Karantina')
            ->assertJsonPath('data.thermalState.productC', 8.4);
        $this->assertDatabaseHas('shipments', [
            'tracking_number' => 'DPSVA-TEST-001',
            'current_stage' => 'Quarantine',
        ]);
        $this->assertDatabaseHas('transit_stage_logs', ['stage_name' => 'Quarantine']);
    }

    public function test_persists_simulation_run_and_temperature_samples(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'door-open',
            'totalSteps' => 60,
            'hasExcursion' => true,
            'thermalConfig' => $this->shipmentPayload()['thermalConfig'],
            'thermalState' => [
                'airC' => 9,
                'productC' => 8.5,
                'sensorC' => 8.8,
                'coolingActive' => true,
                'elapsedSeconds' => 60,
            ],
            'samples' => [[
                'elapsedSeconds' => 60,
                'airC' => 9,
                'productC' => 8.5,
                'sensorC' => 8.8,
                'coolingActive' => true,
            ]],
        ]);

        $response->assertCreated()->assertJsonPath('data.totalSteps', 60);
        $this->assertDatabaseHas('simulation_runs', [
            'total_steps' => 60,
            'has_excursion' => true,
            'scenario_type' => 'door-open',
        ]);
        $this->assertDatabaseHas('simulation_time_series_logs', [
            'step_seconds' => 60,
            'product_temp_c' => 8.5,
        ]);
        $this->assertDatabaseHas('shipment_thermal_parameters', ['product_temp_c' => 8.5]);
    }

    private function shipmentPayload(): array
    {
        return [
            'id' => 'DPSVA-TEST-001',
            'origin' => 'APOTEK JAYA ABADI',
            'destination' => 'APOTEK MANDIRI',
            'category' => 'Cold chain',
            'weight' => 2.5,
            'temperature' => 5.5,
            'status' => 'Dalam persiapan',
            'thermalConfig' => [
                'setpointC' => 5,
                'ambientC' => 30,
                'enclosureConductanceWPerK' => 1.2,
                'productSpecificHeatJPerKgK' => 3500,
                'productConductanceWPerK' => 2.4,
                'airHeatCapacityJPerK' => 2500,
                'coolingCapacityW' => 120,
                'coolingEfficiency' => 1,
                'sensorTimeConstantSeconds' => 15,
                'sensorOffsetC' => 0,
                'hysteresisC' => 1,
                'doorOpen' => false,
                'powerAvailable' => true,
            ],
            'thermalState' => [
                'airC' => 5.5,
                'productC' => 5.5,
                'sensorC' => 5.5,
                'coolingActive' => false,
                'elapsedSeconds' => 0,
            ],
        ];
    }
}
