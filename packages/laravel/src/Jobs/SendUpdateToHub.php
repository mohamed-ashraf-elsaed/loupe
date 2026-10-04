<?php

namespace Loupekit\Loupe\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Support\ActivityLog;
use Throwable;

/**
 * POST one ticket update to Loupe Hub (`{hub.url}/v1/issues/{id}/updates`),
 * signed exactly like {@see SendToHub}. Hub delivers it to the other project
 * that holds the ticket.
 *
 * Never throws: a failure is logged and written to the Activity feed. The local
 * change that caused it was saved long before.
 */
class SendUpdateToHub implements ShouldQueue
{
    use Queueable;

    public const TIMEOUT_SECONDS = 45;

    public int $tries = 1;

    /** @param  array<string, mixed>  $update */
    public function __construct(public string $issueId, public array $update) {}

    public function handle(): void
    {
        try {
            $body = json_encode($this->update, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $timestamp = (string) time();

            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->acceptJson()
                ->withHeaders([
                    'X-Loupe-Project' => (string) config('loupe.hub.project_id'),
                    'X-Loupe-Timestamp' => $timestamp,
                    'X-Loupe-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, (string) config('loupe.hub.project_secret')),
                ])
                ->withBody($body, 'application/json')
                ->post(rtrim((string) config('loupe.hub.url'), '/').'/v1/issues/'.rawurlencode($this->issueId).'/updates');

            $delivery = $response->json('delivery');
            if ($response->failed() || ($delivery !== 'ok' && $delivery !== 'none')) {
                $error = is_string($response->json('error')) ? $response->json('error') : 'HTTP '.$response->status().($delivery ? ' · delivery '.$delivery : '');
                Log::warning('[loupe] Hub did not deliver the ticket update', ['comment' => $this->issueId, 'kind' => $this->update['kind'] ?? null, 'error' => $error]);
                ActivityLog::record('ticket.update_failed', 'Could not send the '.($this->update['kind'] ?? 'ticket').' update to the other project', $error, 'warn', $this->issueId);
            }
        } catch (Throwable $e) {
            Log::warning('[loupe] could not send the ticket update to Hub', ['comment' => $this->issueId, 'error' => $e->getMessage()]);
            try {
                ActivityLog::record('ticket.update_failed', 'Could not reach Loupe Hub', $e->getMessage(), 'warn', $this->issueId);
            } catch (Throwable) {
                // The feed is a nicety; the warning above is the record.
            }
        }
    }
}
