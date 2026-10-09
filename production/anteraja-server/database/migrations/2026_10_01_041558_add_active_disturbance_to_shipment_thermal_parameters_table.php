<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('shipment_thermal_parameters', function (Blueprint $table) {
            $table->string('active_disturbance', 50)->nullable()->after('elapsed_seconds');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('shipment_thermal_parameters', function (Blueprint $table) {
            $table->dropColumn('active_disturbance');
        });
    }
};
