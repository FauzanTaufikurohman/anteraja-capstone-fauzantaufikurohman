<?php

use App\Http\Controllers\Api\V1\ShipmentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::apiResource('shipments', ShipmentController::class);
    Route::post('shipments/{shipment}/simulation-runs', [ShipmentController::class, 'storeSimulation']);
});
