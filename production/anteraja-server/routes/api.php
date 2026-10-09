<?php

use App\Http\Controllers\Api\V1\ShipmentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::apiResource('shipments', ShipmentController::class);
    Route::post('shipments/{shipment}/simulations', [ShipmentController::class, 'previewSimulation']);
    Route::post('shipments/{shipment}/simulation-runs', [ShipmentController::class, 'storeSimulation']);
    Route::post('shipments/{shipment}/corrective-simulations', [ShipmentController::class, 'previewCorrectiveSimulation']);
    Route::post('shipments/{shipment}/corrective-simulation-runs', [ShipmentController::class, 'storeCorrectiveSimulation']);
    Route::post('shipments/{shipment}/thermal-ticks', [ShipmentController::class, 'advanceThermal']);
    Route::get('shipments/{shipment}/simulation-history', [ShipmentController::class, 'simulationHistory']);
    Route::get('shipments/{shipment}/simulation-history/{run}', [ShipmentController::class, 'simulationHistoryRun']);
});
