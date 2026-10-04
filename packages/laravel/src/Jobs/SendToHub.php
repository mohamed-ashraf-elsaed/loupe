<?php

namespace Loupekit\Loupe\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Support\ActivityLog;
use Loupekit\Loupe\Support\Columns;
use Throwable;

/**
 * POST one new comment to Loupe Hub (`{hub.url}/v1/issues`), signed with the
 * project secret:
 *
 *   X-Loupe-Project:   prj_…
 *   X-Loupe-Timestamp: <unix seconds>
 *   X-Loupe-Signature: hex(HMAC-SHA256(timestamp + "." + body, project_secret))
 *
 * Never throws: a Hub outage or rejection is logged, recorded on the comment's
 * `forwarded` field and in the Activity feed, and the job ends. It can never
 * affect comment creation (and is not retried by the queue).
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
                $this->remember([
                    'status' => 'rejected',
                    'error' => is_string($response->json('error')) ? $response->json('error') : 'HTTP '.$response->status(),
                ]);

                return;
            }

            $delivery = $response->json('delivery');
            $destination = $response->json('destination');
            $this->remember([
                'status' => is_string($delivery) ? $delivery : 'unknown',
                'deliveryId' => $response->json('id'),
                'destinationProjectId' => is_array($destination) ? ($destination['id'] ?? null) : null,
                'destinationName' => is_array($destination) ? ($destination['name'] ?? null) : null,
            ]);

            if ($delivery !== 'ok' && $delivery !== 'none') {
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
            $this->remember(['status' => 'unreachable', 'error' => $e->getMessage()]);
        }
    }

    /**
     * Store where the comment went on the comment itself (its `forwarded` field,
     * shown as a chip in the widget) and in the Activity feed.
     *
     * Best effort, and it says so: a comment deleted meanwhile, or a table not
     * migrated yet, is skipped, and a database error ends the job with a warning
     * instead of throwing, because the comment itself was saved long before.
     *
     * @param  array<string, mixed>  $result
     */
    private function remember(array $result): void
    {
        $id = $this->issue['id'] ?? null;
        if (! is_string($id) || $id === '') {
            return;
        }
        $result['at'] = Carbon::now()->toISOString();

        try {
            $class = config('loupe.comment_model');
            /** @var Model $model */
            $model = new $class;
            $comment = $model->newQuery()->find($id);
            if ($comment !== null) {
                $comment->forceFill(Columns::only($model, ['forwarded' => $result]))->save();
            }

            $title = trim((string) ($this->issue['title'] ?? '')) ?: mb_substr(trim((string) ($this->issue['body'] ?? '')), 0, 60);
            $to = $result['destinationName'] ?? null;
            [$kind, $label, $level] = match ($result['status']) {
                'ok' => ['ticket.forwarded', $to ? 'Sent “'.$title.'” to '.$to : 'Sent “'.$title.'” to the webhook', 'info'],
                'none' => ['ticket.forwarded', 'Hub accepted “'.$title.'”; no destination is set for this project', 'info'],
                default => ['ticket.forward_failed', 'Could not send “'.$title.'”'.($to ? ' to '.$to : ''), 'warn'],
            };
            ActivityLog::record($kind, $label, $result['error'] ?? null, $level, $id);
        } catch (Throwable $e) {
            Log::warning('[loupe] could not record the Hub result', ['comment' => $id, 'error' => $e->getMessage()]);

            return;
        }
    }
}
