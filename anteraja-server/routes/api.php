<?php

use App\Http\Controllers\Api\V1\ShipmentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::apiResource('shipments', ShipmentController::class);
    Route::post('shipments/{shipment}/simulations', [ShipmentController::class, 'previewSimulation']);
    Route::post('shipments/{shipment}/simulation-runs', [ShipmentController::class, 'storeSimulation']);
    Route::post('shipments/{shipment}/thermal-ticks', [ShipmentController::class, 'advanceThermal']);
});
