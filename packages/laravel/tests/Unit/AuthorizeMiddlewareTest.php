<?php

namespace Loupekit\Loupe\Tests\Unit;

use Illuminate\Http\Request;
use Loupekit\Loupe\Http\Middleware\Authorize;
use Loupekit\Loupe\Loupe;
use Loupekit\Loupe\Tests\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AuthorizeMiddlewareTest extends TestCase
{
    public function test_it_allows_an_authorized_user_and_defaults_to_the_use_ability(): void
    {
        config()->set('loupe.authorize.use', fn () => true);
        // Identity is resolved through Loupe's guards, not the request.
        $this->actingAs($this->makeUser());

        $middleware = new Authorize(new Loupe);
        $request = Request::create('/loupe/v1/comments');

        // No ability argument → defaults to "use".
        $response = $middleware->handle($request, fn () => response('ok'));

        $this->assertSame('ok', $response->getContent());
    }

    public function test_it_aborts_403_for_an_unauthorized_user(): void
    {
        config()->set('loupe.authorize.dashboard', fn () => false);
        $this->actingAs($this->makeUser());

        $middleware = new Authorize(new Loupe);
        $request = Request::create('/loupe/dashboard');

        $this->expectException(HttpException::class);
        $middleware->handle($request, fn () => response('ok'), 'admin');
    }
}
