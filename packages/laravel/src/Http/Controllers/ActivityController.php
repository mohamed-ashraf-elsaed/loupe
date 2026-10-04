<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Models\Activity;
use Throwable;

/**
 * GET /{path}/v1/activity?since= — the Activity feed for this app's project,
 * newest first, at most {@see LIMIT} rows. `since` (ISO 8601) returns rows at or
 * after it, so the widget can poll cheaply. Rows are stored to the second, so the
 * boundary is inclusive and the widget merges repeats by id.
 */
class ActivityController extends Controller
{
    public const LIMIT = 200;

    public function index(Request $request): JsonResponse
    {
        // Feature off, or not migrated yet: the widget shows "Monitor unavailable".
        if (! config('loupe.activity.enabled', true) || ! Schema::hasTable('loupe_activity')) {
            return response()->json(['error' => 'activity is not enabled'], 404);
        }

        $query = Activity::query()
            ->where('project_key', (string) config('loupe.project_key', 'app'))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::LIMIT);

        $since = $request->query('since');
        if (is_string($since) && $since !== '') {
            try {
                $query->where('created_at', '>=', Carbon::parse($since));
            } catch (Throwable) {
                return response()->json(['error' => 'since must be an ISO 8601 timestamp'], 422);
            }
        }

        return response()->json($query->get()->map(fn (Activity $a) => $a->toLoupeArray())->all());
    }
}
