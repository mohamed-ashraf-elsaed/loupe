<?php

namespace Loupekit\Loupe\Support;

use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Models\Message;
use Throwable;

/**
 * Who can be @mentioned: the `MentionCandidate` list the widget autocompletes from.
 *
 * In order: config('loupe.people_resolver') when the host sets one; otherwise the
 * users of each configured guard whose email is in config('loupe.allowed_emails'),
 * plus everyone who has already taken part in this project's threads.
 */
class People
{
    /** @return list<array{id: string, name: string, email?: string}> */
    public static function all(): array
    {
        $resolver = config('loupe.people_resolver');
        if (is_string($resolver) && class_exists($resolver)) {
            $resolver = app($resolver);
        }
        if ($resolver instanceof Closure || ((is_object($resolver) || is_array($resolver)) && is_callable($resolver))) {
            return self::clean((array) $resolver());
        }

        return self::clean(array_merge(self::allowedUsers(), self::participants()));
    }

    /** @return list<array<string, mixed>> */
    private static function allowedUsers(): array
    {
        $emails = array_values(array_filter(array_map(
            fn ($e) => is_string($e) ? strtolower(trim($e)) : '',
            (array) config('loupe.allowed_emails', []),
        )));
        if ($emails === []) {
            return [];
        }

        /** @var Loupe $loupe */
        $loupe = app(Loupe::class);
        $out = [];
        foreach ($loupe->guards() as $guard) {
            try {
                $provider = Auth::guard($guard)->getProvider();
                $model = method_exists($provider, 'createModel') ? $provider->createModel() : null;
                if ($model === null || ! Schema::hasColumn($model->getTable(), 'email')) {
                    continue;
                }
                foreach ($model->newQuery()->whereIn('email', $emails)->get() as $user) {
                    if ($user instanceof Authenticatable) {
                        $out[] = $loupe->describeUser($user);
                    }
                }
            } catch (Throwable) {
                // A guard with no Eloquent provider (token, custom) has nobody to list.
                continue;
            }
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private static function participants(): array
    {
        $class = config('loupe.comment_model');
        $out = [];
        $comments = (new $class)->newQuery()->where('project_key', (string) config('loupe.project_key', 'app'))
            ->latest()->limit(500)->get(['author']);
        foreach ($comments as $c) {
            $out[] = (array) $c->author;
        }
        if (Schema::hasTable((new Message)->getTable())) {
            foreach (Message::query()->whereNull('origin')->latest()->limit(500)->get(['author']) as $m) {
                $out[] = (array) $m->author;
            }
        }

        // Somebody from another project (`hub:` ids) cannot be notified here.
        return array_filter($out, fn ($p) => ! str_starts_with((string) ($p['id'] ?? ''), 'hub:'));
    }

    /**
     * @param  array<int, mixed>  $people
     * @return list<array{id: string, name: string, email?: string}>
     */
    private static function clean(array $people): array
    {
        $out = [];
        foreach ($people as $p) {
            $id = is_array($p) ? (string) ($p['id'] ?? '') : '';
            if ($id === '' || isset($out[$id])) {
                continue;
            }
            $row = ['id' => $id, 'name' => (string) ($p['name'] ?? $p['email'] ?? $id)];
            if (is_string($p['email'] ?? null) && $p['email'] !== '') {
                $row['email'] = $p['email'];
            }
            $out[$id] = $row;
        }

        return array_values($out);
    }
}
