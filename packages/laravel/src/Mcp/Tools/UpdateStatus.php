<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;
use Loupekit\Loupe\Support\Stages;

class UpdateStatus extends Tool
{
    use ResolvesComments;

    protected string $description = 'Move a Loupe comment along the board: queue, todo, in_progress, in_review or resolved. Set in_review when the change is ready for a human — only a person resolves a comment.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('The comment id.')->required(),
            'status' => $schema->string()->description('New stage: queue, todo, in_progress, in_review or resolved. The legacy names open and done are accepted too.')->required(),
        ];
    }

    public function handle(Request $request): Response
    {
        // Normalize first so a legacy `open` / `done` still lands on a stage.
        $status = Stages::normalize($request->get('status'));

        $comment = $this->comments()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($request->get('id'));

        if ($comment === null) {
            return Response::error('Comment not found.');
        }

        $comment->status = $status;
        $comment->save();

        return Response::json(['id' => $comment->id, 'status' => $comment->status]);
    }
}
