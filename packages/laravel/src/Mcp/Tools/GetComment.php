<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;

class GetComment extends Tool
{
    use ResolvesComments;

    protected string $description = 'Get one Loupe comment as a Claude-ready package: the request, the target element HTML, its computed styles and a screenshot URL.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('The comment id.')->required(),
        ];
    }

    public function handle(Request $request): Response
    {
        $comment = $this->comments()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($request->get('id'));

        if ($comment === null) {
            return Response::error('Comment not found.');
        }

        $context = $comment->context ?? [];
        $styles = $context['styles'] ?? [];

        $markdown = implode("\n", [
            '# Product feedback from '.data_get($comment->author, 'name', 'a user'),
            '',
            '**Request:** '.$comment->body,
            '**Status:** '.$comment->status,
            '**Page:** '.$comment->url,
            '**Target:** `'.$this->targetOf($comment).'`',
            $comment->screenshot_url ? '**Screenshot:** '.$comment->screenshot_url : '',
            '',
            '## Target element HTML',
            '```html',
            (string) ($context['html'] ?? ''),
            '```',
            '',
            '## Computed styles',
            '```json',
            json_encode($styles, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            '```',
        ]);

        return Response::text($markdown);
    }
}
