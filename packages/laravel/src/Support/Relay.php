<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Events\CommentStatusChanged;
use Loupekit\Loupe\Events\HubUpdateReceived;
use Loupekit\Loupe\Events\MessageAdded;
use Loupekit\Loupe\Models\Message;

/**
 * Keeps a ticket in step across two projects after Loupe Hub has delivered it.
 *
 * The project that RECEIVED the ticket (it has `source`) owns its status: when
 * Hub is configured (Hub::enabled()), every status change there that is not made
 * inside quietly() is sent back to the project that filed it, which shows it on
 * the ticket's `forwarded.remote` and moves its own card. Replies travel both
 * ways. Updates go through Hub as `POST {loupe.hub.url}/v1/issues/{id}/updates`;
 * Hub delivers them to the other side's registered inbound URL (for this
 * package, `POST {loupe.path}/v1/hub/inbound`, default `/loupe/v1/hub/inbound`) as
 *
 *   {"type": "update", "issue_id": "…", "from": {"project_id", "project_name"},
 *    "update": {"kind": "status", "status", "label"?, "reference"?, "url"?}
 *            | {"kind": "message", "message": {"id", "author": {"name", "email"?}, "body", "createdAt", "attachments"?}}}
 *
 * `?` marks a field sent only when non-empty. On receipt, `status` must be a known
 * board stage and a message needs `id` and `body`, or
 * InboundTicketController::update() answers 422; an applied update answers 202.
 *
 * Anything applied from Hub is applied quietly, so it is never sent back.
 */
class Relay
{
    private static int $quiet = 0;

    /** @var array<string, array{label?: string, reference?: string, url?: string}> */
    private static array $described = [];

    /** Run `$fn` without relaying anything it changes. */
    public static function quietly(callable $fn): mixed
    {
        self::$quiet++;
        try {
            return $fn();
        } finally {
            self::$quiet--;
        }
    }

    /**
     * What the next status update for this comment should say beside the stage:
     * the host's own words for it ("Ready for testing"), its reference ("TCK-42")
     * and a link. Consumed by the next status change of that comment, and discarded
     * if that change is not relayed (made quietly, or on a ticket this app did not
     * receive).
     */
    public static function describe(string $commentId, ?string $label = null, ?string $reference = null, ?string $url = null): void
    {
        self::$described[$commentId] = array_filter(
            ['label' => $label, 'reference' => $reference, 'url' => $url],
            fn ($v) => is_string($v) && $v !== '',
        );
    }

    /** Listener: a status change on a ticket this app received goes back to its sender. */
    public static function statusChanged(CommentStatusChanged $event): void
    {
        $id = (string) $event->comment->getKey();
        $described = self::$described[$id] ?? [];
        unset(self::$described[$id]);

        if (self::$quiet > 0 || ! self::received($event->comment)) {
            return;
        }

        Hub::sendUpdate($id, ['kind' => 'status', 'status' => $event->to] + $described);
    }

    /** Listener: a reply written here goes to the other project holding the ticket. */
    public static function messageAdded(MessageAdded $event): void
    {
        if (self::$quiet > 0 || ! empty($event->message->origin)) {
            return;
        }
        if (! self::received($event->comment) && ! self::forwarded($event->comment)) {
            return;
        }

        $m = $event->message;
        $author = ['name' => (string) ($m->author['name'] ?? 'Someone')];
        if (is_string($m->author['email'] ?? null) && $m->author['email'] !== '') {
            $author['email'] = $m->author['email'];
        }
        $message = ['id' => $m->id, 'author' => $author, 'body' => $m->body, 'createdAt' => optional($m->created_at)->toISOString()];
        if (! empty($m->attachments)) {
            $message['attachments'] = $m->attachments;
        }

        Hub::sendUpdate((string) $event->comment->getKey(), ['kind' => 'message', 'message' => $message]);
    }

