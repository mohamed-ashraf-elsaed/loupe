<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;

/** Fired after a comment is deleted. The model still holds its last attributes. */
class CommentDeleted
{
    public function __construct(public Model $comment) {}
}
