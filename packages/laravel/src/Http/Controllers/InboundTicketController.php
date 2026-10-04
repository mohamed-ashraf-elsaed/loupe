<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Loupekit\Loupe\Events\TicketReceived;
use Loupekit\Loupe\Support\ActivityLog;
use Loupekit\Loupe\Support\Columns;
use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Support\Triage;
use Throwable;

/**
 * POST /{path}/v1/hub/inbound — a ticket from another project in the organization.
 *
 * Loupe Hub has already checked that the reporter belongs to the organization;
 * {@see \Loupekit\Loupe\Http\Middleware\VerifyHubSignature} has checked the
 * delivery came from Hub and was meant for this app. The ticket lands in this
 * app's own board, in the Queue column, with a `source` saying where it came from.
 *
 * Idempotent on the ticket id: Hub retries, and a repeat answers 202 without
 * storing or announcing it twice.
 */
class InboundTicketController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $issue = is_array($data) ? ($data['issue'] ?? null) : null;
        $user = is_array($data) ? ($data['user'] ?? null) : null;
        $src = is_array($data) ? ($data['source'] ?? null) : null;

        if (! is_array($issue) || ! is_string($issue['id'] ?? null) || $issue['id'] === '' || strlen($issue['id']) > 191) {
            return response()->json(['error' => 'issue.id required'], 422);
        }
        if (! is_array($user) || ! is_string($user['email'] ?? null) || $user['email'] === '') {
            return response()->json(['error' => 'user.email required'], 422);
        }
        if (! is_array($src) || ! is_string($src['project_id'] ?? null) || $src['project_id'] === '') {
            return response()->json(['error' => 'source.project_id required'], 422);
        }

        $model = $this->model();
        if ($model->newQuery()->whereKey($issue['id'])->exists()) {
            return response()->json(['ticket' => $issue['id'], 'duplicate' => true], 202);
        }

        $reporter = ['email' => $user['email']];
        if (is_string($user['name'] ?? null) && $user['name'] !== '') {
            $reporter['name'] = $user['name'];
        }
        $source = [
            'projectId' => $src['project_id'],
            'projectName' => $this->str($src['project_name'] ?? null),
            'organizationId' => $this->str($src['organization_id'] ?? null),
            'organizationName' => $this->str($src['organization_name'] ?? null),
            'deliveryId' => $this->str($request->header('X-Loupe-Hub-Delivery')),
            'receivedAt' => $this->str($data['received_at'] ?? null),
            'reporter' => $reporter,
        ];

        $author = is_array($issue['author'] ?? null) ? $issue['author'] : [];
        $attributes = [
            'project_key' => (string) config('loupe.project_key', 'app'),
            'url' => mb_substr((string) ($issue['url'] ?? '/'), 0, 500),
            'status' => Stages::ORDER[0],
            'priority' => Triage::normalizePriority($issue['priority'] ?? null),
            'change_type' => Triage::normalizeType($issue['changeType'] ?? null),
            'title' => is_string($issue['title'] ?? null) && $issue['title'] !== '' ? mb_substr($issue['title'], 0, 255) : null,
            'body' => (string) ($issue['body'] ?? ''),
            'kind' => is_string($issue['kind'] ?? null) ? $issue['kind'] : 'free',
            // The reporter is a user of the OTHER app: keep their name for display, and
            // never let their id collide with a user of this one.
            'author' => ['id' => 'hub:'.$user['email'], 'name' => (string) ($user['name'] ?? $author['name'] ?? $user['email'])],
            'author_id' => null,
            'anchor' => is_array($issue['anchor'] ?? null) ? $issue['anchor'] : [],
            'context' => is_array($issue['context'] ?? null) ? $issue['context'] : [],
            'offset' => is_array($issue['offset'] ?? null) ? $issue['offset'] : ['x' => 0.5, 'y' => 0.5],
            'region' => is_array($issue['region'] ?? null) ? $issue['region'] : null,
            'viewport' => is_array($issue['viewport'] ?? null) ? $issue['viewport'] : null,
            // Media stay on the sending app's public blob route.
            'screenshot_url' => $this->str($issue['screenshot'] ?? null),
            'recording_url' => $this->str($issue['recording'] ?? null),
            'attachments' => is_array($issue['attachments'] ?? null) ? $issue['attachments'] : null,
            'source' => $source,
        ];

        $comment = DB::transaction(function () use ($model, $issue, $attributes, $source, $reporter) {
            $comment = $model->newInstance();
            $comment->id = $issue['id'];
            $created = $this->time($issue['createdAt'] ?? null);
            $comment->setCreatedAt($created);
            $comment->setUpdatedAt($created);
            $comment->fill(Columns::only($model, $attributes))->save();

            Event::dispatch(new TicketReceived($comment, $source, $reporter));

            return $comment;
        });

        $from = $source['projectName'] ?? $source['projectId'];
        ActivityLog::record(
            'ticket.received',
            'Received “'.mb_substr($attributes['title'] ?? $attributes['body'], 0, 60).'” from '.$from,
            $reporter['email'],
            commentId: $comment->getKey(),
            actor: ['id' => 'hub:'.$reporter['email'], 'name' => $attributes['author']['name']],
        );

        return response()->json(['ticket' => $comment->getKey()], 202);
    }

    private function str(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function time(mixed $value): Carbon
    {
        if (is_string($value) && $value !== '') {
            try {
                return Carbon::parse($value);
            } catch (Throwable) {
                // An unparseable timestamp from the sender: the ticket is still
                // valid, so date it when it arrived.
                return Carbon::now();
            }
        }

        return Carbon::now();
    }

    private function model(): Model
    {
        $class = config('loupe.comment_model');

        return new $class;
    }
}
