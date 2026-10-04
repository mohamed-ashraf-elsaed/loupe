<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One person's emoji on one message. {@see toLoupeArray()} is `Reaction` from @loupekit/shared.
 *
 * @property string $comment_id
 * @property string $message_id
 * @property string $emoji
 * @property string $user_id
 * @property string|null $user_name
 */
class Reaction extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'loupe_reactions';

    protected $guarded = [];

    /** @return array<string, string> */
    public function toLoupeArray(): array
    {
        $out = ['messageId' => $this->message_id, 'emoji' => $this->emoji, 'userId' => $this->user_id];
        if ($this->user_name !== null && $this->user_name !== '') {
            $out['userName'] = $this->user_name;
        }

        return $out;
    }
}
