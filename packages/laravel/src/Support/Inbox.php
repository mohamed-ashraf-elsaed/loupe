<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Models\Notification;

/**
 * Writes the widget's in-app inbox. Like the Activity feed it is a side effect of
 * a write that already succeeded: with the table not migrated it does nothing.
 */
class Inbox
{
    public static function notify(string $recipientId, string $commentId, string $kind, string $body, ?string $actorName = null): ?Notification
    {
        // `hub:` ids belong to another project's users, who have no inbox here.
        if ($recipientId === '' || str_starts_with($recipientId, 'hub:') || ! Schema::hasTable((new Notification)->getTable())) {
            return null;
        }

        return Notification::query()->create([
            'project_key' => (string) config('loupe.project_key', 'app'),
            'recipient_id' => $recipientId,
            'comment_id' => $commentId,
            'kind' => mb_substr($kind, 0, 32),
            'body' => mb_substr($body, 0, 500),
            'actor_name' => $actorName === null ? null : mb_substr($actorName, 0, 255),
            'created_at' => Carbon::now(),
        ]);
    }
}
