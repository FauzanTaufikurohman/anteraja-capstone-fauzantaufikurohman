<?php

namespace App\Support;

use Closure;
use Illuminate\Support\Facades\Cache;

class ShipmentListCache
{
    private const VERSION_KEY = 'shipment-ssp:version';

    public static function remember(array $parameters, Closure $callback): mixed
    {
        $cache = Cache::store(config('cache.shipment_list_store'));
        $cache->add(self::VERSION_KEY, 0, now()->addYears(10));

        $key = 'shipment-ssp:'.$cache->get(self::VERSION_KEY, 0).':'.hash(
            'sha256',
            json_encode($parameters, JSON_THROW_ON_ERROR),
        );

        return $cache->remember($key, now()->addSeconds(30), $callback);
    }

    public static function invalidate(): void
    {
        $cache = Cache::store(config('cache.shipment_list_store'));
        $cache->add(self::VERSION_KEY, 0, now()->addYears(10));
        $cache->increment(self::VERSION_KEY);
    }
}
