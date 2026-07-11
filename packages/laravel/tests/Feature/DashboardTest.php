<?php

namespace Loupekit\Loupe\Tests\Feature;

use Loupekit\Loupe\Tests\TestCase;

class DashboardTest extends TestCase
{
    public function test_it_renders_the_board_for_an_admin(): void
    {
        $this->actingAsAllowed();

        $this->get('/loupe/dashboard')
            ->assertOk()
            ->assertSee('window.__LOUPE__', false)
            ->assertSee('project: "app"', false)
            ->assertSee('vendor/loupe/dashboard/app.js', false);
    }

    public function test_it_forbids_non_admins(): void
    {
        config()->set('loupe.authorize.dashboard', fn () => false);
        $this->actingAs($this->makeUser());

        $this->get('/loupe/dashboard')->assertForbidden();
    }

    public function test_it_requires_authentication(): void
    {
        // Guests are redirected by the auth middleware.
        $this->get('/loupe/dashboard')->assertRedirect();
    }
}
