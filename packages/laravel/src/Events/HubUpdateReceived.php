<?php

namespace Loupekit\Loupe\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * Fired after Loupe Hub delivers an update for a ticket this app already holds:
 * the status the other project gave it, or a reply written there.
 *
 * @see \Loupekit\Loupe\Support\Relay for the update shape
 */
class HubUpdateReceived
{
    /**
     * @param  array{kind: string, status?: string, label?: ?string, reference?: ?string, url?: ?string, message?: array<string, mixed>}  $update
     * @param  array{project_id: string, project_name?: ?string}  $from
     */
    public function __construct(
        public Model $comment,
        public array $update,
        public array $from,
    ) {}
}
