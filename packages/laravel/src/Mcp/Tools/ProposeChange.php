<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Carbon;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;

class ProposeChange extends Tool
{
    use ResolvesComments;

    protected string $description = 'Submit the modified UI for a comment: the rewritten HTML (and optional CSS) that resolves the request. Stores your proposal on the comment so the dev team can review the code and a live preview in the dashboard. Call get_comment first for the original element, its styles and the screenshot.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('The comment id.')->required(),
            'html' => $schema->string()->description('The modified element markup implementing the requested change.')->required(),
            'css' => $schema->string()->description('Accompanying CSS. Omit if the styling is inlined in the HTML.'),
            'notes' => $schema->string()->description('A short explanation of what changed and why.'),
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

        $comment->proposal = array_filter([
            'html' => (string) $request->get('html'),
            'css' => $request->get('css'),
            'notes' => $request->get('notes'),
            'author' => 'Claude Code via MCP',
            'createdAt' => Carbon::now()->toISOString(),
        ], fn ($v) => $v !== null);
        $comment->save();

        return Response::text('Proposal saved for #'.$comment->id.'. The dev team can now review your modified HTML/CSS in the dashboard.');
    }
}
