<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class MeasureApiPerformance
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('api.performance.active', true);
        $request->attributes->set('api.performance.db_query_count', 0);
        $request->attributes->set('api.performance.db_time_ms', 0.0);
        $startedAt = hrtime(true);

        $response = $next($request);

        $durationMs = (hrtime(true) - $startedAt) / 1_000_000;
        $dbTimeMs = (float) $request->attributes->get('api.performance.db_time_ms', 0);
        $dbQueryCount = (int) $request->attributes->get('api.performance.db_query_count', 0);
        $route = $request->route();

        $response->headers->set(
            'Server-Timing',
            sprintf('app;dur=%.2f, db;dur=%.2f', $durationMs, $dbTimeMs),
        );
        $response->headers->set('X-DB-Query-Count', (string) $dbQueryCount);

        Log::info('API request performance', [
            'route' => $route?->uri() ?? $request->path(),
            'method' => $request->method(),
            'status' => $response->getStatusCode(),
            'duration_ms' => round($durationMs, 2),
            'db_time_ms' => round($dbTimeMs, 2),
            'db_query_count' => $dbQueryCount,
        ]);

        return $response;
    }
}
