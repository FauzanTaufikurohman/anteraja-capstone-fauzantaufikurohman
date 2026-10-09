<?php

namespace App\Providers;

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        DB::listen(static function (QueryExecuted $query): void {
            $request = app('request');

            if (! $request->attributes->get('api.performance.active', false)) {
                return;
            }

            $request->attributes->set(
                'api.performance.db_query_count',
                $request->attributes->get('api.performance.db_query_count', 0) + 1,
            );
            $request->attributes->set(
                'api.performance.db_time_ms',
                $request->attributes->get('api.performance.db_time_ms', 0.0) + $query->time,
            );
        });
    }
}
