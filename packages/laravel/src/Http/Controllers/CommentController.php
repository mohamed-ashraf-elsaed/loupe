<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Support\ActivityLog;
use Loupekit\Loupe\Support\Columns;
use Loupekit\Loupe\Support\Hub;
use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Support\Triage;
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

        // Filter in SQL, so a board with thousands of rows never ships them all.
        foreach (['repo', 'branch'] as $column) {
            $value = $request->query($column);
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }

        $status = $request->query('status');
        if (is_string($status) && $status !== '') {
            // Normalize, and match pre-board rows too (`open` / `done`).
            $query->whereIn('status', Stages::withLegacy(Stages::normalize($status)));
        }

        $priority = $request->query('priority');
        if (is_string($priority) && $priority !== '') {
            $query->where('priority', Triage::normalizePriority($priority));
        }

        $changeType = $request->query('changeType');
        if (is_string($changeType) && $changeType !== '') {
            $query->where('change_type', Triage::normalizeType($changeType));
        }

        $kind = $request->query('kind');
        if (is_string($kind) && $kind !== '') {
            $query->where('kind', $kind);
        }

        $q = $request->query('q');
        if (is_string($q) && $q !== '') {
            $like = '%'.mb_strtolower($q).'%';
            $query->where(function ($w) use ($like) {
                $w->whereRaw("lower(coalesce(title, '')) like ?", [$like])
                    ->orWhereRaw('lower(body) like ?', [$like]);
            });
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
            'status' => Stages::normalize($data['status'] ?? null),
            'priority' => Triage::normalizePriority($data['priority'] ?? null),
            'change_type' => Triage::normalizeType($data['changeType'] ?? null),
            // Branch-aware threads: which repo/branch this was filed against.
            'repo' => is_string($data['repo'] ?? null) && $data['repo'] !== '' ? mb_substr($data['repo'], 0, 191) : null,
            'branch' => is_string($data['branch'] ?? null) && $data['branch'] !== '' ? mb_substr($data['branch'], 0, 191) : null,
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
            // The pull request carrying this thread's fix (panel lifecycle chip).
            'pr' => is_array($data['pr'] ?? null) ? $data['pr'] : null,
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

        $comment->fill(Columns::only($this->model(), $attributes))->save();
        $issue = $comment->fresh()->toLoupeArray();
        $actor = $this->actor($loupe);
        ActivityLog::record(
            $isNew ? 'comment.create' : 'comment.update',
            ($isNew ? ActivityLog::actorName($actor).' added “' : ActivityLog::actorName($actor).' edited “').$this->titleOf($issue).'”',
            $issue['url'] ?? null,
            commentId: $issue['id'],
            actor: $actor,
        );

        // Only brand-new comments go to Loupe Hub (not later edits of the same id).
        if ($isNew && Hub::enabled()) {
            Hub::forward($loupe->describeUser($loupe->resolveUser()), $issue);
        }

        return response()->json($issue, 201);
    }

    /** PATCH /{path}/v1/comments/{id} — status, body, or proposal (Claude's modified UI). */
    public function update(Request $request, Loupe $loupe, string $id): JsonResponse
    {
        $comment = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($id);

        if ($comment === null) {
            return response()->json(['error' => 'not found'], 404);
        }

        $patch = [];
        foreach (['status', 'title', 'body', 'proposal', 'pr'] as $field) {
            if ($request->has($field)) {
                // A legacy `open` / `done` from an older client still lands on a stage.
                $patch[$field] = $field === 'status'
                    ? Stages::normalize($request->input($field))
                    : $request->input($field);
            }
        }
        // Triage metadata. The API speaks camelCase `changeType`; the column is snake.
        if ($request->has('priority')) {
            $patch['priority'] = Triage::normalizePriority($request->input('priority'));
        }
        if ($request->has('changeType')) {
            $patch['change_type'] = Triage::normalizeType($request->input('changeType'));
        }
        if ($patch !== []) {
            $before = Stages::normalize($comment->status);
            $comment->fill(Columns::only($this->model(), $patch))->save();
            $issue = $comment->fresh()->toLoupeArray();
            $actor = $this->actor($loupe);
            $moved = isset($patch['status']) && $issue['status'] !== $before;
            ActivityLog::record(
                $moved ? 'comment.status' : 'comment.update',
                $moved
                    ? ActivityLog::actorName($actor).' moved “'.$this->titleOf($issue).'” to '.(Stages::LABELS[$issue['status']] ?? $issue['status'])
                    : ActivityLog::actorName($actor).' edited “'.$this->titleOf($issue).'”',
                commentId: $issue['id'],
                actor: $actor,
            );

            return response()->json($issue);
        }

        return response()->json($comment->fresh()->toLoupeArray());
    }

    /** DELETE /{path}/v1/comments/{id}. */
    public function destroy(Loupe $loupe, string $id): JsonResponse
    {
        $comment = $this->model()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($id);

        if ($comment !== null) {
            $title = $this->titleOf($comment->toLoupeArray());
            $comment->delete();
            $actor = $this->actor($loupe);
            ActivityLog::record('comment.delete', ActivityLog::actorName($actor).' deleted “'.$title.'”', commentId: $id, actor: $actor);
        }

        return response()->json([], 204);
    }

    /**
     * `{id, name}` of the signed-in user, for the Activity feed. The routes sit
     * behind loupe.auth, so a user is always present; null is only the type's honesty.
     */
    private function actor(Loupe $loupe): ?array
    {
        $user = $loupe->resolveUser();
        $who = $user === null ? null : $loupe->describeUser($user);

        return $who === null ? null : ['id' => (string) ($who['id'] ?? ''), 'name' => (string) ($who['name'] ?? '')];
    }

    /** A short display title: the title, else the start of the body. */
    private function titleOf(array $issue): string
    {
        $title = trim((string) ($issue['title'] ?? ''));

        return $title !== '' ? mb_substr($title, 0, 80) : mb_substr(trim((string) ($issue['body'] ?? '')), 0, 60);
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