    /**
     * Apply an update Hub delivered for `$comment`. Returns what was done, for the
     * HTTP answer. A malformed update never reaches this method, because
     * InboundTicketController::update() answers 422 first. Database errors from
     * the writes here are not caught and propagate to the caller.
     *
     * @param  array<string, mixed>  $update
     * @param  array{project_id: string, project_name?: ?string}  $from
     * @return array<string, mixed>
     */
    public static function receive(Model $comment, array $update, array $from): array
    {
        $fromName = is_string($from['project_name'] ?? null) && $from['project_name'] !== '' ? $from['project_name'] : $from['project_id'];
        $id = (string) $comment->getKey();
        $title = self::titleOf($comment);
        $authorId = (string) data_get($comment->author, 'id', '');

        $result = self::quietly(function () use ($comment, $update, $from, $fromName, $id, $title, $authorId) {
            if ($update['kind'] === 'status') {
                $status = Stages::normalize($update['status']);
                $remote = array_filter([
                    'status' => $status,
                    'label' => self::str($update['label'] ?? null),
                    'reference' => self::str($update['reference'] ?? null),
                    'url' => self::str($update['url'] ?? null),
                    'projectName' => self::str($from['project_name'] ?? null),
                    'at' => Carbon::now()->toISOString(),
                ], fn ($v) => $v !== null);
                $forwarded = is_array($comment->forwarded) ? $comment->forwarded : [];
                $comment->forceFill(Columns::only($comment, [
                    'status' => $status,
                    'forwarded' => array_merge($forwarded, ['remote' => $remote]),
                ]))->save();

                $said = $remote['label'] ?? Stages::LABELS[$status];
                $ref = isset($remote['reference']) ? $remote['reference'].' · ' : '';
                Inbox::notify($authorId, $id, 'status', $fromName.': '.$ref.$said.' — “'.$title.'”', $fromName);
                ActivityLog::record('ticket.updated', $fromName.' moved “'.$title.'” to '.$said, $remote['reference'] ?? null, commentId: $id);

                return ['applied' => 'status', 'status' => $status];
            }

            $m = $update['message'];
            if (! Schema::hasTable((new Message)->getTable())) {
                return ['applied' => 'none', 'reason' => 'messages table not migrated'];
            }
            if (Message::query()->whereKey($m['id'])->exists()) {
                return ['applied' => 'message', 'duplicate' => true];
            }
            $name = (string) data_get($m, 'author.name', $fromName);
            $email = self::str(data_get($m, 'author.email'));
            $message = new Message;
            $message->id = $m['id'];
            $message->forceFill([
                'comment_id' => $id,
                'author' => array_filter(['id' => 'hub:'.($email ?? $name), 'name' => $name, 'email' => $email, 'type' => 'user'], fn ($v) => $v !== null),
                'body' => (string) $m['body'],
                'attachments' => is_array($m['attachments'] ?? null) ? $m['attachments'] : null,
                'origin' => array_filter(['projectId' => $from['project_id'], 'projectName' => self::str($from['project_name'] ?? null)], fn ($v) => $v !== null),
            ]);
            $created = self::time($m['createdAt'] ?? null);
            $message->setCreatedAt($created);
            $message->setUpdatedAt($created);
            $message->save();

            Inbox::notify($authorId, $id, 'reply', $name.' replied from '.$fromName.' on “'.$title.'”', $name);
            ActivityLog::record('ticket.reply', $name.' replied from '.$fromName.' on “'.$title.'”', commentId: $id);

            return ['applied' => 'message', 'message' => $message->id];
        });

        Event::dispatch(new HubUpdateReceived($comment, $update, $from));

        return $result;
    }

    /** This app received the ticket from another project, so it owns its status. */
    private static function received(Model $comment): bool
    {
        return is_array($comment->source) && ! empty($comment->source['projectId']);
    }

    /** This app filed the ticket and Hub delivered it to another project. */
    private static function forwarded(Model $comment): bool
    {
        return is_array($comment->forwarded) && ($comment->forwarded['status'] ?? null) === 'ok'
            && ! empty($comment->forwarded['destinationProjectId']);
    }

    private static function titleOf(Model $comment): string
    {
        $title = trim((string) $comment->title);

        return $title !== '' ? mb_substr($title, 0, 80) : mb_substr(trim((string) $comment->body), 0, 60);
    }

    private static function str(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? mb_substr($value, 0, 500) : null;
    }

    private static function time(mixed $value): Carbon
    {
        if (is_string($value) && $value !== '') {
            try {
                return Carbon::parse($value);
            } catch (\Throwable) {
                return Carbon::now();
            }
        }

        return Carbon::now();
    }
}
