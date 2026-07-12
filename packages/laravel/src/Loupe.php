<?php

namespace Loupekit\Loupe;

use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

/**
 * The authorization brain. Decides who may use the widget and who may see the
 * dashboard, combining (in order):
 *   1. a closure registered via Loupe::useWhen()/adminWhen(),
 *   2. a closure in config('loupe.authorize.*'),
 *   3. the Gate abilities loupe:use / loupe:admin.
 *
 * Bound as a singleton; reach it through the Loupe facade.
 */
class Loupe
{
    private ?Closure $useCallback = null, $adminCallback = null;

    public function useWhen(Closure $callback): void
    {
        $this->useCallback = $callback;
    }

    public function adminWhen(Closure $callback): void
    {
        $this->adminCallback = $callback;
    }

    /**
     * The guards Loupe resolves identity through, in order. An empty config
     * means "the app's default guard" (represented by [null]) — so with no
     * configuration this behaves exactly like auth()->user().
     *
     * @return array<int, string|null>
     */
    public function guards(): array
    {
        $guards = config('loupe.guards');

        return empty($guards) ? [null] : array_values($guards);
    }

    /** The first authenticated user across the configured guards (or null). */
    public function resolveUser(): ?Authenticatable
    {
        return $this->resolve()['user'];
    }

    /**
     * Resolve the current user and the guard that matched.
     *
     * @return array{user: ?Authenticatable, guard: string|null}
     */
    public function resolve(): array
    {
        foreach ($this->guards() as $guard) {
            try {
                $user = Auth::guard($guard)->user();
            } catch (\Throwable $e) {
                continue; // unknown/misconfigured guard — skip it
            }
            if ($user !== null) {
                return ['user' => $user, 'guard' => $guard];
            }
        }

        return ['user' => null, 'guard' => null];
    }

    public function authorizedToUse(?Authenticatable $user): bool
    {
        return $this->decide($user, $this->useCallback, 'use', 'loupe:use');
    }

    public function authorizedForDashboard(?Authenticatable $user): bool
    {
        return $this->decide($user, $this->adminCallback, 'dashboard', 'loupe:admin');
    }

    /**
     * Describe a user to the SDK. Honors config('loupe.user_resolver'); falls
     * back to id/name/email.
     *
     * @return array<string, mixed>
     */
    public function describeUser(Authenticatable $user): array
    {
        $resolver = config('loupe.user_resolver');
        if ($resolver instanceof Closure) {
            return $resolver($user);
        }

        return [
            'id' => (string) $user->getAuthIdentifier(),
            'name' => $this->attr($user, 'name') ?? $this->attr($user, 'email') ?? 'User',
            'email' => $this->attr($user, 'email'),
        ];
    }

    private function decide(?Authenticatable $user, ?Closure $registered, string $configKey, string $ability): bool
    {
        if ($user === null) {
            return false;
        }

        // Explicit host configuration wins, in every environment.
        $configured = config("loupe.authorize.$configKey");
        if ($configured instanceof Closure) {
            return (bool) $configured($user);
        }

        if ($registered instanceof Closure) {
            return (bool) $registered($user);
        }

        // Frictionless in local/dev so a fresh install works without config.
        if (config('loupe.allow_in_local', true) && app()->environment('local')) {
            return true;
        }

        return Gate::forUser($user)->allows($ability);
    }

    private function attr(Authenticatable $user, string $key): ?string
    {
        $value = data_get($user, $key);

        return $value === null ? null : (string) $value;
    }
}
