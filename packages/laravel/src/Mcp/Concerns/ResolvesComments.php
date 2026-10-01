<?php

namespace Loupekit\Loupe\Mcp\Concerns;

use Illuminate\Database\Eloquent\Model;

trait ResolvesComments
{
    protected function comments(): Model
    {
        $class = config('loupe.comment_model');

        return new $class;
    }

    protected function projectKey(): string
    {
        return (string) config('loupe.project_key', 'app');
    }

    /** The target label for a comment (testid selector, cssPath, region, or free note). */
    protected function targetOf(Model $comment): string
    {
        $kind = $comment->kind ?? 'element';

        if ($kind === 'free') {
            return 'page-level note';
        }

        if ($kind === 'region' && ! empty($comment->region)) {
            $r = $comment->region;

            return sprintf('region %d×%d @ (%d, %d)', $r['w'] ?? 0, $r['h'] ?? 0, $r['x'] ?? 0, $r['y'] ?? 0);
        }

        $anchor = $comment->anchor ?? [];
        if (! empty($anchor['testid'])) {
            return '[data-testid="'.$anchor['testid'].'"]';
        }

        return $anchor['cssPath'] ?? '—';
    }

    /** The one-line summary: the title, or the first line of the description. */
    protected function titleOf(Model $comment): string
    {
        $title = trim((string) ($comment->title ?? ''));
        if ($title !== '') {
            return $title;
        }

        $first = trim(strtok((string) $comment->body, "\n") ?: '');

        return $first !== '' ? $first : '(no title)';
    }

    /**
     * A `**Attachments:**` block for the text part, when the reporter attached files.
     *
     * @return list<string>
     */
    protected function attachmentLines(Model $comment): array
    {
        $attachments = $comment->attachments ?? [];
        if (empty($attachments)) {
            return [];
        }

        $lines = ['', '**Attachments:**'];
        foreach ($attachments as $a) {
            $kind = ($a['kind'] ?? 'image') === 'video' ? '🎬' : '🖼';
            $lines[] = '- '.$kind.' '.($a['name'] ?? 'attachment').' — '.($a['url'] ?? '');
        }

        return $lines;
    }
}
