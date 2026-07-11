<?php

namespace Loupekit\Loupe\Support;

/**
 * PHP port of @loupekit/shared's normalizeUrl().
 *
 * Keeps a comment on `/checkout?utm_source=x` and one on `/checkout` from
 * fragmenting into two rows: we drop tracking/click params, sort the rest, and
 * trim a trailing slash. Because the same function runs on write and on the list
 * filter, internal consistency is what matters — byte-for-byte parity with the
 * JS implementation is not required.
 */
class Url
{
    /** Query keys dropped wholesale (case-insensitive). */
    private const DROP_EXACT = [
        'api', 'key', 'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid',
        'ref', 'ref_src', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'igshid',
    ];

    public static function normalize(string $input): string
    {
        try {
            $url = self::resolve($input);

            $parts = parse_url($url);
            if ($parts === false) {
                throw new \RuntimeException('unparseable url');
            }

            $path = $parts['path'] ?? '/';

            $pairs = self::keptPairs($parts['query'] ?? '');

            usort($pairs, static function (array $a, array $b): int {
                return $a[0] <=> $b[0] ?: strcmp($a[1], $b[1]);
            });

            $qs = implode('&', array_map(
                static fn (array $p): string => self::enc($p[0]).'='.self::enc($p[1]),
                $pairs
            ));

            // Strip a single trailing slash (but keep the root "/").
            if (strlen($path) > 1 && substr($path, -1) === '/') {
                $path = substr($path, 0, -1);
            }

            return $path.($qs !== '' ? '?'.$qs : '');
        } catch (\Throwable $e) {
            $i = strpos($input, '?');

            return $i === false ? $input : substr($input, 0, $i);
        }
    }

    /** Resolve `input` against the sentinel base, mirroring `new URL(input, base)`. */
    private static function resolve(string $input): string
    {
        $base = 'http://loupe.local';

        if (preg_match('#^[a-z][a-z0-9+.\-]*://#i', $input) === 1) {
            return $input; // already absolute
        }
        if (strpos($input, '//') === 0) {
            return 'http:'.$input; // protocol-relative
        }
        if (strpos($input, '/') === 0) {
            return $base.$input; // root-relative
        }

        return $base.'/'.$input; // relative
    }

    /**
     * Split a raw query string into kept [key, value] pairs (decoded), dropping
     * utm_* and the exact tracking keys.
     *
     * @return array<int, array{0: string, 1: string}>
     */
    private static function keptPairs(string $query): array
    {
        if ($query === '') {
            return [];
        }

        $pairs = [];
        foreach (explode('&', $query) as $segment) {
            if ($segment === '') {
                continue;
            }
            $eq = strpos($segment, '=');
            if ($eq === false) {
                $rawKey = $segment;
                $rawVal = '';
            } else {
                $rawKey = substr($segment, 0, $eq);
                $rawVal = substr($segment, $eq + 1);
            }

            $key = urldecode($rawKey);
            $lower = strtolower($key);
            if (strpos($lower, 'utm_') === 0 || in_array($lower, self::DROP_EXACT, true)) {
                continue;
            }

            $pairs[] = [$key, urldecode($rawVal)];
        }

        return $pairs;
    }

    /** application/x-www-form-urlencoded encoding (space → "+"), matching URLSearchParams. */
    private static function enc(string $value): string
    {
        return urlencode($value);
    }
}
