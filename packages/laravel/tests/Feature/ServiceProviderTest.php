<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Gate;
use Loupekit\Loupe\Http\Middleware\Authorize;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Tests\TestCase;

class ServiceProviderTest extends TestCase
{
    public function test_it_registers_the_middleware_alias(): void
    {
        $aliases = $this->app['router']->getMiddleware();

        $this->assertArrayHasKey('loupe.authorize', $aliases);
        $this->assertSame(Authorize::class, $aliases['loupe.authorize']);
    }

    public function test_it_binds_the_manager_as_a_singleton(): void
    {
        $this->assertInstanceOf(Loupe::class, $this->app->make(Loupe::class));
        $this->assertSame($this->app->make(Loupe::class), $this->app->make(Loupe::class));
    }

    public function test_it_defines_baseline_gates(): void
    {
        $this->assertTrue(Gate::has('loupe:use'));
        $this->assertTrue(Gate::has('loupe:admin'));
    }

    public function test_baseline_gates_deny_outside_local_and_allow_in_local(): void
    {
        $user = $this->makeUser();

        // Default test env is "testing" → denied.
        $this->assertFalse(Gate::forUser($user)->allows('loupe:use'));

        // Flip the environment → allowed (the default local-only rule).
        $this->app['env'] = 'local';
        $this->assertTrue(Gate::forUser($user)->allows('loupe:use'));
        $this->assertTrue(Gate::forUser($user)->allows('loupe:admin'));
    }

    public function test_the_routes_are_registered(): void
    {
        $this->assertTrue($this->app['router']->has('loupe.comments.index'));
        $this->assertTrue($this->app['router']->has('loupe.dashboard'));
        $this->assertTrue($this->app['router']->has('loupe.blobs.show'));
    }
}
