<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * One item in a user's widget inbox.
 *
 * @property string $id
 * @property string $project_key
 * @property string $recipient_id
 * @property string $comment_id
 * @property string $kind
 * @property string $body
 * @property string|null $actor_name
 */
class Notification extends Model
{
    use HasUlids;

    public const UPDATED_AT = null;

    protected $table = 'loupe_notifications';

    protected $guarded = [];

    protected $casts = ['read_at' => 'datetime'];

    /** @return array<string, mixed> */
    public function toLoupeArray(): array
    {
        $out = [
            'id' => $this->id,
            'threadId' => $this->comment_id,
            'kind' => $this->kind,
            'body' => $this->body,
            'createdAt' => optional($this->created_at)->toISOString(),
        ];
        if ($this->actor_name !== null && $this->actor_name !== '') {
            $out['actorName'] = $this->actor_name;
        }
        if ($this->read_at !== null) {
            $out['readAt'] = $this->read_at->toISOString();
        }

        return $out;
    }
}
