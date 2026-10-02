<?php

namespace Loupekit\Loupe\Tests\Unit;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Loupekit\Loupe\Http\Middleware\Authenticate;
use Loupekit\Loupe\Tests\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * NOTE ON ORDER: two of these mock the `Route` facade, and the mock stays bound in the
 * container for the rest of the process — so the test that needs the real router (the
 * [login] route the testbench app registers) is declared FIRST.
 */
class AuthenticateMiddlewareTest extends TestCase
{
    public function test_it_lets_an_authenticated_user_through(): void
    {
        $this->actingAs($this->makeUser());

        $response = app(Authenticate::class)->handle(Request::create('/loupe/dashboard'), fn () => response('ok'));

        $this->assertSame('ok', $response->getContent());
    }

    public function test_a_browser_guest_is_redirected_to_login(): void
    {
        // The usual case: a guest browsing the dashboard is sent to the login page. This
        // goes through a real request because that is where the router's named routes are
        // resolved.
        $this->get('/loupe/dashboard')->assertRedirect('/login');
    }

    public function test_it_aborts_with_403_when_the_app_has_no_login_route(): void
    {
        // A fresh Laravel 11+ app ships no auth scaffolding, so it has no [login] route.
        // Laravel's handler turns an AuthenticationException into a redirect to it, and the
        // redirect throws "Route [login] not defined" — a 500 on the very page
        // `loupe:install` tells you to visit. Abort with something actionable instead.
        Route::shouldReceive('has')->with('login')->andReturn(false);

        $this->expectException(HttpException::class);

        app(Authenticate::class)->handle(Request::create('/loupe/dashboard'), fn () => response('ok'));
    }

    public function test_a_json_request_still_gets_the_401_exception(): void
    {
        Route::shouldReceive('has')->with('login')->andReturn(false);

        $this->expectException(AuthenticationException::class);

        $request = Request::create('/loupe/v1/comments', 'GET', [], [], [], ['HTTP_ACCEPT' => 'application/json']);
        app(Authenticate::class)->handle($request, fn () => response('ok'));
    }
}
