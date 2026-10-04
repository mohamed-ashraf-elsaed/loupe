<?php

namespace Loupekit\Loupe\Support;

/**
 * The triage board stages, in PHP.
 *
 * Mirrors COMMENT_STAGES / STAGE_LABELS / normalizeStatus in `@loupekit/shared`
 * so the Laravel API, the MCP tools and the board cannot drift from the widget.
 */
final class Stages
{
    /** Board order, left to right. */
    public const ORDER = ['queue', 'todo', 'in_progress', 'in_review', 'resolved'];

    /** Human labels for the board columns. */
    public const LABELS = [
        'queue' => 'Queue',
        'todo' => 'To Do',
        'in_progress' => 'In Progress',
        'in_review' => 'In Review',
        'resolved' => 'Resolved',
    ];

    /**
     * The three statuses this package shipped before the board. Still accepted,
     * so an older widget or a stored row keeps working across an upgrade.
     */
    private const LEGACY = [
        'open' => 'queue',
        'in_progress' => 'in_progress',
        'done' => 'resolved',
    ];

    /**
     * Coerce any accepted status — a current stage or a legacy alias — into a
     * stage. Anything unrecognised lands in `queue`, the untriaged inbox, rather
     * than falling off the board entirely.
     */
    public static function normalize(mixed $value): string
    {
        if (is_string($value)) {
            if (in_array($value, self::ORDER, true)) {
                return $value;
            }

            if (array_key_exists($value, self::LEGACY)) {
                return self::LEGACY[$value];
            }
        }

        return 'queue';
    }

    /** Whether `$value` is a board stage or a legacy alias of one. Anything else is a mistake to refuse. */
    public static function known(mixed $value): bool
    {
        return is_string($value) && (in_array($value, self::ORDER, true) || array_key_exists($value, self::LEGACY));
    }

    /** Whether a comment is still open work (everything except `resolved`). */
    public static function isOpen(string $stage): bool
    {
        return $stage !== 'resolved';
    }

    /**
     * Every raw `status` value that belongs to this stage — the stage itself plus
     * any legacy alias that maps onto it. A SQL filter uses this so it still finds
     * rows written before the board migration ran.
     *
     * @return list<string>
     */
    public static function withLegacy(string $stage): array
    {
        $values = [$stage];

        foreach (self::LEGACY as $legacy => $mapped) {
            if ($mapped === $stage) {
                $values[] = $legacy;
            }
        }

        return array_values(array_unique($values));
    }
}
