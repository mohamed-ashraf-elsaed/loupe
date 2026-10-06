<?php

namespace Loupekit\Loupe\Facades;

use Illuminate\Support\Facades\Facade;
use Loupekit\Loupe\Loupe as LoupeManager;

/**
 * @method static void useWhen(\Closure $callback)
 * @method static void adminWhen(\Closure $callback)
 * @method static array<int, string|null> guards()
 * @method static \Illuminate\Contracts\Auth\Authenticatable|null resolveUser()
 * @method static array{user: \Illuminate\Contracts\Auth\Authenticatable|null, guard: string|null} resolve()
 * @method static bool authorizedToUse(?\Illuminate\Contracts\Auth\Authenticatable $user)
 * @method static bool authorizedForDashboard(?\Illuminate\Contracts\Auth\Authenticatable $user)
 * @method static array describeUser(\Illuminate\Contracts\Auth\Authenticatable $user)
 * @method static void describeTicket(string $commentId, ?string $label = null, ?string $reference = null, ?string $url = null)
 * @method static \Loupekit\Loupe\Models\Message reply(string $commentId, array $author, string $body, ?array $attachments = null)
 * @method static string|null packageVersion(string $package = 'loupekit/laravel')
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
