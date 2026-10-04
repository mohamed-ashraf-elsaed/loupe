<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * Fired after a ticket from another project in the organization has been stored
 * in this app's comments table. Listen for it to turn the ticket into a record
 * of your own (a support case, a task in your tracker).
 *
 * It is dispatched inside the same database transaction that stores the comment.
 * A listener that throws rolls the comment back and Hub gets a 500, so Hub's
 * retry runs the whole receive again instead of finding a half-handled duplicate.
 * A queued listener is retried by your queue instead.
 */
class TicketReceived
{
    /**
     * @param  Model  $comment  the stored comment (config('loupe.comment_model'))
     * @param  array{projectId: string, projectName: ?string, organizationId: ?string, organizationName: ?string, deliveryId: ?string, receivedAt: ?string}  $source
     * @param  array{email: string, name?: string}  $user  who filed it, as Hub verified them
     */
    public function __construct(
        public Model $comment,
        public array $source,
        public array $user,
    ) {}
}
