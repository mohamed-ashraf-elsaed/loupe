<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Support\Hub;
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
    public function store(Request $request, Loupe $loupe): JsonResponse
    {
        $data = $request->all();

        if (! isset($data['id']) || ! is_string($data['id']) || $data['id'] === '') {
            return response()->json(['error' => 'id required'], 422);
        }

        // The widget posts the identity it was handed — describeUser(), which an app may
        // override via config('loupe.user_resolver') (e.g. to attribute comments made
        // while an admin impersonates a user to the ADMIN, not the impersonated account).
        // Compare against THAT identity: checking the raw session user instead would
        // reject a custom resolver with "cannot post as another user".
        $user = $loupe->resolveUser();
        $identity = $user === null ? '' : $loupe->describeUser($user)['id'] ?? '';
        $authorId = (string) data_get($data, 'author.id');
        if ($authorId !== '' && $authorId !== (string) $identity) {
            return response()->json(['error' => 'cannot post as another user'], 403);
        }

        $attributes = [
            'project_key' => $this->projectKey(),
            'url' => Url::normalize((string) ($data['url'] ?? '/')),
            'status' => $data['status'] ?? 'open',
            'title' => is_string($data['title'] ?? null) && $data['title'] !== '' ? mb_substr($data['title'], 0, 255) : null,
            'body' => (string) ($data['body'] ?? ''),
            'kind' => $data['kind'] ?? 'element',
            'author' => $data['author'] ?? ['id' => $identity, 'name' => 'User'],
            'author_id' => $identity,
            'anchor' => $data['anchor'] ?? [],
            'context' => $data['context'] ?? [],
            'offset' => $data['offset'] ?? ['x' => 0.5, 'y' => 0.5],
            'region' => $data['region'] ?? null,
            'viewport' => $data['viewport'] ?? null,
            'screenshot_url' => $data['screenshot'] ?? null,
            'recording_url' => $data['recording'] ?? null,
            // Files the reporter attached (images/videos) — a JSON array of Attachments.
            'attachments' => is_array($data['attachments'] ?? null) ? $data['attachments'] : null,
            'proposal' => $data['proposal'] ?? null,
        ];

        $comment = $this->model()->newQuery()->find($data['id']);
        $isNew = $comment === null;

        if ($isNew) {
            $comment = $this->model()->newInstance();
            $comment->id = $data['id'];
            // Honor a client-supplied timestamp on first insert (matches the server).
            $created = isset($data['createdAt']) ? Carbon::parse($data['createdAt']) : Carbon::now();
            $comment->setCreatedAt($created);
            $comment->setUpdatedAt($created);
        }

        $comment->fill($attributes)->save();
        $issue = $comment->fresh()->toLoupeArray();

        // Only brand-new comments go to Loupe Hub (not later edits of the same id).
        if ($isNew && Hub::enabled()) {
            Hub::forward($loupe->describeUser($loupe->resolveUser()), $issue);
        }

        return response()->json($issue, 201);
    }

    /** PATCH /{path}/v1/comments/{id} — status, body, or proposal (Claude's modified UI). */
    public function update(Request $request, string $id): JsonResponse
    {
        $comment = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($id);

        if ($comment === null) {
            return response()->json(['error' => 'not found'], 404);
        }

        $patch = [];
        foreach (['status', 'title', 'body', 'proposal'] as $field) {
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
