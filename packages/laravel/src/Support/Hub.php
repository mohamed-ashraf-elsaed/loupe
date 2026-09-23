<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Jobs\SendToHub;
use Throwable;

/**
 * Optional forwarding of new comments to Loupe Hub (config('loupe.hub')).
 * Off unless the URL, Project ID and Project Secret are all set.
 */
class Hub
{
    public static function enabled(): bool
    {
        return filled(config('loupe.hub.url'))
            && filled(config('loupe.hub.project_id'))
            && filled(config('loupe.hub.project_secret'));
    }

    /**
     * Queue a SendToHub job for a new comment. On the "sync" queue (or if the
     * queue is unavailable) it runs after the response instead, so the user
     * never waits on Hub. Never throws.
     *
     * @param  array<string, mixed>  $user  the describeUser() payload of the author
     * @param  array<string, mixed>  $issue  the canonical Loupe comment shape
     */
    public static function forward(array $user, array $issue): void
    {
        if (! static::enabled()) {
            return;
        }

        $email = $user['email'] ?? null;
        if (! is_string($email) || $email === '') {
            Log::warning('[loupe] not sending comment to Hub: the user has no email', ['comment' => $issue['id'] ?? null]);

            return;
        }

        $author = ['email' => $email];
        if (is_string($user['name'] ?? null) && $user['name'] !== '') {
            $author['name'] = $user['name'];
        }
        $job = new SendToHub($author, $issue);

        try {
            if (config('queue.default', 'sync') === 'sync') {
                Bus::dispatchAfterResponse($job);
            } else {
                Bus::dispatch($job);
            }
        } catch (Throwable $e) {
            Log::warning('[loupe] could not queue the Hub job; sending it after the response', ['error' => $e->getMessage()]);
            Bus::dispatchAfterResponse($job);
        }
    }
}
