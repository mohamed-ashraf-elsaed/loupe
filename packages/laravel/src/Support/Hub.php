<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Jobs\SendToHub;
use Loupekit\Loupe\Jobs\SendUpdateToHub;
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

    /** How long a good answer from Hub's `GET /v1/projects` is reused. */
    public const ORG_CACHE_SECONDS = 300;

    public const ORG_TIMEOUT_SECONDS = 5;

    /**
     * This app's project, its organization and the organization's other
     * projects, as Loupe Hub knows them (`GET {hub.url}/v1/projects`, signed with
     * the project secret over an empty body). Read-only and free of secrets.
     *
     * Never throws. Not configured, or Hub unreachable, gives the same shape with
     * `organization: null`; the second also carries `error: "hub_unreachable"`.
     * Only a good answer is cached, so an outage is not remembered for 5 minutes.
     *
     * @return array<string, mixed>
     */
    public static function organization(): array
    {
        $key = (string) config('loupe.project_key', 'app');
        $none = ['organization' => null, 'project' => ['key' => $key, 'name' => null, 'destination' => null], 'projects' => []];
        if (! static::enabled()) {
            return $none;
        }

        $cached = Cache::get('loupe.hub.org');
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $timestamp = (string) time();
            $response = Http::timeout(self::ORG_TIMEOUT_SECONDS)
                ->acceptJson()
                ->withHeaders([
                    'X-Loupe-Project' => (string) config('loupe.hub.project_id'),
                    'X-Loupe-Timestamp' => $timestamp,
                    'X-Loupe-Signature' => hash_hmac('sha256', $timestamp.'.', (string) config('loupe.hub.project_secret')),
                ])
                ->get(rtrim((string) config('loupe.hub.url'), '/').'/v1/projects');
            $body = $response->json();
            if ($response->failed() || ! is_array($body['organization'] ?? null) || ! is_array($body['project'] ?? null)) {
                Log::warning('[loupe] Hub did not return the organization', ['status' => $response->status()]);

                return $none + ['error' => 'hub_unreachable'];
            }
        } catch (Throwable $e) {
            Log::warning('[loupe] could not reach Hub for the organization', ['error' => $e->getMessage()]);

            return $none + ['error' => 'hub_unreachable'];
        }

        $org = [
            'organization' => ['id' => (string) ($body['organization']['id'] ?? ''), 'name' => (string) ($body['organization']['name'] ?? '')],
            'project' => [
                'key' => $key,
                'id' => (string) ($body['project']['id'] ?? ''),
                'name' => $body['project']['name'] ?? null,
                'destination' => is_array($body['project']['destination'] ?? null) ? $body['project']['destination'] : null,
                'receives' => (bool) ($body['project']['receives'] ?? false),
            ],
            'projects' => array_values(array_filter($body['projects'] ?? [], 'is_array')),
        ];
        Cache::put('loupe.hub.org', $org, self::ORG_CACHE_SECONDS);

        return $org;
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
        // Where Hub sends this ticket's updates back to: this app's own receiver.
        $replyUrl = null;
        try {
            $replyUrl = route('loupe.hub.inbound');
        } catch (Throwable) {
            // Routes disabled: the ticket still goes, it just hears nothing back.
        }

        static::dispatch(new SendToHub($author, $issue, $replyUrl));
    }

    /**
     * Queue a SendUpdateToHub job: a status change or a reply on a ticket that
     * another project also holds. Same dispatch rules as forward(). Never throws.
     *
     * @param  array<string, mixed>  $update
     */
    public static function sendUpdate(string $issueId, array $update): void
    {
        if (! static::enabled()) {
            return;
        }

        static::dispatch(new SendUpdateToHub($issueId, $update));
    }

    private static function dispatch(object $job): void
    {
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
