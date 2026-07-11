<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A single piece of visual feedback.
 *
 * The row shape mirrors @loupekit/shared's `Comment`; {@see toLoupeArray()}
 * remaps it back to the exact JSON the SDK and dashboard expect.
 *
 * @property string $id
 * @property string $project_key
 * @property string $url
 * @property string $status
 * @property string $body
 * @property string $kind
 * @property array $author
 * @property string|null $author_id
 * @property array $anchor
 * @property array $context
 * @property array $offset
 * @property array|null $region
 * @property string|null $screenshot_url
 */
class Comment extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = [
        'author' => 'array',
        'anchor' => 'array',
        'context' => 'array',
        'offset' => 'array',
        'region' => 'array',
    ];

    public function getTable()
    {
        return config('loupe.table', 'loupe_comments');
    }

    /**
     * The canonical Loupe `Comment` JSON shape (matches @loupekit/shared).
     *
     * @return array<string, mixed>
     */
    public function toLoupeArray(): array
    {
        $out = [
            'id' => $this->id,
            'projectKey' => $this->project_key,
            'url' => $this->url,
            'author' => $this->author,
            'body' => $this->body,
            'status' => $this->status,
            'kind' => $this->kind ?: 'element',
            'anchor' => $this->anchor,
            'context' => $this->context,
            'offset' => $this->offset,
            'screenshot' => $this->screenshot_url,
            'createdAt' => optional($this->created_at)->toISOString(),
        ];

        // Present only for region comments (keeps element comments identical to before).
        if (! empty($this->region)) {
            $out['region'] = $this->region;
        }

        return $out;
    }
}
