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
 * dashboard. A null user is always denied. For a signed-in user, the first of
 * these that applies wins (see decide()):
 *   1. a closure in config('loupe.authorize.use') / config('loupe.authorize.dashboard'),
 *   2. a closure registered via Loupe::useWhen() / Loupe::adminWhen(),
 *   3. in the `local` environment with config('loupe.allow_in_local') true (the
 *      default): any authenticated user is allowed,
 *   4. the Gate abilities loupe:use / loupe:admin.
 *
 * The pairs: widget access is authorize.use -> useWhen() -> loupe:use; dashboard
 * access is authorize.dashboard -> adminWhen() -> loupe:admin. The package defines
 * both Gates to deny everyone when the host has not defined them, so outside
 * `local` you need a closure or a published App\Providers\LoupeServiceProvider
 * that redefines the Gates.
 *
 * Bound as a singleton. Reach it through the facade Loupekit\Loupe\Facades\Loupe,
 * auto-aliased as `Loupe`:
 *
 *     Loupe::useWhen(fn ($user) => $user->is_staff);
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
     * The guards Loupe resolves identity through, in order, from config('loupe.guards'),
     * which the LOUPE_GUARDS env var fills as a comma-separated list
     * (LOUPE_GUARDS=web,admin). An empty config means "the app's default guard"
     * (represented by [null]), so with no configuration this behaves exactly like
     * auth()->user().
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
     * A guard that throws when resolved (for example a misspelled name in
     * LOUPE_GUARDS) is skipped silently, with nothing logged. If every guard is
     * skipped or unauthenticated, the result is user null, guard null.
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
     * Describe a user to the SDK. Honors config('loupe.user_resolver') (see the
     * user_resolver entry in config/loupe.php); without one, returns
     * ['id' => (string) auth identifier, 'name' => name, else email, else 'User',
     * 'email' => email or null]. A resolver should return the same keys.
     *
     * The resolver may be a Closure, a class-string (resolved through the container,
     * called via __invoke), or a [class, staticMethod] callable. A [class, method]
     * pair naming a non-static method is not callable, and a string that is not an
     * existing class (a typo) is ignored: both fall back to the default shape above
     * with no error. Prefer the class-string: a Closure in config is NOT
     * serializable, so `php artisan config:cache` fails ('the value at
     * "loupe.user_resolver" is non-serializable') — and it boots the providers
     * first, so injecting the Closure at runtime does not avoid it either.
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
     * own label for the state ("Ready for testing"), its reference ("TCK-42") and a
     * link. Call it just before saving the new status.
     *
     * The description is held in memory for this request and consumed by the next
     * save that changes the comment's normalized status. If the status does not
     * change, it stays queued for the next status change of that comment. It is
     * sent through Loupe Hub (the service that routes tickets between projects)
     * only when this ticket was received from another project; the receiving
     * project shows the words on the ticket's status chip.
     */
    public function describeTicket(string $commentId, ?string $label = null, ?string $reference = null, ?string $url = null): void
    {
        Relay::describe($commentId, $label, $reference, $url);
    }

    /**
     * Add a reply to a thread from host code (a comment written in the host's own
     * tracker, say). Saves the reply. MessageAdded fires only when $commentId is an
     * existing comment; for an unknown id the Message is still saved and returned,
     * with no event, no relay and no error. The reply is relayed through Loupe Hub
     * when the ticket was received from, or forwarded to, another project.
     *
     * $author needs `id` and `name` (a missing key is an undefined-index error);
     * `email` is optional and dropped when empty. The author is always stored with
     * type `user`.
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
     * The installed version of this package, as Composer records it ("v1.2.3", or a
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
