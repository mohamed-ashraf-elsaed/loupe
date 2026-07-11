<?php

namespace Loupekit\Loupe\Tests\Unit;

use Illuminate\Support\Facades\Gate;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Tests\TestCase;

class LoupeManagerTest extends TestCase
{
    private Loupe $loupe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->loupe = new Loupe;
    }

    public function test_a_null_user_is_never_authorized(): void
    {
        $this->assertFalse($this->loupe->authorizedToUse(null));
        $this->assertFalse($this->loupe->authorizedForDashboard(null));
    }

    public function test_config_closure_takes_precedence(): void
    {
        config()->set('loupe.authorize.use', fn ($user) => $user->email === 'sara@example.com');

        $this->assertTrue($this->loupe->authorizedToUse($this->makeUser()));
        $this->assertFalse($this->loupe->authorizedToUse($this->makeUser(['email' => 'no@example.com'])));
    }

    public function test_registered_callback_is_used_when_no_config_closure(): void
    {
        $this->loupe->useWhen(fn ($user) => $user->email === 'sara@example.com');
        $this->loupe->adminWhen(fn ($user) => true);

        $this->assertTrue($this->loupe->authorizedToUse($this->makeUser()));
        $this->assertFalse($this->loupe->authorizedToUse($this->makeUser(['email' => 'no@example.com'])));
        $this->assertTrue($this->loupe->authorizedForDashboard($this->makeUser()));
    }

    public function test_falls_back_to_gate_ability(): void
    {
        Gate::define('loupe:use', fn ($user) => true);

        $this->assertTrue($this->loupe->authorizedToUse($this->makeUser()));
    }

    public function test_describe_user_uses_id_name_email_by_default(): void
    {
        $user = $this->makeUser(['name' => 'Sara', 'email' => 'sara@example.com']);

        $this->assertSame(
            ['id' => (string) $user->id, 'name' => 'Sara', 'email' => 'sara@example.com'],
            $this->loupe->describeUser($user)
        );
    }

    public function test_describe_user_falls_back_to_email_then_generic_name(): void
    {
        $emailOnly = $this->makeUser(['name' => null, 'email' => 'x@example.com']);
        $this->assertSame('x@example.com', $this->loupe->describeUser($emailOnly)['name']);

        $neither = $this->makeUser(['name' => null, 'email' => null]);
        $this->assertSame('User', $this->loupe->describeUser($neither)['name']);
        $this->assertNull($this->loupe->describeUser($neither)['email']);
    }

    public function test_describe_user_honors_a_resolver_closure(): void
    {
        config()->set('loupe.user_resolver', fn ($user) => ['id' => 'x', 'name' => 'Custom']);

        $this->assertSame(['id' => 'x', 'name' => 'Custom'], $this->loupe->describeUser($this->makeUser()));
    }
}
