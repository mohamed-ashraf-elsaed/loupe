<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Loupekit\Loupe\Support\Url;

/**
 * The JSON API the SDK talks to. Every comment is scoped to this app's single
 * project key; identity is always the authenticated session user.
 */
class CommentController extends Controller
{
    /** GET /{path}/v1/comments?projectKey=&url= — list, newest first. */
    public function index(Request $request): JsonResponse
    {
        $query = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->orderByDesc('created_at');

        $url = $request->query('url');
        if (is_string($url) && $url !== '') {
            $query->where('url', Url::normalize($url));
        }

        $comments = $query->get()->map(fn ($c) => $c->toLoupeArray())->all();

        return response()->json($comments);
    }

    /** POST /{path}/v1/comments — upsert by id. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->all();

        if (! isset($data['id']) || ! is_string($data['id']) || $data['id'] === '') {
            return response()->json(['error' => 'id required'], 422);
        }

        // Identity is the session user — you cannot post as someone else.
        $userId = (string) $request->user()->getAuthIdentifier();
        $authorId = (string) data_get($data, 'author.id');
        if ($authorId !== '' && $authorId !== $userId) {
            return response()->json(['error' => 'cannot post as another user'], 403);
        }

        $attributes = [
            'project_key' => $this->projectKey(),
            'url' => Url::normalize((string) ($data['url'] ?? '/')),
            'status' => $data['status'] ?? 'open',
            'body' => (string) ($data['body'] ?? ''),
            'kind' => $data['kind'] ?? 'element',
            'author' => $data['author'] ?? ['id' => $userId, 'name' => 'User'],
            'author_id' => $userId,
            'anchor' => $data['anchor'] ?? [],
            'context' => $data['context'] ?? [],
            'offset' => $data['offset'] ?? ['x' => 0.5, 'y' => 0.5],
            'region' => $data['region'] ?? null,
            'screenshot_url' => $data['screenshot'] ?? null,
        ];

        $comment = $this->model()->newQuery()->find($data['id']);

        if ($comment === null) {
            $comment = $this->model()->newInstance();
            $comment->id = $data['id'];
            // Honor a client-supplied timestamp on first insert (matches the server).
            $created = isset($data['createdAt']) ? Carbon::parse($data['createdAt']) : Carbon::now();
            $comment->setCreatedAt($created);
            $comment->setUpdatedAt($created);
        }

        $comment->fill($attributes)->save();

        return response()->json($comment->fresh()->toLoupeArray(), 201);
    }

    /** PATCH /{path}/v1/comments/{id} — status/body only. */
    public function update(Request $request, string $id): JsonResponse
    {
        $comment = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($id);

        if ($comment === null) {
            return response()->json(['error' => 'not found'], 404);
        }

        $patch = [];
        foreach (['status', 'body'] as $field) {
            if ($request->has($field)) {
                $patch[$field] = $request->input($field);
            }
        }
        if ($patch !== []) {
            $comment->fill($patch)->save();
        }

        return response()->json($comment->fresh()->toLoupeArray());
    }

    /** DELETE /{path}/v1/comments/{id}. */
    public function destroy(string $id): JsonResponse
    {
        $comment = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($id);

        if ($comment !== null) {
            $comment->delete();
        }

        return response()->json([], 204);
    }

    private function model(): Model
    {
        $class = config('loupe.comment_model');

        return new $class;
    }

    private function projectKey(): string
    {
        return (string) config('loupe.project_key', 'app');
    }
}
