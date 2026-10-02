<?php

namespace Loupekit\Loupe\Support;

/**
 * Triage metadata, in PHP.
 *
 * Mirrors COMMENT_PRIORITIES / PRIORITY_LABELS / CHANGE_TYPES / normalizePriority /
 * normalizeChangeType in `@loupekit/shared`, so the Laravel API, the MCP tools and
 * the board cannot drift from the widget.
 */
final class Triage
{
    /** Priorities, most urgent first. */
    public const PRIORITIES = ['critical', 'high', 'medium', 'low'];

    /** Human labels for the priority chips. */
    public const PRIORITY_LABELS = [
        'critical' => 'Critical',
        'high' => 'High',
        'medium' => 'Medium',
        'low' => 'Low',
    ];

    /** Change types. */
    public const TYPES = ['frontend', 'backend', 'api', 'other'];

    /** Human labels for the change-type chips. */
    public const TYPE_LABELS = [
        'frontend' => 'Frontend',
        'backend' => 'Backend',
        'api' => 'API',
        'other' => 'Other',
    ];

    /** Defaults applied when a comment does not say. */
    public const DEFAULT_PRIORITY = 'medium';
    public const DEFAULT_TYPE = 'other';

    /** Coerce any value into a priority, falling back to the default. */
    public static function normalizePriority(mixed $value): string
    {
        return is_string($value) && in_array($value, self::PRIORITIES, true)
            ? $value
            : self::DEFAULT_PRIORITY;
    }

    /** Coerce any value into a change type, falling back to the default. */
    public static function normalizeType(mixed $value): string
    {
        return is_string($value) && in_array($value, self::TYPES, true)
            ? $value
            : self::DEFAULT_TYPE;
    }
}
