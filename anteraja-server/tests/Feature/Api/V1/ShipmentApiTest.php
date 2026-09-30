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
            'durationSeconds' => 60,
        ]);

        $response->assertCreated()->assertJsonPath('data.totalSteps', 60);
        $this->assertDatabaseHas('simulation_runs', [
            'total_steps' => 60,
            'scenario_type' => 'door-open',
        ]);
        $this->assertDatabaseCount('simulation_time_series_logs', 61);
    }

    public function test_simulation_preview_returns_backend_results_without_saving(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulations', [
            'disturbance' => 'door-open',
            'durationSeconds' => 60,
            'thermalConfig' => $this->shipmentPayload()['thermalConfig'],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.samples.0.elapsedSeconds', 0)
            ->assertJsonPath('data.samples.1.elapsedSeconds', 1)
            ->assertJsonPath('data.state.elapsedSeconds', 60)
            ->assertJsonPath('data.config.doorOpen', true);
        $this->assertDatabaseCount('simulation_runs', 0);
        $this->assertDatabaseHas('shipment_thermal_parameters', ['product_temp_c' => 5.5]);
    }

    public function test_backend_applies_the_requested_correction_before_simulating(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $config = $this->shipmentPayload()['thermalConfig'];
        $config['sensorOffsetC'] = 3;

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulations', [
            'disturbance' => 'sensor-drift',
            'durationSeconds' => 10,
            'correctDisturbance' => true,
            'thermalConfig' => $config,
            'thermalState' => [
                'airC' => 5.5,
                'productC' => 5.5,
                'sensorC' => 5.5,
                'coolingActive' => false,
                'elapsedSeconds' => 10,
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.config.sensorOffsetC', 0)
            ->assertJsonPath('data.state.elapsedSeconds', 20)
            ->assertJsonPath('data.correctionPlan', 'Kalibrasi sensor dengan suhu referensi; ini memperbaiki pembacaan, bukan suhu produk.');
    }

    public function test_monitoring_tick_executes_and_persists_five_seconds(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/thermal-ticks');

        $response->assertOk()
            ->assertJsonPath('data.thermalState.elapsedSeconds', 5);
        $this->assertDatabaseHas('shipment_thermal_parameters', ['elapsed_seconds' => 5]);
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
