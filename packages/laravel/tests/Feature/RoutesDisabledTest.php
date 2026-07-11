<?php

namespace Loupekit\Loupe\Tests\Feature;

use Loupekit\Loupe\Tests\TestCase;

class RoutesDisabledTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        // Set before the provider boots so registerRoutes() short-circuits.
        $app['config']->set('loupe.enabled', false);
    }

    public function test_no_routes_are_registered_when_disabled(): void
    {
        $this->assertFalse($this->app['router']->has('loupe.comments.index'));
        $this->assertFalse($this->app['router']->has('loupe.dashboard'));
    }
}
