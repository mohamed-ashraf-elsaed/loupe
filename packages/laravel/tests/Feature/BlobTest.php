<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Loupekit\Loupe\Tests\TestCase;

class BlobTest extends TestCase
{
    /** A 1x1 transparent PNG. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoK1kX0AAAAASUVORK5CYII=';

    public function test_it_stores_a_screenshot_and_returns_a_url(): void
    {
        Storage::fake('public');
        config()->set('loupe.disk', 'public');
        $this->actingAsAllowed();

        $response = $this->postJson('/loupe/v1/blobs', [
            'projectKey' => 'app',
            'data' => 'data:image/png;base64,'.self::PNG,
        ])->assertCreated();

        $url = $response->json('url');
        $this->assertStringContainsString('/loupe/v1/blobs/', $url);

        $files = Storage::disk('public')->allFiles('loupe/screenshots');
        $this->assertCount(1, $files);
    }

    public function test_it_rejects_a_non_data_url(): void
    {
        $this->actingAsAllowed();

        $this->postJson('/loupe/v1/blobs', ['data' => 'nope'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'data (data URL) required');
    }

    public function test_it_rejects_an_invalid_base64_payload(): void
    {
        $this->actingAsAllowed();

        $this->postJson('/loupe/v1/blobs', ['data' => 'data:image/png;base64,'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'invalid data URL');
    }

    public function test_it_serves_a_stored_screenshot(): void
    {
        Storage::fake('public');
        config()->set('loupe.disk', 'public');
        $this->actingAsAllowed();

        $url = $this->postJson('/loupe/v1/blobs', [
            'projectKey' => 'app',
            'data' => 'data:image/png;base64,'.self::PNG,
        ])->json('url');

        // The read route is public (no auth needed).
        app()['auth']->forgetGuards();
        $response = $this->get($url)
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');

        // Symfony normalizes Cache-Control ordering, so assert on the directives.
        $cacheControl = $response->headers->get('Cache-Control');
        $this->assertStringContainsString('max-age=31536000', $cacheControl);
        $this->assertStringContainsString('immutable', $cacheControl);
        $this->assertStringContainsString('public', $cacheControl);
    }

    public function test_it_returns_404_for_a_missing_screenshot(): void
    {
        Storage::fake('public');
        config()->set('loupe.disk', 'public');

        $this->get('/loupe/v1/blobs/does-not-exist')->assertNotFound();
    }
}
