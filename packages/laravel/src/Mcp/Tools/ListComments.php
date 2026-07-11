<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;
use Loupekit\Loupe\Support\Url;

class ListComments extends Tool
{
    use ResolvesComments;

    protected string $description = 'List Loupe feedback comments, newest first. Optionally filter by status (open, in_progress, done) or by page url.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'status' => $schema->string()->description('Filter by status: open, in_progress or done.'),
            'url' => $schema->string()->description('Filter by page URL.'),
        ];
    }

    public function handle(Request $request): Response
    {
        $query = $this->comments()->newQuery()
            ->where('project_key', $this->projectKey())
            ->orderByDesc('created_at');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
        if ($url = $request->get('url')) {
            $query->where('url', Url::normalize($url));
        }

        $rows = $query->get()->map(fn ($c) => [
            'id' => $c->id,
            'status' => $c->status,
            'author' => data_get($c->author, 'name'),
            'body' => $c->body,
            'url' => $c->url,
            'target' => $this->targetOf($c),
            'createdAt' => optional($c->created_at)->toISOString(),
        ])->all();

        return Response::json([
            'count' => count($rows),
            'comments' => $rows,
        ]);
    }
}
