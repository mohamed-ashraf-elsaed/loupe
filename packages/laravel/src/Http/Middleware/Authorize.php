<?php

namespace Loupekit\Loupe\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Loupekit\Loupe\Loupe;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates the Loupe routes. Usage: `loupe.authorize:use` or `loupe.authorize:admin`.
 * The `auth` middleware has already guaranteed a logged-in user by this point;
 * here we only decide whether that user is allowed the feature.
 */
class Authorize
{
    public function __construct(private Loupe $loupe)
    {
    }

    public function handle(Request $request, Closure $next, string $ability = 'use'): Response
    {
        $user = $request->user();

        $allowed = $ability === 'admin'
            ? $this->loupe->authorizedForDashboard($user)
            : $this->loupe->authorizedToUse($user);

        abort_unless($allowed, 403, 'You are not authorized to use Loupe.');

        return $next($request);
    }
}
