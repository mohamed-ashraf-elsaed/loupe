<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;
use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Support\Url;

class ListComments extends Tool
{
    use ResolvesComments;

    protected string $description = 'List Loupe feedback comments, newest first. Optionally filter by stage (queue, todo, in_progress, in_review, resolved) or by page url.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'status' => $schema->string()->description('Filter by stage: queue, todo, in_progress, in_review or resolved. The legacy names open and done are accepted too.'),
            'url' => $schema->string()->description('Filter by page URL.'),
        ];
    }

    public function handle(Request $request): Response
    {
        $query = $this->comments()->newQuery()
            ->where('project_key', $this->projectKey())
            ->orderByDesc('created_at');

        if ($status = $request->get('status')) {
            // Normalize, and match pre-board rows too (`open` / `done`).
            $query->whereIn('status', Stages::withLegacy(Stages::normalize($status)));
        }
        if ($url = $request->get('url')) {
            $query->where('url', Url::normalize($url));
        }

        $rows = $query->get()->map(fn ($c) => [
            'id' => $c->id,
            // Report the canonical stage, so a pre-board row reads the same as a new one.
            'status' => Stages::normalize($c->status),
            'author' => data_get($c->author, 'name'),
            'title' => $this->titleOf($c),
            'body' => $c->body,
            'url' => $c->url,
            'target' => $this->targetOf($c),
            'attachments' => count($c->attachments ?? []),
            'createdAt' => optional($c->created_at)->toISOString(),
        ])->all();

        return Response::json([
            'count' => count($rows),
            'comments' => $rows,
        ]);
    }
}
