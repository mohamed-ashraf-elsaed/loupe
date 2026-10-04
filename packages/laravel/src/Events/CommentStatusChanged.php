<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * Fired after a comment's board status changes, however it changed: the widget,
 * the dashboard, an MCP tool, a Hub update or the host app saving the model.
 * `$from` and `$to` are normalized stages (`queue` … `resolved`).
 */
class CommentStatusChanged
{
    public function __construct(
        public Model $comment,
        public string $from,
        public string $to,
    ) {}
}
