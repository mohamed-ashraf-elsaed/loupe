<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * One row of the widget's Activity feed.
 *
 * {@see toLoupeArray()} returns the `ActivityEvent` shape from @loupekit/shared.
 *
 * @property string $id
 * @property string $project_key
 * @property string $kind
 * @property string $label
 * @property string|null $detail
 * @property string $level
 * @property string|null $comment_id
 * @property array|null $actor
 */
class Activity extends Model
{
    use HasUlids;

    public const UPDATED_AT = null;

    protected $table = 'loupe_activity';

    protected $guarded = [];

    protected $casts = [
        'actor' => 'array',
    ];

    /** @return array<string, mixed> */
    public function toLoupeArray(): array
    {
        $out = [
            'id' => $this->id,
            'at' => optional($this->created_at)->toISOString(),
            'kind' => $this->kind,
            'label' => $this->label,
            'level' => $this->level,
        ];
        if ($this->detail !== null && $this->detail !== '') {
            $out['detail'] = $this->detail;
        }
        if ($this->comment_id !== null) {
            $out['commentId'] = $this->comment_id;
        }
        if (! empty($this->actor)) {
            $out['actor'] = $this->actor;
        }

        return $out;
    }
}
