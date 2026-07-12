<?php

namespace Loupekit\Loupe\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Http\Request;
use Loupekit\Loupe\Loupe;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a Loupe request against the configured guards (config
 * loupe.guards), in order. The first guard with a logged-in user wins and
 * becomes the default guard for the rest of the request — so identity stays
 * consistent with what the widget was rendered with. Aborts if none match.
 *
 * With no configured guards this is equivalent to the framework's `auth`
 * middleware on the default guard (full backward compatibility).
 */
class Authenticate
{
    public function __construct(private Loupe $loupe, private AuthFactory $auth)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        foreach ($this->loupe->guards() as $guard) {
            try {
                $authenticated = $this->auth->guard($guard)->check();
            } catch (\Throwable $e) {
                continue; // unknown/misconfigured guard — skip it
            }
            if ($authenticated) {
                if ($guard !== null) {
                    $this->auth->shouldUse($guard);
                }

                return $next($request);
            }
        }

        // Mirrors the framework's `auth` middleware: 401 for JSON, redirect to
        // login for web requests.
        throw new AuthenticationException('Unauthenticated.', array_values(array_filter($this->loupe->guards())));
    }
}
