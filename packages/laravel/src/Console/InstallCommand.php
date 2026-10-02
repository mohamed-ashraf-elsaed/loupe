<?php

namespace Loupekit\Loupe\Console;

use Illuminate\Console\Command;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Route;

class InstallCommand extends Command
{
    protected $signature = 'loupe:install
        {--force : Overwrite any existing published files}';

    protected $description = 'Install the Loupe assets, config, migration and dashboard provider';

    public function handle(Filesystem $files): int
    {
        $this->components->info('Installing Loupe…');

        $force = (bool) $this->option('force');

        foreach ([
            'loupe-config' => 'config',
            'loupe-migrations' => 'migration',
            'loupe-assets' => 'assets',
            'loupe-provider' => 'dashboard provider',
        ] as $tag => $label) {
            $this->callSilent('vendor:publish', array_filter([
                '--tag' => $tag,
                '--force' => $force,
            ]));
            $this->components->task("Published {$label}");
        }

        $this->registerProvider($files);
        $this->warnAboutMissingAuth();

        $this->newLine();
        $this->components->info('Loupe installed. Next steps:');
        $this->line('  1. Run <comment>php artisan migrate</comment>');
        $this->line('  2. Add <comment>@loupeWidget</comment> before </body> in your layout');
        $this->line('  3. Edit <comment>app/Providers/LoupeServiceProvider.php</comment> to authorize users');
        $this->line('  4. Visit <comment>/'.config('loupe.path', 'loupe').'/dashboard</comment>');

        return self::SUCCESS;
    }

    /**
     * Loupe shows the widget to a **signed-in** user and serves the dashboard behind your
     * auth — so an app with no way to log anyone in looks simply broken: the widget never
     * appears and the dashboard cannot authenticate you. Laravel 11+ ships no auth
     * scaffolding, so this is the normal state of a brand-new app. Say so, loudly, here
     * rather than leaving the user to guess.
     */
    private function warnAboutMissingAuth(): void
    {
        try {
            $hasLogin = Route::has('login');
        } catch (\Throwable) {
            return; // routes not loadable here — say nothing rather than guess
        }

        if ($hasLogin) {
            return;
        }

        $this->newLine();
        $this->components->warn(
            'This app has no [login] route, so nobody can sign in — and Loupe only shows the '
            .'widget to authenticated users. Add auth before expecting it to appear:'
        );
        $this->line('    <comment>composer require laravel/breeze --dev</comment>');
        $this->line('    <comment>php artisan breeze:install</comment>');
        $this->line('  …or sign someone in your own way, then open the dashboard as that user.');
    }

    /** Register App\Providers\LoupeServiceProvider (Laravel 11+ bootstrap/providers.php). */
    private function registerProvider(Filesystem $files): void
    {
        $provider = 'App\\Providers\\LoupeServiceProvider';
        $bootstrap = $this->laravel->basePath('bootstrap/providers.php');

        if (! $files->exists($bootstrap)) {
            $this->components->warn(
                "Could not auto-register the provider. Add {$provider}::class to your providers list."
            );

            return;
        }

        $contents = $files->get($bootstrap);
        $updated = self::addProviderToList($contents, $provider);
        if ($updated !== $contents) {
            $files->put($bootstrap, $updated);
        }
        $this->components->task('Registered LoupeServiceProvider');
    }

    /**
     * Insert a provider into a `return [ ... ];` list, once. Pure so it is easy
     * to test both the insert and the already-present branches.
     */
    public static function addProviderToList(string $contents, string $provider): string
    {
        if (str_contains($contents, $provider)) {
            return $contents;
        }

        return preg_replace('/(return\s*\[)/', "$1\n    {$provider}::class,", $contents, 1);
    }
}
