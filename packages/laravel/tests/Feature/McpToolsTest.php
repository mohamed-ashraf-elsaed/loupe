<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Illuminate\Support\Facades\Storage;
use Laravel\Mcp\Request;
use Loupekit\Loupe\Mcp\Tools\GetComment;
use Loupekit\Loupe\Mcp\Tools\ListComments;
use Loupekit\Loupe\Mcp\Tools\ProposeChange;
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
        $proposeSchema = (new ProposeChange)->schema(new JsonSchemaTypeFactory);
        $this->assertArrayHasKey('id', $proposeSchema);
        $this->assertArrayHasKey('html', $proposeSchema);
        $this->assertArrayHasKey('css', $proposeSchema);
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

    public function test_list_comments_reports_the_free_target(): void
    {
        $this->seedComment('f', ['kind' => 'free', 'anchor' => [], 'context' => ['html' => '', 'styles' => []]]);

        $out = json_decode((string) (new ListComments)->handle(new Request)->content(), true);

        $this->assertSame('page-level note', $out['comments'][0]['target']);
    }

    public function test_get_comment_renders_a_free_note_without_element_sections(): void
    {
        $this->seedComment('f', [
            'kind' => 'free',
            'body' => 'The whole page feels cramped',
            'anchor' => [],
            'context' => ['html' => '', 'styles' => []],
        ]);

        $text = (string) (new GetComment)->handle(new Request(['id' => 'f']))->content();

        $this->assertStringContainsString('The whole page feels cramped', $text);
        $this->assertStringContainsString('Free note', $text);
        $this->assertStringNotContainsString('## Target element HTML', $text);
        $this->assertStringNotContainsString('## Computed styles', $text);
    }

    public function test_get_comment_builds_the_claude_ready_package(): void
    {
        $this->seedComment('a', [
            'body' => 'Make the CTA bigger',
            'anchor' => ['testid' => 'cta', 'cssPath' => 'button'],
            'context' => ['html' => '<button>Go</button>', 'styles' => ['color' => 'red']],
            'screenshot_url' => 'http://x/y.png', // not in storage → text only, no image block
        ]);

        $result = (new GetComment)->handle(new Request(['id' => 'a']));
        $this->assertIsArray($result);
        $this->assertCount(1, $result); // just the text package
        $text = (string) $result[0]->content();

        $this->assertStringContainsString('Make the CTA bigger', $text);
        $this->assertStringContainsString('[data-testid="cta"]', $text);
        $this->assertStringContainsString('<button>Go</button>', $text);
        $this->assertStringContainsString('"color": "red"', $text);
        $this->assertStringContainsString('http://x/y.png', $text);
        $this->assertStringContainsString('propose_change', $text);
    }

    public function test_get_comment_includes_recording_and_existing_proposal(): void
    {
        $this->seedComment('a', [
            'kind' => 'region',
            'recording_url' => 'http://x/rec.webm',
            'proposal' => ['html' => '<b>done</b>', 'css' => '.x{}', 'notes' => 'note', 'author' => 'Claude Code via MCP', 'createdAt' => 't'],
        ]);

        $text = (string) (new GetComment)->handle(new Request(['id' => 'a']))[0]->content();

        $this->assertStringContainsString('http://x/rec.webm', $text);
        $this->assertStringContainsString('Existing proposal', $text);
        $this->assertStringContainsString('<b>done</b>', $text);
        $this->assertStringContainsString('.x{}', $text);
    }

    public function test_get_comment_attaches_a_stored_screenshot_as_an_image(): void
    {
        Storage::fake('public');
        config()->set('loupe.disk', 'public');
        Storage::disk('public')->put('loupe/screenshots/shot1.png', 'PNGBYTES');
        $this->seedComment('a', ['screenshot_url' => 'http://x/loupe/v1/blobs/shot1.png']);

        $result = (new GetComment)->handle(new Request(['id' => 'a']));

        $this->assertCount(2, $result); // text + image block
        $this->assertFalse($result[1]->isError());
    }

    public function test_get_comment_embeds_a_legacy_extensionless_screenshot(): void
    {
        Storage::fake('public');
        config()->set('loupe.disk', 'public');
        Storage::disk('public')->put('loupe/screenshots/shot2.png', 'PNGBYTES');
        // A URL saved before extensions were carried (basename has no dot).
        $this->seedComment('a', ['screenshot_url' => 'http://x/loupe/v1/blobs/shot2']);

        $result = (new GetComment)->handle(new Request(['id' => 'a']));

        $this->assertCount(2, $result); // resolves to shot2.png and embeds it
    }

    public function test_get_comment_without_screenshot_returns_text_only(): void
    {
        $this->seedComment('a', ['screenshot_url' => null]);

        $result = (new GetComment)->handle(new Request(['id' => 'a']));

        $this->assertCount(1, $result);
    }

    public function test_get_comment_does_not_embed_a_non_png_screenshot(): void
    {
        $this->seedComment('a', ['screenshot_url' => 'http://x/thing.webm']);

        $result = (new GetComment)->handle(new Request(['id' => 'a']));

        $this->assertCount(1, $result); // .webm is not embeddable as an image
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

    public function test_propose_change_writes_the_modified_ui_back(): void
    {
        $this->seedComment('a');

        $response = (new ProposeChange)->handle(new Request([
            'id' => 'a', 'html' => '<b>new</b>', 'css' => '.x{color:red}', 'notes' => 'tightened',
        ]));

        $this->assertFalse($response->isError());
        $this->assertStringContainsString('Proposal saved', (string) $response->content());

        $proposal = Comment::query()->find('a')->proposal;
        $this->assertSame('<b>new</b>', $proposal['html']);
        $this->assertSame('.x{color:red}', $proposal['css']);
        $this->assertSame('tightened', $proposal['notes']);
        $this->assertSame('Claude Code via MCP', $proposal['author']);
        $this->assertArrayHasKey('createdAt', $proposal);
    }

    public function test_propose_change_drops_omitted_optional_fields(): void
    {
        $this->seedComment('a');

        (new ProposeChange)->handle(new Request(['id' => 'a', 'html' => '<b>new</b>']));

        $proposal = Comment::query()->find('a')->proposal;
        $this->assertArrayNotHasKey('css', $proposal);
        $this->assertArrayNotHasKey('notes', $proposal);
        $this->assertSame('<b>new</b>', $proposal['html']);
    }

    public function test_propose_change_errors_when_missing(): void
    {
        $this->assertTrue((new ProposeChange)->handle(new Request(['id' => 'nope', 'html' => '<b/>']))->isError());
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
