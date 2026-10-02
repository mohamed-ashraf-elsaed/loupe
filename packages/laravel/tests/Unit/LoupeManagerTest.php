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

    public function test_local_environment_is_frictionless_by_default(): void
    {
        $this->app['env'] = 'local';

        // No config closure, no gate access — but local is open by default.
        $this->assertTrue($this->loupe->authorizedToUse($this->makeUser()));
        $this->assertTrue($this->loupe->authorizedForDashboard($this->makeUser()));
    }

    public function test_allow_in_local_can_be_disabled(): void
    {
        $this->app['env'] = 'local';
        config()->set('loupe.allow_in_local', false);
        Gate::define('loupe:use', fn ($user) => false);

        $this->assertFalse($this->loupe->authorizedToUse($this->makeUser()));
    }

    public function test_explicit_config_closure_overrides_local(): void
    {
        $this->app['env'] = 'local';
        config()->set('loupe.authorize.use', fn () => false);

        $this->assertFalse($this->loupe->authorizedToUse($this->makeUser()));
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

    public function test_describe_user_honors_a_class_string_resolver(): void
    {
        // The serializable form: a class-string survives `php artisan config:cache`,
        // which a Closure does not.
        config()->set('loupe.user_resolver', StubLoupeUserResolver::class);

        $this->assertSame(['id' => 'imp-1', 'name' => 'Admin'], $this->loupe->describeUser($this->makeUser()));
    }

    public function test_describe_user_honors_a_class_method_resolver(): void
    {
        config()->set('loupe.user_resolver', [StubLoupeUserResolver::class, 'resolve']);

        $this->assertSame(['id' => 'imp-1', 'name' => 'Admin'], $this->loupe->describeUser($this->makeUser()));
    }

    public function test_describe_user_ignores_a_resolver_that_is_not_callable(): void
    {
        config()->set('loupe.user_resolver', 'Not\\A\\Real\\Resolver');

        $user = $this->makeUser(['name' => 'Sara', 'email' => 'sara@example.com']);

        $this->assertSame('Sara', $this->loupe->describeUser($user)['name']);
    }
}

/** A stub resolver in the serializable (class-string) form. */
class StubLoupeUserResolver
{
    /** @param  object  $user */
    public function __invoke($user): array
    {
        return ['id' => 'imp-1', 'name' => 'Admin'];
    }

    /** @param  object  $user */
    public static function resolve($user): array
    {
        return ['id' => 'imp-1', 'name' => 'Admin'];
    }
}
