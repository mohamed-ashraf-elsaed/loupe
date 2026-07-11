<?php

namespace Loupekit\Loupe\Tests;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\LoupeServiceProvider;
use Loupekit\Loupe\Tests\Fixtures\User;
use Orchestra\Testbench\TestCase as Orchestra;

abstract class TestCase extends Orchestra
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name')->nullable();
            $table->string('email')->nullable();
        });

        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        // The auth middleware redirects guests here; define it so redirects resolve.
        Route::get('/login', fn () => 'login')->name('login');
    }

    protected function getPackageProviders($app): array
    {
        return [LoupeServiceProvider::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('app.env', 'testing');
        $app['config']->set('database.default', 'testing');
        $app['config']->set('database.connections.testing', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]);
        $app['config']->set('auth.providers.users.model', User::class);

        $app['config']->set('filesystems.default', 'local');
        $app['config']->set('filesystems.disks.public', [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => 'http://localhost/storage',
            'visibility' => 'public',
        ]);
    }

    protected function makeUser(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'name' => 'Sara PM',
            'email' => 'sara@example.com',
        ], $attributes));
    }

    /** Grant both abilities and act as a fresh user. */
    protected function actingAsAllowed(array $attributes = []): User
    {
        config()->set('loupe.authorize.use', fn () => true);
        config()->set('loupe.authorize.dashboard', fn () => true);

        $user = $this->makeUser($attributes);
        $this->actingAs($user);

        return $user;
    }
}
