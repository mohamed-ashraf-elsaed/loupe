<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\File;
use Loupekit\Loupe\Console\InstallCommand;
use Loupekit\Loupe\Tests\TestCase;

class InstallCommandTest extends TestCase
{
    private ?string $originalBasePath = null;

    private string $tmp;

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalBasePath = $this->app->basePath();
        $this->tmp = sys_get_temp_dir().'/loupe_install_'.uniqid();
        File::makeDirectory($this->tmp.'/bootstrap', 0777, true, true);
    }

    protected function tearDown(): void
    {
        $this->app->setBasePath($this->originalBasePath);
        File::deleteDirectory($this->tmp);
        parent::tearDown();
    }

    public function test_add_provider_to_list_inserts_once(): void
    {
        $contents = "<?php\n\nreturn [\n    App\\Providers\\AppServiceProvider::class,\n];\n";

        $updated = InstallCommand::addProviderToList($contents, 'App\\Providers\\LoupeServiceProvider');
        $this->assertStringContainsString('App\\Providers\\LoupeServiceProvider::class,', $updated);

        // Idempotent — a second pass is a no-op.
        $this->assertSame($updated, InstallCommand::addProviderToList($updated, 'App\\Providers\\LoupeServiceProvider'));
    }

    public function test_install_registers_the_provider_when_bootstrap_exists(): void
    {
        File::put($this->tmp.'/bootstrap/providers.php', "<?php\n\nreturn [\n    App\\Providers\\AppServiceProvider::class,\n];\n");
        $this->app->setBasePath($this->tmp);

        $this->artisan('loupe:install')->assertExitCode(0);

        $this->assertStringContainsString(
            'App\\Providers\\LoupeServiceProvider::class',
            File::get($this->tmp.'/bootstrap/providers.php')
        );
    }

    public function test_install_warns_when_bootstrap_is_missing(): void
    {
        // No bootstrap/providers.php in the temp base path.
        $this->app->setBasePath($this->tmp);

        $this->artisan('loupe:install')
            ->expectsOutputToContain('Could not auto-register the provider')
            ->assertExitCode(0);
    }
}
