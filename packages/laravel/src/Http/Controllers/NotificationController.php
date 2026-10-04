<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Models\Notification;

/**
 * The signed-in user's widget inbox. Always scoped to that user: the SDK also
 * sends a `recipient`, and it is ignored, so nobody can read another's inbox.
 */
class NotificationController extends Controller
{
    /** GET /{path}/v1/notifications — newest 50. */
    public function index(Loupe $loupe): JsonResponse
    {
        $list = Notification::query()
            ->where('project_key', (string) config('loupe.project_key', 'app'))
            ->where('recipient_id', $this->me($loupe))
            ->latest('created_at')->latest('id')->limit(50)->get()
            ->map(fn (Notification $n) => $n->toLoupeArray())->all();

        return response()->json(['notifications' => $list]);
    }

    /** POST /{path}/v1/notifications/read — one (`id`) or all. */
    public function read(Request $request, Loupe $loupe): JsonResponse
    {
        $query = Notification::query()
            ->where('project_key', (string) config('loupe.project_key', 'app'))
            ->where('recipient_id', $this->me($loupe))
            ->whereNull('read_at');
        $id = $request->input('id');
        if (is_string($id) && $id !== '') {
            $query->whereKey($id);
        }

        return response()->json(['read' => $query->update(['read_at' => Carbon::now()])]);
    }

    private function me(Loupe $loupe): string
    {
        return (string) ($loupe->describeUser($loupe->resolveUser())['id'] ?? '');
    }
}
