<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Loupekit\Loupe\Support\Url;
use Loupekit\Loupe\Tests\TestCase;

class AssetUrlTest extends TestCase
{
    public function test_it_ignores_a_cdn_asset_url_and_uses_the_app_origin(): void
    {
        config()->set('app.url', 'https://app.test');
        config()->set('app.asset_url', 'https://cdn.example.com'); // host's CDN
        config()->set('loupe.asset_url', null);

        // Must resolve from the app origin, NOT the CDN (which doesn't host these files).
        $this->assertSame(
            'https://app.test/vendor/loupe/sdk/loupe.js',
            Url::asset('vendor/loupe/sdk/loupe.js')
        );
    }

    public function test_it_honors_loupe_asset_url_when_set(): void
    {
        config()->set('loupe.asset_url', 'https://assets.example.com/');

        $this->assertSame(
            'https://assets.example.com/vendor/loupe/dashboard/app.js',
            Url::asset('/vendor/loupe/dashboard/app.js')
        );
    }

    public function test_it_falls_back_to_a_root_relative_url_without_a_base(): void
    {
        config()->set('loupe.asset_url', null);
        config()->set('app.url', null);

        $this->assertSame('/vendor/loupe/x.js', Url::asset('vendor/loupe/x.js'));
    }

    public function test_the_widget_loads_the_sdk_from_the_app_origin_not_the_cdn(): void
    {
        config()->set('app.url', 'https://app.test');
        config()->set('app.asset_url', 'https://cdn.example.com');
        $this->actingAsAllowed();

        Route::middleware('web')->get('/_asset_probe', fn () => Blade::render('@loupeWidget'));

        $this->get('/_asset_probe')
            ->assertSee('https://app.test/vendor/loupe/sdk/loupe.js', false)
            ->assertDontSee('cdn.example.com', false);
    }

    public function test_the_dashboard_loads_its_bundle_from_the_app_origin_not_the_cdn(): void
    {
        config()->set('app.url', 'https://app.test');
        config()->set('app.asset_url', 'https://cdn.example.com');
        $this->actingAsAllowed();

        $this->get('/loupe/dashboard')
            ->assertSee('https://app.test/vendor/loupe/dashboard/app.js', false)
            ->assertDontSee('cdn.example.com', false);
    }
}
