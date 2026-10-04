<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * Fired after a comment is stored, however it was stored: the widget, the
 * dashboard, a Hub delivery or the host app saving the model itself.
 */
class CommentCreated
{
    public function __construct(public Model $comment) {}
}
