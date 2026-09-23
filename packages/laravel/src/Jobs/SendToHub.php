<?php

namespace Loupekit\Loupe\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * POST one new comment to Loupe Hub (`{hub.url}/v1/issues`), signed with the
 * project secret:
 *
 *   X-Loupe-Project:   prj_…
 *   X-Loupe-Timestamp: <unix seconds>
 *   X-Loupe-Signature: hex(HMAC-SHA256(timestamp + "." + body, project_secret))
 *
 * Never throws: a Hub outage or rejection is logged and the job ends, so it can
 * never affect comment creation (and is not retried by the queue).
 */
class SendToHub implements ShouldQueue
{
    use Queueable;

    /** Hub itself retries its webhook for up to ~35s, so allow for that. */
    public const TIMEOUT_SECONDS = 45;

    public int $tries = 1;

    /**
     * @param  array{email: string, name?: string}  $user
     * @param  array<string, mixed>  $issue  the canonical Loupe comment shape
     */
    public function __construct(public array $user, public array $issue) {}

    public function handle(): void
    {
        try {
            $body = json_encode(['user' => $this->user, 'issue' => $this->issue], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $timestamp = (string) time();

            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->acceptJson()
                ->withHeaders([
                    'X-Loupe-Project' => (string) config('loupe.hub.project_id'),
                    'X-Loupe-Timestamp' => $timestamp,
                    'X-Loupe-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, (string) config('loupe.hub.project_secret')),
                ])
                ->withBody($body, 'application/json')
                ->post(rtrim((string) config('loupe.hub.url'), '/').'/v1/issues');

            if ($response->failed()) {
                Log::warning('[loupe] Hub rejected comment', [
                    'comment' => $this->issue['id'] ?? null,
                    'status' => $response->status(),
                    'error' => $response->json('error'),
                ]);

                return;
            }

            if ($response->json('delivery') !== 'ok') {
                Log::warning('[loupe] Hub accepted comment but webhook delivery failed', [
                    'comment' => $this->issue['id'] ?? null,
                    'delivery' => $response->json('id'),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('[loupe] could not send comment to Hub', [
                'comment' => $this->issue['id'] ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
