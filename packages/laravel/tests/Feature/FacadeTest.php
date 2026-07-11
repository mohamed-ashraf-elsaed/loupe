<?php

namespace Loupekit\Loupe\Tests\Feature;

use Loupekit\Loupe\Facades\Loupe;
use Loupekit\Loupe\Loupe as LoupeManager;
use Loupekit\Loupe\Tests\TestCase;

class FacadeTest extends TestCase
{
    public function test_the_facade_resolves_the_manager_singleton(): void
    {
        $this->assertInstanceOf(LoupeManager::class, Loupe::getFacadeRoot());
    }

    public function test_the_facade_proxies_authorization(): void
    {
        config()->set('loupe.authorize.use', fn () => true);

        $this->assertTrue(Loupe::authorizedToUse($this->makeUser()));
    }
}
