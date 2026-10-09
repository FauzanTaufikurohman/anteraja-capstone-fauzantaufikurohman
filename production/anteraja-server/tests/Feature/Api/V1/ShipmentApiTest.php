<?php

namespace Tests\Feature\Api\V1;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ShipmentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'cache.shipment_list_store' => 'array',
            'cache.stores.array' => ['driver' => 'array', 'serialize' => false],
        ]);
    }

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
            ->assertHeader('Server-Timing')
            ->assertHeader('X-DB-Query-Count')
            ->assertJsonPath('data.0.id', 'DPSVA-TEST-001')
            ->assertJsonPath('data.0.thermalState.productC', 5.5)
            ->assertJsonPath('data.0.activeDisturbance', null);
    }

    public function test_server_side_listing_filters_orders_and_paginates_shipments(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $secondShipment = $this->shipmentPayload();
        $secondShipment['id'] = 'DPSVA-TEST-002';
        $secondShipment['destination'] = 'APOTEK SEJAHTERA';
        $this->postJson('/api/v1/shipments', $secondShipment)->assertCreated();

        $this->getJson('/api/v1/shipments?draw=7&start=0&length=1&search%5Bvalue%5D=SEJAHTERA&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc')
            ->assertOk()
            ->assertJsonPath('draw', 7)
            ->assertJsonPath('recordsTotal', 2)
            ->assertJsonPath('recordsFiltered', 1)
            ->assertJsonPath('data.0.id', 'DPSVA-TEST-002');

        $this->getJson('/api/v1/shipments?draw=8&search%5Bvalue%5D=Dalam%20persiapan')
            ->assertOk()
            ->assertJsonPath('recordsFiltered', 2);
    }

    public function test_server_side_listing_cache_is_invalidated_after_shipment_creation(): void
    {
        config(['cache.shipment_list_store' => 'database']);
        config(['cache.serializable_classes' => false]);

        $url = '/api/v1/shipments?start=0&length=10';
        $this->getJson($url.'&draw=1')
            ->assertOk()
            ->assertJsonPath('recordsTotal', 0);

        $this->getJson($url.'&draw=2')
            ->assertOk()
            ->assertJsonPath('recordsTotal', 0)
            ->assertJsonPath('data', []);

        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $this->getJson($url.'&draw=3')
            ->assertOk()
            ->assertJsonPath('recordsTotal', 1)
            ->assertJsonPath('data.0.id', 'DPSVA-TEST-001');
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

    public function test_temperature_excursion_holds_shipment_and_restores_its_previous_stage(): void
    {
        $payload = $this->shipmentPayload();
        $payload['status'] = 'Dalam pengantaran';
        $payload['thermalConfig']['coolingCapacityW'] = 0;
        $payload['thermalConfig']['powerAvailable'] = false;
        $payload['thermalState']['airC'] = 30;
        $payload['thermalState']['productC'] = 7.99;
        $payload['thermalState']['sensorC'] = 7.99;
        $this->postJson('/api/v1/shipments', $payload)
            ->assertCreated()
            ->assertJsonPath('data.status', 'Dalam pengantaran');

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/thermal-ticks')
            ->assertOk()
            ->assertJsonPath('data.status', 'Ditahan');
        $this->assertDatabaseHas('shipments', [
            'tracking_number' => 'DPSVA-TEST-001',
            'current_stage' => 'Held',
        ]);

        $this->patchJson('/api/v1/shipments/DPSVA-TEST-001', [
            'thermalState' => [
                'airC' => 5.5,
                'productC' => 5.5,
                'sensorC' => 5.5,
                'coolingActive' => false,
                'elapsedSeconds' => 5,
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Dalam pengantaran');
        $this->assertDatabaseHas('shipments', [
            'tracking_number' => 'DPSVA-TEST-001',
            'current_stage' => 'In Transit',
        ]);
    }

    public function test_saved_excursion_simulation_returns_the_automatic_hold_status(): void
    {
        $payload = $this->shipmentPayload();
        $payload['status'] = 'Dalam pengantaran';
        $payload['thermalConfig']['coolingCapacityW'] = 0;
        $payload['thermalConfig']['powerAvailable'] = false;
        $payload['thermalState']['airC'] = 30;
        $payload['thermalState']['productC'] = 7.99;
        $payload['thermalState']['sensorC'] = 7.99;
        $this->postJson('/api/v1/shipments', $payload)->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'none',
            'durationSeconds' => 5,
            'thermalConfig' => $payload['thermalConfig'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'Ditahan');
    }

    public function test_simulation_history_includes_saved_disturbance_and_corrective_samples_with_timestamps(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $disturbance = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 1,
        ])->assertCreated();
        $correction = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 1,
            'thermalConfig' => ['powerAvailable' => true],
        ])->assertCreated();

        $this->getJson('/api/v1/shipments/DPSVA-TEST-001/simulation-history')
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonFragment([
                'id' => $disturbance->json('data.id'),
                'scenarioType' => 'power-loss',
            ])
            ->assertJsonFragment([
                'id' => $correction->json('data.id'),
                'scenarioType' => 'corrective-power-loss',
            ]);

        $detail = $this->getJson(
            "/api/v1/shipments/DPSVA-TEST-001/simulation-history/{$disturbance->json('data.id')}",
        );
        $runTimestamp = $detail
            ->assertOk()
            ->assertJsonPath('data.samples.0.elapsedSeconds', 0)
            ->assertJsonPath('data.samples.1.elapsedSeconds', 1)
            ->json('data.runTimestamp');

        $detail
            ->assertJsonPath(
                'data.samples.1.timestamp',
                Carbon::parse($runTimestamp)->addSecond()->toISOString(),
            );

        $this->getJson(
            "/api/v1/shipments/DPSVA-TEST-001/simulation-history/{$correction->json('data.id')}",
        )
            ->assertOk()
            ->assertJsonPath('data.baseline.id', $disturbance->json('data.id'))
            ->assertJsonPath('data.baseline.scenarioType', 'power-loss');
    }

    public function test_metadata_edit_preserves_disturbance_until_thermal_config_changes(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
        ])->assertCreated();

        $thermalConfig = $this->shipmentPayload()['thermalConfig'];
        $thermalConfig['powerAvailable'] = false;
        $this->patchJson('/api/v1/shipments/DPSVA-TEST-001', [
            'origin' => 'APOTEK BARU',
            'thermalConfig' => $thermalConfig,
        ])->assertOk();

        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => 'power-loss',
        ]);

        $this->patchJson('/api/v1/shipments/DPSVA-TEST-001', [
            'thermalConfig' => ['setpointC' => 6],
        ])->assertOk();

        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => null,
        ]);
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
        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => 'door-open',
        ]);
        $this->assertDatabaseCount('simulation_time_series_logs', 61);
    }

    public function test_simulation_preview_returns_backend_results_without_saving(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulations', [
            'disturbance' => 'door-open',
            'durationSeconds' => 60,
            'correctDisturbance' => true,
            'thermalConfig' => $this->shipmentPayload()['thermalConfig'],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.samples.0.elapsedSeconds', 0)
            ->assertJsonPath('data.samples.1.elapsedSeconds', 1)
            ->assertJsonPath('data.state.elapsedSeconds', 60)
            ->assertJsonPath('data.config.doorOpen', true)
            ->assertJsonPath('data.initialState.productC', 5.5);
        $this->assertDatabaseCount('simulation_runs', 0);
        $this->assertDatabaseHas('shipment_thermal_parameters', ['product_temp_c' => 5.5]);
    }

    public function test_backend_applies_the_requested_correction_before_simulating(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'sensor-drift',
            'durationSeconds' => 10,
        ])->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'sensor-drift',
            'durationSeconds' => 10,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.config.sensorOffsetC', 0)
            ->assertJsonPath('data.initialState.productC', 15)
            ->assertJsonPath('data.state.elapsedSeconds', 20)
            ->assertJsonPath('data.recommendedSetpointC', 5)
            ->assertJsonPath('data.recommendedCoolingCapacityW', 50);
        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => 'sensor-drift',
        ]);
    }

    public function test_corrective_preview_uses_saved_state_and_applies_user_thermal_config(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
        ])->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
            'thermalConfig' => [
                'setpointC' => 6,
                'coolingCapacityW' => 200,
            ],
            'thermalState' => [
                'airC' => 100,
                'productC' => 100,
                'sensorC' => 100,
                'coolingActive' => false,
                'elapsedSeconds' => 900,
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.config.setpointC', 6)
            ->assertJsonPath('data.config.coolingCapacityW', 200)
            ->assertJsonPath('data.state.elapsedSeconds', 20)
            ->assertJsonPath('data.config.powerAvailable', true);
    }

    public function test_corrective_preview_reports_when_product_core_returns_to_range(): void
    {
        $payload = $this->shipmentPayload();
        $payload['temperature'] = 15;
        $payload['thermalState'] = [
            'airC' => 15,
            'productC' => 15,
            'sensorC' => 15,
            'coolingActive' => false,
            'elapsedSeconds' => 0,
        ];
        $this->postJson('/api/v1/shipments', $payload)->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'door-open',
            'durationSeconds' => 1800,
        ])->assertCreated();

        $response = $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'door-open',
            'durationSeconds' => 7200,
            'thermalConfig' => [
                'setpointC' => 5,
                'coolingCapacityW' => 120,
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.recoverySeconds', 4689)
            ->assertJsonPath('data.initialState.productC', 15)
            ->assertJsonPath('data.state.productC', 6.445498090839683)
            ->assertJsonPath('data.recommendedSetpointC', 5)
            ->assertJsonPath('data.recommendedCoolingCapacityW', 50)
            ->assertJsonPath('data.coolingRecommendationMessage', 'Estimasi model: daya minimum sekitar 50 W untuk mencapai rentang pada setpoint dan durasi ini. Verifikasi kemampuan unit pendingin di lapangan.');
    }

    public function test_cooling_recommendation_explains_when_product_is_below_minimum(): void
    {
        $payload = $this->shipmentPayload();
        $payload['temperature'] = -15;
        $payload['thermalState'] = [
            'airC' => -15,
            'productC' => -15,
            'sensorC' => -15,
            'coolingActive' => false,
            'elapsedSeconds' => 0,
        ];
        $this->postJson('/api/v1/shipments', $payload)->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 60,
        ])->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 3600,
            'thermalConfig' => [
                'setpointC' => 5,
                'coolingCapacityW' => 120,
            ],
        ])->assertOk()
            ->assertJsonPath('data.recommendedCoolingCapacityW', null)
            ->assertJsonPath('data.coolingRecommendationMessage', 'Suhu inti berada di bawah rentang. Menambah daya pendingin tidak dapat menghangatkan produk; model ini belum mencakup pemanas.');
    }

    public function test_corrective_preview_requires_matching_saved_disturbance(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'door-open',
            'durationSeconds' => 60,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['disturbance']);

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
        ])->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulations', [
            'disturbance' => 'door-open',
            'durationSeconds' => 60,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['disturbance']);
    }

    public function test_saving_corrective_run_clears_active_disturbance(): void
    {
        $this->postJson('/api/v1/shipments', $this->shipmentPayload())->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
        ])->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulation-runs', [
            'disturbance' => 'power-loss',
            'durationSeconds' => 10,
        ])->assertCreated();

        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => null,
            'power_available' => true,
        ]);
        $this->assertDatabaseCount('simulation_runs', 2);
        $this->assertDatabaseHas('simulation_runs', [
            'scenario_type' => 'corrective-power-loss',
        ]);
    }

    public function test_corrective_run_cannot_be_saved_while_product_is_out_of_range(): void
    {
        $payload = $this->shipmentPayload();
        $payload['temperature'] = 15;
        $payload['thermalState'] = [
            'airC' => 15,
            'productC' => 15,
            'sensorC' => 15,
            'coolingActive' => false,
            'elapsedSeconds' => 0,
        ];
        $this->postJson('/api/v1/shipments', $payload)->assertCreated();
        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/simulation-runs', [
            'disturbance' => 'door-open',
            'durationSeconds' => 10,
        ])->assertCreated();

        $this->postJson('/api/v1/shipments/DPSVA-TEST-001/corrective-simulation-runs', [
            'disturbance' => 'door-open',
            'durationSeconds' => 60,
            'thermalConfig' => [
                'setpointC' => 5,
                'coolingCapacityW' => 0,
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['thermalState']);

        $this->assertDatabaseCount('simulation_runs', 1);
        $this->assertDatabaseHas('shipment_thermal_parameters', [
            'shipment_id' => $this->shipmentPayload()['id'],
            'active_disturbance' => 'door-open',
        ]);
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
