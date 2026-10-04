<?php

namespace Loupekit\Loupe\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Loupekit\Loupe\Support\Hub;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a ticket Loupe Hub delivers to this app from another project
 * in the same organization.
 *
 * Hub signs the delivery with THIS app's own project secret, so no new secret
 * is needed to receive:
 *
 *   X-Loupe-Hub-Project:   this app's project id (loupe.hub.project_id)
 *   X-Loupe-Hub-Timestamp: unix seconds, within 300s of now
 *   X-Loupe-Hub-Signature: hex(HMAC-SHA256(timestamp + "." + raw body, project_secret))
 *
 * Fails closed: anything missing, stale or wrong is refused before the
 * controller runs.
 */
class VerifyHubSignature
{
    public const MAX_SKEW_SECONDS = 300;

    /** Hub caps an ingest body at 5 MB; the delivery adds a small envelope. */
    public const MAX_BODY_BYTES = 6_000_000;

    public function handle(Request $request, Closure $next): Response
    {
        if (! Hub::enabled()) {
            return response()->json(['error' => 'Loupe Hub is not configured'], 503);
        }

        $raw = $request->getContent();
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            return response()->json(['error' => 'payload too large'], 413);
        }

        $project = (string) $request->header('X-Loupe-Hub-Project', '');
        $timestamp = (string) $request->header('X-Loupe-Hub-Timestamp', '');
        $signature = strtolower((string) $request->header('X-Loupe-Hub-Signature', ''));

        if ($project === '' || $timestamp === '' || $signature === '') {
            return response()->json(['error' => 'missing X-Loupe-Hub-Project, X-Loupe-Hub-Timestamp or X-Loupe-Hub-Signature'], 401);
        }
        if (! hash_equals((string) config('loupe.hub.project_id'), $project)) {
            return response()->json(['error' => 'delivery is for another project'], 401);
        }
        if (! preg_match('/^\d{1,12}$/', $timestamp) || abs(time() - (int) $timestamp) > self::MAX_SKEW_SECONDS) {
            return response()->json(['error' => 'timestamp out of range'], 401);
        }
        $expected = hash_hmac('sha256', $timestamp.'.'.$raw, (string) config('loupe.hub.project_secret'));
        if (! hash_equals($expected, $signature)) {
            return response()->json(['error' => 'invalid signature'], 401);
        }

        return $next($request);
    }
}
