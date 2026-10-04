<?php

namespace Loupekit\Loupe\Support;

/**
 * @mentions, in PHP. Mirrors parseMentions/resolveMentions in `@loupekit/shared`
 * (mentions.ts) so a handle resolves to the same person in the widget and here.
 *
 * Handles that match nobody are returned, not dropped: a mention that quietly does
 * nothing is the failure this exists to prevent.
 */
final class Mentions
{
    /** @return list<string> handles without the `@`, first occurrence wins */
    public static function parse(string $body): array
    {
        if ($body === '') {
            return [];
        }

        $excluded = [];
        preg_match_all('/```[\s\S]*?```/', $body, $fences, PREG_OFFSET_CAPTURE);
        foreach ($fences[0] as [$text, $at]) {
            $excluded[] = [$at, $at + strlen($text)];
        }
        preg_match_all('/`[^`\n]*`/', $body, $inline, PREG_OFFSET_CAPTURE);
        foreach ($inline[0] as [$text, $at]) {
            if (! self::inside($excluded, $at)) {
                $excluded[] = [$at, $at + strlen($text)];
            }
        }

        $out = [];
        $seen = [];
        $len = strlen($body);
        for ($i = 0; $i < $len; $i++) {
            if ($body[$i] !== '@' || self::inside($excluded, $i)) {
                continue;
            }
            // Start of body, or after whitespace / opening punctuation: never mid-word,
            // which is what keeps an email address from reading as a mention.
            if ($i > 0 && ! preg_match('/[\s(\[{<"\'*_~]/', $body[$i - 1])) {
                continue;
            }
            if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*/', substr($body, $i + 1), $m)) {
                continue;
            }
            $handle = rtrim($m[0], '._-');
            $key = strtolower($handle);
            if ($handle === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $handle;
        }

        return $out;
    }

    /**
     * @param  list<array{id: string, name: string, email?: ?string}>  $people
     * @return array{resolved: list<array{id: string, name: string, email?: ?string}>, unknown: list<string>}
     */
    public static function resolve(string $body, array $people): array
    {
        $byKey = [];
        foreach ($people as $p) {
            $name = strtolower((string) $p['name']);
            $byKey[$name] = $p;
            $byKey[preg_replace('/\s+/', '', $name)] = $p;
            $first = preg_split('/\s+/', $name)[0] ?? '';
            if ($first !== '') {
                $byKey[$first] = $p;
            }
            if (! empty($p['email'])) {
                $byKey[strtolower(explode('@', (string) $p['email'])[0])] = $p;
            }
            $byKey[strtolower((string) $p['id'])] = $p;
        }

        $resolved = [];
        $unknown = [];
        foreach (self::parse($body) as $handle) {
            $person = $byKey[strtolower($handle)] ?? null;
            if ($person === null) {
                $unknown[] = $handle;
            } elseif (! in_array($person['id'], array_column($resolved, 'id'), true)) {
                $resolved[] = $person;
            }
        }

        return ['resolved' => $resolved, 'unknown' => $unknown];
    }

    /** @param  list<array{0: int, 1: int}>  $ranges */
    private static function inside(array $ranges, int $at): bool
    {
        foreach ($ranges as [$a, $b]) {
            if ($at >= $a && $at < $b) {
                return true;
            }
        }

        return false;
    }
}
