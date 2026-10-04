<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Models\Reaction;
use Loupekit\Loupe\Support\ActivityLog;
use Loupekit\Loupe\Support\Inbox;
use Loupekit\Loupe\Support\Mentions;
use Loupekit\Loupe\Support\People;

/**
 * The conversation on a comment: replies and their reactions. Shapes are
 * `ThreadMessage` and `Reaction` from @loupekit/shared. The author of a reply
 * and of a reaction is always the signed-in user, whatever the body says.
 */
class ThreadController extends Controller
{
    /** GET /{path}/v1/comments/{id}/messages — replies, oldest first. */
    public function index(Request $request, string $id): JsonResponse
    {
        if ($this->comment($id) === null) {
            return response()->json(['error' => 'not found'], 404);
        }

        $query = Message::query()->where('comment_id', $id)->orderBy('created_at')->orderBy('id');
        if ($request->query('includeDeleted') !== '1') {
            $query->whereNull('deleted_at');
        }

        return response()->json($query->get()->map(fn (Message $m) => $m->toLoupeArray())->all());
    }

    /** POST /{path}/v1/comments/{id}/messages — add a reply, notify who it mentions. */
    public function store(Request $request, Loupe $loupe, string $id): JsonResponse
    {
        $comment = $this->comment($id);
        if ($comment === null) {
            return response()->json(['error' => 'not found'], 404);
        }
        $body = $request->input('body');
        if (! is_string($body) || trim($body) === '') {
            return response()->json(['error' => 'body is required'], 422);
        }

        $who = $loupe->describeUser($loupe->resolveUser());
        $author = array_filter([
            'id' => (string) ($who['id'] ?? ''),
            'name' => (string) ($who['name'] ?? 'User'),
            'email' => is_string($who['email'] ?? null) ? $who['email'] : null,
            'type' => 'user',
        ], fn ($v) => $v !== null);

        $attachments = $request->input('attachments');
        $message = new Message;
        $message->forceFill([
            'comment_id' => $id,
            'author' => $author,
            'body' => $body,
            'attachments' => is_array($attachments) && $attachments !== [] ? array_values($attachments) : null,
        ])->save();

        $title = $this->titleOf($comment);
        $resolution = Mentions::resolve($body, People::all());
        foreach ($resolution['resolved'] as $person) {
            if ($person['id'] !== $author['id']) {
                Inbox::notify($person['id'], $id, 'mention', $author['name'].' mentioned you on “'.$title.'”', $author['name']);
            }
        }
        // The reporter hears about a reply on their own ticket, mentioned or not.
        $reporter = (string) data_get($comment->author, 'id', '');
        if ($reporter !== $author['id'] && ! in_array($reporter, array_column($resolution['resolved'], 'id'), true)) {
            Inbox::notify($reporter, $id, 'reply', $author['name'].' replied on “'.$title.'”', $author['name']);
        }
        ActivityLog::record('comment.reply', $author['name'].' replied on “'.$title.'”', commentId: $id, actor: ['id' => $author['id'], 'name' => $author['name']]);

        return response()->json($message->fresh()->toLoupeArray() + [
            'mentions' => array_column($resolution['resolved'], 'id'),
            'unknownMentions' => $resolution['unknown'],
        ], 201);
    }

    /** GET /{path}/v1/comments/{id}/reactions — every reaction in the thread. */
    public function reactions(string $id): JsonResponse
    {
        if ($this->comment($id) === null) {
            return response()->json(['error' => 'not found'], 404);
        }

        return response()->json(['reactions' => $this->reactionsOf($id)]);
    }

    /** POST /{path}/v1/comments/{id}/messages/{messageId}/reactions — toggle one emoji. */
    public function toggleReaction(Request $request, Loupe $loupe, string $id, string $messageId): JsonResponse
    {
        if ($this->comment($id) === null) {
            return response()->json(['error' => 'not found'], 404);
        }
        // The comment body is message #1 and has no row; its id is the thread's own.
        if ($messageId !== $id && ! Message::query()->where('comment_id', $id)->whereKey($messageId)->exists()) {
            return response()->json(['error' => 'not found'], 404);
        }
        $emoji = $request->input('emoji');
        if (! is_string($emoji) || $emoji === '' || mb_strlen($emoji) > 16) {
            return response()->json(['error' => 'emoji is required'], 422);
        }

        $who = $loupe->describeUser($loupe->resolveUser());
        $userId = (string) ($who['id'] ?? '');
        $existing = Reaction::query()->where(['message_id' => $messageId, 'emoji' => $emoji, 'user_id' => $userId])->first();
        if ($existing !== null) {
            $existing->delete();
        } else {
            Reaction::query()->create([
                'comment_id' => $id,
                'message_id' => $messageId,
                'emoji' => $emoji,
                'user_id' => $userId,
                'user_name' => is_string($who['name'] ?? null) ? $who['name'] : null,
                'created_at' => Carbon::now(),
            ]);
        }

        return response()->json(['reactions' => $this->reactionsOf($id)]);
    }

    /** @return list<array<string, string>> */
    private function reactionsOf(string $id): array
    {
        return Reaction::query()->where('comment_id', $id)->orderBy('id')->get()
            ->map(fn (Reaction $r) => $r->toLoupeArray())->values()->all();
    }

    private function comment(string $id): ?Model
    {
        $class = config('loupe.comment_model');

        return (new $class)->newQuery()->where('project_key', (string) config('loupe.project_key', 'app'))->find($id);
    }

    private function titleOf(Model $comment): string
    {
        $title = trim((string) $comment->title);

        return $title !== '' ? mb_substr($title, 0, 80) : mb_substr(trim((string) $comment->body), 0, 60);
    }
}
