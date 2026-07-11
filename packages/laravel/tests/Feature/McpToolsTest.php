<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Mcp\Request;
use Loupekit\Loupe\Mcp\Tools\GetComment;
use Loupekit\Loupe\Mcp\Tools\ListComments;
use Loupekit\Loupe\Mcp\Tools\UpdateStatus;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Tests\TestCase;

class McpToolsTest extends TestCase
{
    protected function setUp(): void
    {
        // The MCP layer is optional (guarded by class_exists). laravel/mcp ^0.8
        // supports Laravel 11/12/13, so this normally runs; skip only if a
        // consumer has not installed it.
        if (! class_exists(\Laravel\Mcp\Server::class)) {
            $this->markTestSkipped('laravel/mcp is not installed.');
        }

        parent::setUp();
    }

    public function test_schemas_declare_their_inputs(): void
    {
        $this->assertArrayHasKey('status', (new ListComments)->schema(new JsonSchemaTypeFactory));
        $this->assertArrayHasKey('id', (new GetComment)->schema(new JsonSchemaTypeFactory));
        $this->assertArrayHasKey('status', (new UpdateStatus)->schema(new JsonSchemaTypeFactory));
    }

    public function test_list_comments_returns_a_summary_and_filters(): void
    {
        $this->seedComment('a', ['status' => 'open', 'url' => '/p']);
        $this->seedComment('b', ['status' => 'done', 'url' => '/q']);

        $all = json_decode((string) (new ListComments)->handle(new Request)->content(), true);
        $this->assertSame(2, $all['count']);

        $done = json_decode((string) (new ListComments)->handle(new Request(['status' => 'done']))->content(), true);
        $this->assertSame(1, $done['count']);
        $this->assertSame('b', $done['comments'][0]['id']);

        $byUrl = json_decode((string) (new ListComments)->handle(new Request(['url' => '/p']))->content(), true);
        $this->assertSame('a', $byUrl['comments'][0]['id']);
    }

    public function test_list_comments_reports_the_region_target(): void
    {
        $this->seedComment('r', ['kind' => 'region', 'region' => ['x' => 1, 'y' => 2, 'w' => 30, 'h' => 40]]);

        $out = json_decode((string) (new ListComments)->handle(new Request)->content(), true);

        $this->assertStringContainsString('region 30×40', $out['comments'][0]['target']);
    }

    public function test_list_comments_uses_the_css_path_when_no_testid(): void
    {
        $this->seedComment('c', ['anchor' => ['testid' => null, 'cssPath' => '#main > div']]);

        $out = json_decode((string) (new ListComments)->handle(new Request)->content(), true);

        $this->assertSame('#main > div', $out['comments'][0]['target']);
    }

    public function test_get_comment_builds_the_claude_ready_package(): void
    {
        $this->seedComment('a', [
            'body' => 'Make the CTA bigger',
            'anchor' => ['testid' => 'cta', 'cssPath' => 'button'],
            'context' => ['html' => '<button>Go</button>', 'styles' => ['color' => 'red']],
            'screenshot_url' => 'http://x/y.png',
        ]);

        $text = (string) (new GetComment)->handle(new Request(['id' => 'a']))->content();

        $this->assertStringContainsString('Make the CTA bigger', $text);
        $this->assertStringContainsString('[data-testid="cta"]', $text);
        $this->assertStringContainsString('<button>Go</button>', $text);
        $this->assertStringContainsString('"color": "red"', $text);
        $this->assertStringContainsString('http://x/y.png', $text);
    }

    public function test_get_comment_errors_when_missing(): void
    {
        $response = (new GetComment)->handle(new Request(['id' => 'nope']));

        $this->assertTrue($response->isError());
    }

    public function test_update_status_changes_the_row(): void
    {
        $this->seedComment('a', ['status' => 'open']);

        $response = (new UpdateStatus)->handle(new Request(['id' => 'a', 'status' => 'done']));

        $this->assertFalse($response->isError());
        $this->assertSame('done', Comment::query()->find('a')->status);
    }

    public function test_update_status_rejects_a_bad_status(): void
    {
        $this->assertTrue((new UpdateStatus)->handle(new Request(['id' => 'a', 'status' => 'bogus']))->isError());
    }

    public function test_update_status_errors_when_missing(): void
    {
        $this->assertTrue((new UpdateStatus)->handle(new Request(['id' => 'nope', 'status' => 'done']))->isError());
    }

    private function seedComment(string $id, array $overrides = []): void
    {
        Comment::query()->create(array_merge([
            'id' => $id,
            'project_key' => 'app',
            'url' => '/p',
            'status' => 'open',
            'body' => 'hi',
            'kind' => 'element',
            'author' => ['id' => '1', 'name' => 'Sara'],
            'author_id' => '1',
            'anchor' => ['testid' => 'kpi', 'cssPath' => 'div'],
            'context' => ['html' => '<div></div>', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ], $overrides));
    }
}
