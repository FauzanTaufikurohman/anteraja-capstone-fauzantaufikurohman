<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->string('category', 50);
            $table->decimal('min_temp_c', 4, 2);
            $table->decimal('max_temp_c', 4, 2);
            $table->timestamps();
        });

        Schema::create('shipments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained()->restrictOnDelete();
            $table->string('tracking_number', 50)->unique();
            $table->string('origin', 150);
            $table->string('destination', 150);
            $table->string('current_stage', 50)->default('Preparation');
            $table->string('status', 30)->default('In Transit');
            $table->timestamps();
            $table->index('product_id');
        });

        Schema::create('shipment_thermal_parameters', function (Blueprint $table) {
            $table->foreignUuid('shipment_id')->primary()->constrained()->cascadeOnDelete();
            $table->decimal('mass_kg', 6, 3)->default(0.500);
            $table->decimal('specific_heat_cp', 8, 2)->default(3800.00);
            $table->decimal('conductance_ua', 6, 2)->default(1.20);
            $table->decimal('h_product_air', 6, 2)->default(5.00);
            $table->decimal('air_heat_capacity', 10, 2)->default(2500.00);
            $table->decimal('ambient_temp_c', 5, 2)->default(30.00);
            $table->decimal('cooling_capacity_w', 8, 2)->default(120.00);
            $table->decimal('cooling_efficiency', 4, 2)->default(1.00);
            $table->decimal('tau_sensor', 6, 2)->default(15.00);
            $table->decimal('sensor_bias', 5, 2)->default(0.00);
            $table->decimal('target_setpoint_c', 5, 2)->default(5.00);
            $table->decimal('hysteresis_margin_c', 5, 2)->default(1.00);
            $table->boolean('door_open')->default(false);
            $table->boolean('power_available')->default(true);
            $table->decimal('air_temp_c', 5, 2)->default(5.00);
            $table->decimal('product_temp_c', 5, 2)->default(5.00);
            $table->decimal('sensor_temp_c', 5, 2)->default(5.00);
            $table->boolean('cooling_active')->default(false);
            $table->unsignedInteger('elapsed_seconds')->default(0);
            $table->timestamps();
        });

        Schema::create('transit_stage_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('shipment_id')->constrained()->cascadeOnDelete();
            $table->string('stage_name', 50);
            $table->timestamp('started_at')->useCurrent();
            $table->text('notes')->nullable();
            $table->index('shipment_id');
        });

        Schema::create('simulation_runs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('shipment_id')->constrained()->cascadeOnDelete();
            $table->timestamp('run_timestamp')->useCurrent();
            $table->unsignedInteger('total_steps')->default(600);
            $table->boolean('has_excursion')->default(false);
            $table->string('scenario_type', 50)->nullable();
            $table->json('parameters')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('simulation_time_series_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('simulation_run_id')->constrained('simulation_runs')->cascadeOnDelete();
            $table->unsignedInteger('step_seconds');
            $table->decimal('air_temp_c', 5, 2);
            $table->decimal('product_temp_c', 5, 2);
            $table->decimal('sensor_temp_c', 5, 2);
            $table->boolean('q_cooling_active')->default(false);
            $table->unique(['simulation_run_id', 'step_seconds']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('simulation_time_series_logs');
        Schema::dropIfExists('simulation_runs');
        Schema::dropIfExists('transit_stage_logs');
        Schema::dropIfExists('shipment_thermal_parameters');
        Schema::dropIfExists('shipments');
        Schema::dropIfExists('products');
    }
};