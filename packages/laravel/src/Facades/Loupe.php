<?php

namespace Loupekit\Loupe\Facades;

use Illuminate\Support\Facades\Facade;
use Loupekit\Loupe\Loupe as LoupeManager;

/**
 * @method static void useWhen(\Closure $callback)
 * @method static void adminWhen(\Closure $callback)
 * @method static bool authorizedToUse(?\Illuminate\Contracts\Auth\Authenticatable $user)
 * @method static bool authorizedForDashboard(?\Illuminate\Contracts\Auth\Authenticatable $user)
 * @method static array describeUser(\Illuminate\Contracts\Auth\Authenticatable $user)
 *
 * @see \Loupekit\Loupe\Loupe
 */
class Loupe extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return LoupeManager::class;
    }
}
