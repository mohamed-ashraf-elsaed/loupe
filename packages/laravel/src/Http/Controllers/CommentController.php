<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Loupe;
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
    /**
     * Keep only the attributes this table actually has.
     *
     * A package upgrade must never make an app *unable to file feedback*. That is
     * exactly what happened when `pr` landed: the controller wrote a column the host
     * had not migrated yet, so every create raised a QueryException and returned a
     * 500. Dropping unknown attributes degrades instead — the newest fields simply
     * stay empty until `php artisan migrate` runs — and says so in the log.
     *
     * The column list is fetched on every call rather than cached. Caching it in a
     * static looked tempting and is wrong: under Octane or a queue worker the process
     * outlives a migration, so a worker started before `php artisan migrate` would
     * keep writing the old shape until it was restarted. This runs on the write path
     * only, where one metadata query is nothing.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    protected function onlyExistingColumns(array $attributes): array
    {
        $table = $this->model()->getTable();
        $columns = array_fill_keys(Schema::getColumnListing($table), true);

        $kept = array_filter($attributes, static fn ($value, $key) => isset($columns[$key]), ARRAY_FILTER_USE_BOTH);
        $missing = array_keys(array_diff_key($attributes, $kept));
        if ($missing) {
            Log::warning(
                '[loupe] '.$table.' is missing '.implode(', ', $missing).
                ' — run `php artisan migrate` to add '.(count($missing) === 1 ? 'it' : 'them').'.'
            );
        }

        return $kept;
    }

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

        $comment->fill($this->onlyExistingColumns($attributes))->save();
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
            $comment->fill($this->onlyExistingColumns($patch))->save();
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
