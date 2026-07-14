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
}
