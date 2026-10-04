<?php

namespace Loupekit\Loupe;

use Closure;
use Composer\InstalledVersions;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Support\Relay;

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
     * The resolver may be a Closure, a class-string (resolved through the container,
     * called via __invoke), or a [class, method] callable. Prefer the class-string:
     * a Closure in config is NOT serializable, so `php artisan config:cache` fails
     * ("the value at loupe.user_resolver is non-serializable") — and it boots the
     * providers first, so injecting the Closure at runtime does not avoid it either.
     *
     * @return array<string, mixed>
     */
    public function describeUser(Authenticatable $user): array
    {
        $resolver = config('loupe.user_resolver');

        if (is_string($resolver) && class_exists($resolver)) {
            $resolver = app($resolver);
        }

        if ($resolver instanceof Closure) {
            return $resolver($user);
        }

        if ((is_object($resolver) || is_array($resolver)) && is_callable($resolver)) {
            return $resolver($user);
        }

        return [
            'id' => (string) $user->getAuthIdentifier(),
            'name' => $this->attr($user, 'name') ?? $this->attr($user, 'email') ?? 'User',
            'email' => $this->attr($user, 'email'),
        ];
    }

    /**
     * Words for the next status update of a ticket another project filed: the host's
     * own label for the state ("Ready for testing"), its reference ("CT-1405") and a
     * link. Call it just before saving the new status; the update sent to the other
     * project carries them, and that project shows them on the ticket's chip.
     */
    public function describeTicket(string $commentId, ?string $label = null, ?string $reference = null, ?string $url = null): void
    {
        Relay::describe($commentId, $label, $reference, $url);
    }

    /**
     * Add a reply to a thread from host code (a comment written in the host's own
     * tracker, say). Fires MessageAdded, and the reply reaches the other project
     * when the ticket is shared through Loupe Hub.
     *
     * @param  array{id: string, name: string, email?: ?string}  $author
     * @param  list<array<string, mixed>>|null  $attachments
     */
    public function reply(string $commentId, array $author, string $body, ?array $attachments = null): Message
    {
        $message = new Message;
        $message->forceFill([
            'comment_id' => $commentId,
            'author' => array_filter([
                'id' => (string) $author['id'],
                'name' => (string) $author['name'],
                'email' => $author['email'] ?? null,
                'type' => 'user',
            ], fn ($v) => $v !== null && $v !== ''),
            'body' => $body,
            'attachments' => $attachments ?: null,
        ])->save();

        return $message;
    }

    /**
     * The installed version of this package, as Composer records it ("v0.11.0", or a
     * "dev-…" string from a VCS checkout). The widget shows it beside the version baked
     * into the JS bundle and flags a mismatch — which is exactly the state after the
     * package was upgraded but `vendor:publish --tag=loupe-assets --force` was not run.
     * Null when Composer has no record of the package (e.g. a vendored copy).
     */
    public function packageVersion(string $package = 'loupekit/laravel'): ?string
    {
        return InstalledVersions::isInstalled($package)
            ? InstalledVersions::getPrettyVersion($package)
            : null;
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
