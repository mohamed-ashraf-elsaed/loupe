<?php

namespace Loupekit\Loupe\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Loupekit\Loupe\Mcp\Concerns\ResolvesComments;

class GetComment extends Tool
{
    use ResolvesComments;

    protected string $description = 'Get one Loupe comment as a Claude-ready package: the request, the target element HTML, its computed styles, the screenshot (as an image) and any screen recording. After you rewrite the UI, call propose_change to send the modified HTML/CSS back to the dev team.';

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => $schema->string()->description('The comment id.')->required(),
        ];
    }

    /** @return Response|array<int, Response> */
    public function handle(Request $request): Response|array
    {
        $comment = $this->comments()->newQuery()
            ->where('project_key', $this->projectKey())
            ->find($request->get('id'));

        if ($comment === null) {
            return Response::error('Comment not found.');
        }

        // Free notes aren't tied to an element — return a compact, element-free package.
        if (($comment->kind ?? 'element') === 'free') {
            $lines = array_merge([
                '# Product feedback from '.data_get($comment->author, 'name', 'a user'),
                '',
                '**Title:** '.$this->titleOf($comment),
                '**Note:** '.$comment->body,
                '**Status:** '.$comment->status,
                '**Page:** '.$comment->url,
                '**Type:** Free note — a page-level comment, not tied to a specific element.',
            ], $this->attachmentLines($comment));

            $responses = [Response::text(implode("\n", $lines))];
            foreach ($this->imageAttachments($comment) as $image) {
                $responses[] = $image;
            }

            return count($responses) === 1 ? $responses[0] : $responses;
        }

        $context = $comment->context ?? [];
        $styles = $context['styles'] ?? [];

        $lines = array_merge([
            '# Product feedback from '.data_get($comment->author, 'name', 'a user'),
            '',
            '**Title:** '.$this->titleOf($comment),
            '**Request:** '.$comment->body,
            '**Status:** '.$comment->status,
            '**Page:** '.$comment->url,
            '**Target:** `'.$this->targetOf($comment).'`',
            $comment->screenshot_url ? '**Screenshot:** '.$comment->screenshot_url : '',
            $comment->recording_url ? '**Screen recording (webm):** '.$comment->recording_url : '',
        ], $this->attachmentLines($comment), [
            '',
            '## Target element HTML',
            '```html',
            (string) ($context['html'] ?? ''),
            '```',
            '',
            '## Computed styles',
            '```json',
            json_encode($styles, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            '```',
        ]);

        // Surface an existing proposal so Claude can iterate rather than start over.
        if (! empty($comment->proposal)) {
            $p = $comment->proposal;
            $lines = array_merge($lines, array_filter([
                '',
                '## Existing proposal (by '.($p['author'] ?? 'unknown').')',
                $p['notes'] ?? '',
                '```html',
                (string) ($p['html'] ?? ''),
                '```',
            ]));
            if (! empty($p['css'])) {
                $lines = array_merge($lines, ['```css', (string) $p['css'], '```']);
            }
        }

        $lines[] = '';
        $lines[] = '---';
        $lines[] = 'When you have rewritten this UI, call propose_change(id: "'.$comment->id.'", html, css?, notes?) so the dev team sees your modified HTML/CSS in the dashboard.';

        $responses = [Response::text(implode("\n", $lines))];

        // Attach the real pixels: the auto screenshot and every image the reporter attached.
        if ($image = $this->screenshotImage($comment)) {
            $responses[] = $image;
        }
        foreach ($this->imageAttachments($comment) as $image) {
            $responses[] = $image;
        }

        return $responses;
    }

    /**
     * Read the reporter's IMAGE attachments back as image responses (videos stay URL text).
     *
     * @return list<Response>
     */
    protected function imageAttachments(Model $comment): array
    {
        $out = [];
        foreach ($comment->attachments ?? [] as $a) {
            if (($a['kind'] ?? 'image') !== 'image') {
                continue;
            }
            $image = $this->attachmentImage((string) ($a['url'] ?? ''));
            if ($image !== null) {
                $out[] = $image;
            }
        }

        return $out;
    }

    /** Read a locally-stored image attachment back as an image response. */
    protected function attachmentImage(string $url): ?Response
    {
        if ($url === '') {
            return null;
        }

        $name = preg_replace('/[^a-zA-Z0-9_.-]/', '', (string) basename((string) parse_url($url, PHP_URL_PATH)));
        $mime = [
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
        ][strtolower((string) pathinfo((string) $name, PATHINFO_EXTENSION))] ?? null;

        if ($mime === null) {
            return null; // videos/other files are not image blocks
        }

        $disk = (string) config('loupe.disk', 'public');
        $path = trim((string) config('loupe.blob_path', 'loupe/screenshots'), '/').'/'.$name;
        if (! Storage::disk($disk)->exists($path)) {
            return null;
        }

        return Response::image(Storage::disk($disk)->get($path), $mime);
    }

    /**
     * Read a locally-stored screenshot back as an image response so Claude sees the
     * actual pixels, not just a URL. Returns null for external/absent screenshots.
     */
    protected function screenshotImage(Model $comment): ?Response
    {
        $url = $comment->screenshot_url;
        if (! is_string($url) || $url === '') {
            return null;
        }

        $name = basename((string) parse_url($url, PHP_URL_PATH));
        if (! str_contains($name, '.')) {
            $name .= '.png';
        }
        $name = preg_replace('/[^a-zA-Z0-9_.-]/', '', (string) $name);
        if (! str_ends_with($name, '.png')) {
            return null; // only PNG screenshots embed as an image block
        }

        $disk = (string) config('loupe.disk', 'public');
        $path = trim((string) config('loupe.blob_path', 'loupe/screenshots'), '/').'/'.$name;
        if (! Storage::disk($disk)->exists($path)) {
            return null;
        }

        return Response::image(Storage::disk($disk)->get($path), 'image/png');
    }
}
