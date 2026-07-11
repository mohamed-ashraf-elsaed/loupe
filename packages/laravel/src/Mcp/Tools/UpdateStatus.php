<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;

class UpdateStatus extends Tool
{
    use ResolvesComments;

    protected string $description = 'Update the status of a Loupe comment to open, in_progress or done.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('The comment id.')->required(),
            'status' => $schema->string()->description('New status: open, in_progress or done.')->required(),
        ];
    }

    public function handle(Request $request): Response
    {
        $status = $request->get('status');
        if (! in_array($status, ['open', 'in_progress', 'done'], true)) {
            return Response::error('status must be one of: open, in_progress, done.');
        }

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
