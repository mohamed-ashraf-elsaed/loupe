<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Screenshot storage. The SDK uploads a data URL here before saving the comment,
 * then stores only the returned URL — keeping comment rows small.
 */
class BlobController extends Controller
{
    /** POST /{path}/v1/blobs — accept a data URL, store a PNG, return its URL. */
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

        $id = (string) Str::uuid();
        Storage::disk($this->disk())->put($this->pathFor($id), $binary);

        return response()->json(['url' => route('loupe.blobs.show', ['id' => $id])], 201);
    }

    /** GET /{path}/v1/blobs/{id} — serve a stored screenshot (public, unguessable id). */
    public function show(string $id): Response
    {
        $id = basename($id); // defense-in-depth against traversal
        $disk = Storage::disk($this->disk());
        $path = $this->pathFor($id);

        if (! $disk->exists($path)) {
            abort(404);
        }

        return response($disk->get($path), 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private function disk(): string
    {
        return (string) config('loupe.disk', 'public');
    }

    private function pathFor(string $id): string
    {
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $id) ?? '';

        return trim((string) config('loupe.blob_path', 'loupe/screenshots'), '/').'/'.$id.'.png';
    }
}
