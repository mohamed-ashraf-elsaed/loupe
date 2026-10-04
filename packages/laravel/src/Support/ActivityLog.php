<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Lottery;
use Loupekit\Loupe\Models\Activity;

/**
 * Writes the widget's Activity feed (config('loupe.activity')).
 *
 * Recording is a side effect of a write that already succeeded, so it must never
 * break that write: when the feature is off, or the host has not run the migration
 * yet, record() returns null and does nothing. Old rows are pruned on roughly one
 * write in a hundred, so the table stays bounded without a scheduler entry.
 */
class ActivityLog
{
    /**
     * @param  array<string, mixed>|null  $actor  `{id, name}` of who did it, when known
     */
    public static function record(
        string $kind,
        string $label,
        ?string $detail = null,
        string $level = 'info',
        ?string $commentId = null,
        ?array $actor = null,
    ): ?Activity {
        if (! config('loupe.activity.enabled', true) || ! Schema::hasTable('loupe_activity')) {
            return null;
        }

        $event = Activity::query()->create([
            'project_key' => (string) config('loupe.project_key', 'app'),
            'kind' => mb_substr($kind, 0, 64),
            'label' => mb_substr($label, 0, 255),
            'detail' => $detail,
            'level' => in_array($level, ['info', 'warn', 'error'], true) ? $level : 'info',
            'comment_id' => $commentId,
            'actor' => $actor,
            'created_at' => Carbon::now(),
        ]);

        Lottery::odds(1, 100)->winner(static fn () => static::prune())->choose();

        return $event;
    }

    /** Delete rows older than the retention window. Returns how many went. */
    public static function prune(): int
    {
        $days = max(1, (int) config('loupe.activity.retention_days', 30));

        return Activity::query()->where('created_at', '<', Carbon::now()->subDays($days))->delete();
    }

    /** "Sara PM" style display of an `{id, name}` actor, for labels. */
    public static function actorName(?array $actor): string
    {
        $name = $actor['name'] ?? null;

        return is_string($name) && $name !== '' ? $name : 'Someone';
    }
}
