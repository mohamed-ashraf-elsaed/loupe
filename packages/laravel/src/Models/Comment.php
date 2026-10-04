<?php

namespace Loupekit\Loupe\Models;

use Illuminate\Database\Eloquent\Model;
use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Support\Triage;

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
 * @property string|null $title
 * @property string $kind
 * @property array $author
 * @property string|null $author_id
 * @property array $anchor
 * @property array $context
 * @property array $offset
 * @property array|null $region
 * @property string|null $screenshot_url
 * @property string|null $recording_url
 * @property array|null $attachments
 * @property array|null $proposal
 * @property array|null $pr
 * @property array|null $source
 * @property array|null $forwarded
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
        'viewport' => 'array',
        'attachments' => 'array',
        'proposal' => 'array',
        'pr' => 'array',
        'source' => 'array',
        'forwarded' => 'array',
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
            'title' => $this->title,
            'body' => $this->body,
            // Normalize on read too, so a row written before the five-stage board
            // still lands on a column even if the data migration has not run.
            'status' => Stages::normalize($this->status),
            // Triage metadata, defaulted for rows written before it existed.
            'priority' => Triage::normalizePriority($this->priority),
            'changeType' => Triage::normalizeType($this->change_type),
            'kind' => $this->kind ?: 'element',
            'anchor' => $this->anchor,
            'context' => $this->context,
            'offset' => $this->offset,
            'screenshot' => $this->screenshot_url,
            'createdAt' => optional($this->created_at)->toISOString(),
        ];

        // Files the reporter attached by hand (images and/or videos).
        if (! empty($this->attachments)) {
            $out['attachments'] = $this->attachments;
        }

        // Present only for region comments (keeps element comments identical to before).
        if (! empty($this->region)) {
            $out['region'] = $this->region;
        }

        // Branch-aware threads: which repo/branch this was filed against.
        if (! empty($this->repo)) {
            $out['repo'] = $this->repo;
        }

        if (! empty($this->branch)) {
            $out['branch'] = $this->branch;
        }

        if (! empty($this->viewport)) {
            $out['viewport'] = $this->viewport;
        }

        // A screen recording (webm), for region comments made with the Record tool.
        if (! empty($this->recording_url)) {
            $out['recording'] = $this->recording_url;
        }

        // Claude's proposed UI change, shown to the dev team in the dashboard.
        if (! empty($this->proposal)) {
            $out['proposal'] = $this->proposal;
        }

        // The pull request carrying this thread's fix (panel lifecycle chip).
        if (! empty($this->pr)) {
            $out['pr'] = $this->pr;
        }

        // A ticket received from another project in the organization, through Loupe Hub.
        if (! empty($this->source)) {
            $out['source'] = $this->source;
        }

        // Where Loupe Hub sent this comment, and whether it arrived.
        if (! empty($this->forwarded)) {
            $out['forwarded'] = $this->forwarded;
        }

        return $out;
    }
}
