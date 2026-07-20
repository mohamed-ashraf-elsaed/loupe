<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Media storage. The SDK uploads a data URL here (a screenshot PNG, or a screen
 * recording webm) before saving the comment, then stores only the returned URL —
 * keeping comment rows small.
 */
class BlobController extends Controller
{
    /** Data-URL MIME → file extension (screenshots are png, recordings are webm). */
    private const MIME_EXT = [
        'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp',
        'image/gif' => 'gif', 'video/webm' => 'webm', 'video/mp4' => 'mp4',
    ];

    /** File extension → content type served back on GET. */
    private const EXT_MIME = [
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'webm' => 'video/webm', 'mp4' => 'video/mp4',
    ];

    /** POST /{path}/v1/blobs — accept a data URL, store the media, return its URL. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->input('data');
        if (! is_string($data) || strpos($data, 'data:') !== 0) {
            return response()->json(['error' => 'data (data URL) required'], 400);
        }

        $comma = strpos($data, ',');
        $binary = $comma === false ? '' : base64_decode(substr($data, $comma + 1), true);
        if ($binary === false || $binary === '') {
            return response()->json(['error' => 'invalid data URL'], 400);
        }

        $mime = preg_match('#^data:([^;,]+)#', $data, $m) === 1 ? strtolower($m[1]) : 'image/png';
        $name = ((string) Str::uuid()).'.'.(self::MIME_EXT[$mime] ?? 'png');
        Storage::disk($this->disk())->put($this->pathFor($name), $binary);

        return response()->json(['url' => route('loupe.blobs.show', ['id' => $name])], 201);
    }

    /** GET /{path}/v1/blobs/{id} — serve stored media (public, unguessable id). */
    public function show(string $id): Response
    {
        $name = basename($id); // defense-in-depth against traversal
        // Legacy ids were stored without an extension → resolve to the png file.
        if (! str_contains($name, '.')) {
            $name .= '.png';
        }
        $disk = Storage::disk($this->disk());
        $path = $this->pathFor($name);

        if (! $disk->exists($path)) {
            abort(404);
        }

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return response($disk->get($path), 200, [
            'Content-Type' => self::EXT_MIME[$ext] ?? 'image/png',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private function disk(): string
    {
        return (string) config('loupe.disk', 'public');
    }

    private function pathFor(string $name): string
    {
        $name = preg_replace('/[^a-zA-Z0-9_.-]/', '', $name) ?? '';

        return trim((string) config('loupe.blob_path', 'loupe/screenshots'), '/').'/'.$name;
    }
}
