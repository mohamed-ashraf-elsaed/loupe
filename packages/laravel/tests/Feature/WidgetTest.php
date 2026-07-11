<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Loupekit\Loupe\LoupeServiceProvider;
use Loupekit\Loupe\Tests\TestCase;

class WidgetTest extends TestCase
{
    public function test_the_directive_compiles_to_a_render_call(): void
    {
        $this->assertStringContainsString(
            'LoupeServiceProvider::renderWidget()',
            Blade::compileString('@loupeWidget')
        );
    }

    public function test_it_renders_nothing_when_disabled(): void
    {
        config()->set('loupe.enabled', false);
        $this->actingAs($this->makeUser());

        $this->assertSame('', LoupeServiceProvider::renderWidget());
    }

    public function test_it_renders_nothing_for_a_guest(): void
    {
        $this->assertSame('', LoupeServiceProvider::renderWidget());
    }

    public function test_it_renders_nothing_for_an_unauthorized_user(): void
    {
        config()->set('loupe.authorize.use', fn () => false);
        $this->actingAs($this->makeUser());

        $this->assertSame('', LoupeServiceProvider::renderWidget());
    }

    public function test_it_renders_the_sdk_bootstrap_for_an_authorized_user(): void
    {
        Route::middleware('web')->get('/_widget_probe', fn () => Blade::render('@loupeWidget'));

        $this->actingAsAllowed();

        $this->get('/_widget_probe')
            ->assertOk()
            ->assertSee('Loupe.init', false)
            ->assertSee('vendor/loupe/sdk/loupe.js', false)
            ->assertSee('X-CSRF-TOKEN', false)
            ->assertSee('projectKey: "app"', false);
    }
}
