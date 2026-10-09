<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreShipmentRequest;
use App\Http\Requests\Api\V1\StoreSimulationRunRequest;
use App\Http\Requests\Api\V1\UpdateShipmentRequest;
use App\Http\Resources\Api\V1\ShipmentResource;
use App\Models\SimulationRun;
use App\Services\ShipmentService;
use App\Services\SimulationService;
use App\Support\ShipmentListCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
    public function __construct(
        private ShipmentService $shipments,
        private SimulationService $simulations,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = $request->query();
        $parameters = $request->validate([
            'draw' => ['sometimes', 'integer', 'min:0'],
            'start' => ['sometimes', 'integer', 'min:0'],
            'length' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'array'],
            'search.value' => ['sometimes', 'string', 'max:200'],
            'order' => ['sometimes', 'array', 'max:1'],
            'order.0.column' => ['sometimes', 'integer', 'between:0,5'],
            'order.0.dir' => ['sometimes', 'in:asc,desc'],
        ]);
        $parameters = [
            'search' => $parameters['search']['value'] ?? '',
            'start' => $parameters['start'] ?? 0,
            'length' => $parameters['length'] ?? 25,
            'orderColumn' => $parameters['order'][0]['column'] ?? null,
            'orderDirection' => $parameters['order'][0]['dir'] ?? 'desc',
        ];
        $cacheParameters = $parameters;
        unset($cacheParameters['draw']);

        $result = ShipmentListCache::remember($cacheParameters, function () use ($parameters, $request): array {
            $result = $this->shipments->serverSideList($parameters);

            return [
                'recordsTotal' => $result['recordsTotal'],
                'recordsFiltered' => $result['recordsFiltered'],
                'data' => ShipmentResource::collection($result['data'])->resolve($request),
            ];
        });

        return response()->json([
            'draw' => (int) ($query['draw'] ?? 0),
            'recordsTotal' => $result['recordsTotal'],
            'recordsFiltered' => $result['recordsFiltered'],
            'data' => $result['data'],
        ]);
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

    public function previewSimulation(StoreSimulationRunRequest $request, string $shipment): JsonResponse
    {
        return response()->json([
            'data' => $this->simulations->preview($shipment, $request->validated()),
        ]);
    }

    public function previewCorrectiveSimulation(StoreSimulationRunRequest $request, string $shipment): JsonResponse
    {
        return response()->json([
            'data' => $this->simulations->previewCorrective($shipment, $request->validated()),
        ]);
    }

    public function storeSimulation(StoreSimulationRunRequest $request, string $shipment): JsonResponse
    {
        $run = $this->simulations->create($shipment, $request->validated());

        return $this->simulationRunResponse($run, $shipment);
    }

    public function storeCorrectiveSimulation(StoreSimulationRunRequest $request, string $shipment): JsonResponse
    {
        $run = $this->simulations->createCorrective($shipment, $request->validated());

        return $this->simulationRunResponse($run, $shipment);
    }

    private function simulationRunResponse(SimulationRun $run, string $shipment): JsonResponse
    {
        $updatedShipment = $this->shipments->find($shipment);

        return response()->json([
            'data' => [
                'id' => $run->id,
                'shipmentId' => $shipment,
                'totalSteps' => $run->total_steps,
                'hasExcursion' => $run->has_excursion,
                'status' => ShipmentService::statusLabel($updatedShipment->current_stage),
            ],
        ], 201);
    }

    public function advanceThermal(string $shipment): ShipmentResource
    {
        return new ShipmentResource($this->simulations->advanceMonitoring($shipment));
    }

    public function simulationHistory(Request $request, string $shipment): JsonResponse
    {
        $parameters = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:20'],
        ]);
        $shipmentModel = $this->shipments->find($shipment);
        $runs = $shipmentModel->simulationRuns()
            ->latest('run_timestamp')
            ->orderByDesc('id')
            ->paginate($parameters['per_page'] ?? 10, ['*'], 'page', $parameters['page'] ?? 1);

        return response()->json([
            'data' => $runs->getCollection()->map(fn (SimulationRun $run): array => [
                'id' => $run->id,
                'runTimestamp' => $run->run_timestamp?->toISOString(),
                'totalSteps' => $run->total_steps,
                'hasExcursion' => $run->has_excursion,
                'scenarioType' => $run->scenario_type,
            ]),
            'currentPage' => $runs->currentPage(),
            'lastPage' => $runs->lastPage(),
            'total' => $runs->total(),
        ]);
    }

    public function simulationHistoryRun(string $shipment, string $run): JsonResponse
    {
        $shipmentModel = $this->shipments->find($shipment);
        $simulationRun = $shipmentModel->simulationRuns()
            ->with(['timeSeriesLogs' => fn ($query) => $query->orderBy('step_seconds')])
            ->whereKey($run)
            ->firstOrFail();
        $baseline = null;
        if (str_starts_with((string) $simulationRun->scenario_type, 'corrective-')) {
            $baseline = $shipmentModel->simulationRuns()
                ->with(['timeSeriesLogs' => fn ($query) => $query->orderBy('step_seconds')])
                ->where('scenario_type', substr((string) $simulationRun->scenario_type, strlen('corrective-')))
                ->where('run_timestamp', '<=', $simulationRun->run_timestamp)
                ->where('id', '!=', $simulationRun->getKey())
                ->latest('run_timestamp')
                ->first();
        }

        return response()->json([
            'data' => $this->simulationRunData($simulationRun, $baseline),
        ]);
    }

    private function simulationRunData(SimulationRun $run, ?SimulationRun $baseline = null): array
    {
        $startedAt = $run->run_timestamp;

        return [
            'id' => $run->id,
            'runTimestamp' => $startedAt?->toISOString(),
            'totalSteps' => $run->total_steps,
            'hasExcursion' => $run->has_excursion,
            'scenarioType' => $run->scenario_type,
            'samples' => $run->timeSeriesLogs->map(fn ($sample): array => [
                'elapsedSeconds' => $sample->step_seconds,
                'airC' => (float) $sample->air_temp_c,
                'productC' => (float) $sample->product_temp_c,
                'sensorC' => (float) $sample->sensor_temp_c,
                'coolingActive' => $sample->q_cooling_active,
                'timestamp' => $startedAt?->copy()->addSeconds($sample->step_seconds)->toISOString(),
            ]),
            'baseline' => $baseline ? $this->simulationRunData($baseline) : null,
        ];
    }
}
