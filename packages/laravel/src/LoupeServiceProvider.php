<?php

namespace Loupekit\Loupe;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Loupekit\Loupe\Console\InstallCommand;
use Loupekit\Loupe\Events\CommentCreated;
use Loupekit\Loupe\Events\CommentDeleted;
use Loupekit\Loupe\Events\CommentStatusChanged;
use Loupekit\Loupe\Events\MessageAdded;
use Loupekit\Loupe\Http\Middleware\Authenticate;
use Loupekit\Loupe\Http\Middleware\Authorize;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Support\Relay;
use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Support\Url;

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
        $this->registerModelEvents();
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
        $router->aliasMiddleware('loupe.auth', Authenticate::class);
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

    /**
     * Turn model writes into Loupe events, so they fire however the row was
     * written: the widget, the dashboard, MCP, a Hub delivery or the host app
     * saving the model itself. Then relay the ones another project cares about.
     */
    private function registerModelEvents(): void
    {
        $class = config('loupe.comment_model', Comment::class);

        Event::listen('eloquent.created: '.$class, fn (Model $comment) => event(new CommentCreated($comment)));
        Event::listen('eloquent.deleted: '.$class, fn (Model $comment) => event(new CommentDeleted($comment)));
        Event::listen('eloquent.updated: '.$class, function (Model $comment) {
            if (! $comment->wasChanged('status')) {
                return;
            }
            $from = Stages::normalize($comment->getOriginal('status'));
            $to = Stages::normalize($comment->status);
            if ($from !== $to) {
                event(new CommentStatusChanged($comment, $from, $to));
            }
        });
        Event::listen('eloquent.created: '.Message::class, function (Message $message) use ($class) {
            $comment = (new $class)->newQuery()->find($message->comment_id);
            if ($comment !== null) {
                event(new MessageAdded($comment, $message));
            }
        });

        Event::listen(CommentStatusChanged::class, [Relay::class, 'statusChanged']);
        Event::listen(MessageAdded::class, [Relay::class, 'messageAdded']);
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

        /** @var Loupe $loupe */
        $loupe = app(Loupe::class);
        $user = $loupe->resolveUser();
        if ($user === null) {
            return '';
        }

        if (! $loupe->authorizedToUse($user)) {
            return '';
        }

        return view('loupe::widget', [
            'user' => $loupe->describeUser($user),
            'projectKey' => config('loupe.project_key', 'app'),
            'apiBase' => url(config('loupe.path', 'loupe')),
            'csrf' => csrf_token(),
            // The clock the widget renders timestamps in: Loupe's own setting, else the app's.
            'timeZone' => config('loupe.timezone') ?: config('app.timezone'),
            'locale' => config('loupe.locale') ?: null,
            'packageVersion' => $loupe->packageVersion(),
            // App-origin asset URL (bypasses ASSET_URL/CDN — see Url::asset()),
            // versioned so a new build is a new URL and no cache serves the old SDK.
            'sdkSrc' => Url::versioned('vendor/loupe/sdk/loupe.js'),
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
