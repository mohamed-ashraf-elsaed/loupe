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

    /** The element target label for a comment (testid selector, cssPath, or region). */
    protected function targetOf(Model $comment): string
    {
        if (($comment->kind ?? 'element') === 'region' && ! empty($comment->region)) {
            $r = $comment->region;

            return sprintf('region %d×%d @ (%d, %d)', $r['w'] ?? 0, $r['h'] ?? 0, $r['x'] ?? 0, $r['y'] ?? 0);
        }

        $anchor = $comment->anchor ?? [];
        if (! empty($anchor['testid'])) {
            return '[data-testid="'.$anchor['testid'].'"]';
        }

        return $anchor['cssPath'] ?? '—';
    }
}
