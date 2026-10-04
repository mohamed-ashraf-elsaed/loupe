<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * A reply on a comment thread.
 *
 * {@see toLoupeArray()} returns the `ThreadMessage` shape from @loupekit/shared.
 *
 * @property string $id
 * @property string $comment_id
 * @property array $author
 * @property string $body
 * @property array|null $attachments
 * @property array|null $origin
 */
class Message extends Model
{
    use HasUlids;

    protected $table = 'loupe_messages';

    protected $guarded = [];

    protected $casts = [
        'author' => 'array',
        'attachments' => 'array',
        'origin' => 'array',
        'deleted_at' => 'datetime',
    ];

    /** @return array<string, mixed> */
    public function toLoupeArray(): array
    {
        $out = [
            'id' => $this->id,
            'threadId' => $this->comment_id,
            'author' => $this->author,
            'body' => $this->body,
            'createdAt' => optional($this->created_at)->toISOString(),
        ];
        if (! empty($this->attachments)) {
            $out['attachments'] = $this->attachments;
        }
        if (! empty($this->origin)) {
            $out['origin'] = $this->origin;
        }
        if ($this->deleted_at !== null) {
            $out['deletedAt'] = $this->deleted_at->toISOString();
        }

        return $out;
    }
}
