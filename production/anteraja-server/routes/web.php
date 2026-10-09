<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => 'Anteraja Pharma API',
        'version' => 'v1',
        'status' => 'ok',
    ]);
});
