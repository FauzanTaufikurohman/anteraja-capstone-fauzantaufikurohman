<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreShipmentRequest;
use App\Http\Requests\Api\V1\StoreSimulationRunRequest;
use App\Http\Requests\Api\V1\UpdateShipmentRequest;
use App\Http\Resources\Api\V1\ShipmentResource;
use App\Services\ShipmentService;
use App\Services\SimulationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ShipmentController extends Controller
{
    public function __construct(
        private ShipmentService $shipments,
        private SimulationService $simulations,
    ) {}

    public function index(): AnonymousResourceCollection
    {
        return ShipmentResource::collection($this->shipments->list());
    }

    public function store(StoreShipmentRequest $request): JsonResponse
    {
        return (new ShipmentResource($this->shipments->create($request->validated())))
            ->response()
            ->setStatusCode(201);
    }

    public function show(string $shipment): ShipmentResource
    {
        return new ShipmentResource($this->shipments->find($shipment));
    }

    public function update(UpdateShipmentRequest $request, string $shipment): ShipmentResource
    {
        return new ShipmentResource($this->shipments->update($shipment, $request->validated()));
    }

    public function destroy(string $shipment): JsonResponse
    {
        $this->shipments->find($shipment)->delete();

        return response()->json(status: 204);
    }

    public function storeSimulation(StoreSimulationRunRequest $request, string $shipment): JsonResponse
    {
        $run = $this->simulations->create($shipment, $request->validated());

        return response()->json([
            'data' => [
                'id' => $run->id,
                'shipmentId' => $shipment,
                'totalSteps' => $run->total_steps,
                'hasExcursion' => $run->has_excursion,
            ],
        ], 201);
    }
}
