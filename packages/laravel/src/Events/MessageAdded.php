<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;
use Loupekit\Loupe\Models\Message;

/**
 * Fired after a reply is stored on a thread. `$message->origin` is set when the
 * reply was written in another project and arrived through Loupe Hub.
 */
class MessageAdded
{
    public function __construct(
        public Model $comment,
        public Message $message,
    ) {}
}
