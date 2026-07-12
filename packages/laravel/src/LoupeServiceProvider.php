<?php

namespace Loupekit\Loupe;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Loupekit\Loupe\Console\InstallCommand;
use Loupekit\Loupe\Http\Middleware\Authorize;

class LoupeServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/loupe.php', 'loupe');

        $this->app->singleton(Loupe::class, fn () => new Loupe);
    }

    public function boot(): void
    {
        $this->registerMiddleware();
        $this->registerGates();
        $this->registerRoutes();
        $this->registerMcp();

        $this->loadViewsFrom(__DIR__.'/../resources/views', 'loupe');
        $this->registerBladeDirective();

        if ($this->app->runningInConsole()) {
            $this->registerPublishing();
            $this->commands([InstallCommand::class]);
        }
    }

    private function registerMiddleware(): void
    {
        /** @var Router $router */
        $router = $this->app['router'];
        $router->aliasMiddleware('loupe.authorize', Authorize::class);
    }

    /**
     * Baseline gates: deny by default. Local access is granted by the Loupe
     * manager (see config('loupe.allow_in_local')), so these only govern
     * non-local environments — a published App\Providers\LoupeServiceProvider,
     * which boots after this package, redefines them to grant production access.
     */
    private function registerGates(): void
    {
        if (! Gate::has('loupe:use')) {
            Gate::define('loupe:use', fn (?Authenticatable $user) => false);
        }
        if (! Gate::has('loupe:admin')) {
            Gate::define('loupe:admin', fn (?Authenticatable $user) => false);
        }
    }

    private function registerRoutes(): void
    {
        if (! config('loupe.enabled', true)) {
            return;
        }

        Route::group([
            'prefix' => config('loupe.path', 'loupe'),
            'domain' => config('loupe.domain'),
        ], function () {
            $this->loadRoutesFrom(__DIR__.'/../routes/loupe.php');
        });
    }

    private function registerMcp(): void
    {
        // laravel/mcp is optional (newer Laravel/PHP only). Skip cleanly if absent.
        if (class_exists(\Laravel\Mcp\Server::class)) {
            $this->loadRoutesFrom(__DIR__.'/../routes/ai.php');
        }
    }

    private function registerBladeDirective(): void
    {
        // @loupeWidget — drops the SDK <script> + Loupe.init() into a layout.
        Blade::directive('loupeWidget', fn () => "<?php echo \\Loupekit\\Loupe\\LoupeServiceProvider::renderWidget(); ?>");
    }

    /** Rendered by the @loupeWidget directive. Public so the compiled Blade can reach it. */
    public static function renderWidget(): string
    {
        if (! config('loupe.enabled', true)) {
            return '';
        }

        $user = auth()->user();
        if ($user === null) {
            return '';
        }

        /** @var Loupe $loupe */
        $loupe = app(Loupe::class);
        if (! $loupe->authorizedToUse($user)) {
            return '';
        }

        return view('loupe::widget', [
            'user' => $loupe->describeUser($user),
            'projectKey' => config('loupe.project_key', 'app'),
            'apiBase' => url(config('loupe.path', 'loupe')),
            'csrf' => csrf_token(),
        ])->render();
    }

    private function registerPublishing(): void
    {
        $this->publishes([
            __DIR__.'/../config/loupe.php' => config_path('loupe.php'),
        ], 'loupe-config');

        $this->publishes([
            __DIR__.'/../database/migrations' => database_path('migrations'),
        ], 'loupe-migrations');

        $this->publishes([
            __DIR__.'/../stubs/LoupeServiceProvider.stub' => app_path('Providers/LoupeServiceProvider.php'),
        ], 'loupe-provider');

        $this->publishes([
            __DIR__.'/../resources/dist' => public_path('vendor/loupe'),
        ], 'loupe-assets');

        $this->publishes([
            __DIR__.'/../resources/views' => resource_path('views/vendor/loupe'),
        ], 'loupe-views');
    }
}
