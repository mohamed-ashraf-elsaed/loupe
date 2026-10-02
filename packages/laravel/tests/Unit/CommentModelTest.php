<?php

namespace Loupekit\Loupe\Tests\Unit;

use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Tests\TestCase;

class CommentModelTest extends TestCase
{
    public function test_it_uses_the_configured_table(): void
    {
        config()->set('loupe.table', 'custom_comments');

        $this->assertSame('custom_comments', (new Comment)->getTable());
    }

    public function test_to_loupe_array_matches_the_shared_shape(): void
    {
        $comment = Comment::query()->create($this->attributes());

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame('c1', $array['id']);
        $this->assertSame('app', $array['projectKey']);
        $this->assertSame('/p', $array['url']);
        $this->assertSame('element', $array['kind']);
        $this->assertSame('hi', $array['body']);
        $this->assertSame('queue', $array['status']);
        $this->assertSame(['id' => '1', 'name' => 'Sara'], $array['author']);
        $this->assertNull($array['screenshot']);
        $this->assertArrayNotHasKey('region', $array);
        $this->assertNotNull($array['createdAt']);
    }

    public function test_to_loupe_array_includes_region_for_region_comments(): void
    {
        $comment = Comment::query()->create(array_merge($this->attributes(), [
            'id' => 'c2',
            'kind' => 'region',
            'region' => ['x' => 1, 'y' => 2, 'w' => 3, 'h' => 4],
            'screenshot_url' => 'http://x/y',
        ]));

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame('region', $array['kind']);
        $this->assertSame(['x' => 1, 'y' => 2, 'w' => 3, 'h' => 4], $array['region']);
        $this->assertSame('http://x/y', $array['screenshot']);
    }

    public function test_to_loupe_array_handles_a_free_comment(): void
    {
        $comment = Comment::query()->create(array_merge($this->attributes(), [
            'id' => 'cf',
            'kind' => 'free',
            'anchor' => ['tag' => 'page', 'cssPath' => 'page', 'testid' => null],
            'context' => ['html' => '', 'styles' => []],
            'offset' => ['x' => 0.2, 'y' => 0.8],
        ]));

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame('free', $array['kind']);
        $this->assertNull($array['screenshot']);
        $this->assertArrayNotHasKey('region', $array);
        $this->assertSame(['x' => 0.2, 'y' => 0.8], $array['offset']);
    }

    public function test_to_loupe_array_includes_viewport_when_set(): void
    {
        $comment = Comment::query()->create(array_merge($this->attributes(), [
            'id' => 'cv',
            'viewport' => ['w' => 390, 'h' => 844],
        ]));

        $this->assertSame(['w' => 390, 'h' => 844], $comment->fresh()->toLoupeArray()['viewport']);
    }

    public function test_kind_defaults_to_element_when_blank(): void
    {
        $comment = new Comment(array_merge($this->attributes(), ['kind' => '']));

        $this->assertSame('element', $comment->toLoupeArray()['kind']);
    }

    public function test_to_loupe_array_includes_recording_and_proposal_when_set(): void
    {
        $proposal = ['html' => '<b>new</b>', 'css' => '.x{color:red}', 'notes' => 'tighter', 'author' => 'Claude Code via MCP', 'createdAt' => '2026-01-02T00:00:00.000Z'];
        $comment = Comment::query()->create(array_merge($this->attributes(), [
            'id' => 'cr',
            'kind' => 'region',
            'recording_url' => 'http://x/rec.webm',
            'proposal' => $proposal,
        ]));

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame('http://x/rec.webm', $array['recording']);
        $this->assertSame($proposal, $array['proposal']);
    }

    public function test_to_loupe_array_includes_the_pr_when_set(): void
    {
        $pr = ['number' => 412, 'url' => 'https://github.com/acme/web/pull/412', 'checksPassed' => 3, 'checksTotal' => 4];
        $comment = Comment::query()->create(array_merge($this->attributes(), ['id' => 'cpr', 'pr' => $pr]));

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame($pr, $array['pr']);
    }

    public function test_to_loupe_array_omits_recording_and_proposal_when_absent(): void
    {
        $array = Comment::query()->create($this->attributes())->fresh()->toLoupeArray();

        $this->assertArrayNotHasKey('recording', $array);
        $this->assertArrayNotHasKey('proposal', $array);
        // A thread without a pull request must not claim one.
        $this->assertArrayNotHasKey('pr', $array);
    }

    public function test_to_loupe_array_carries_the_repo_and_branch_when_set(): void
    {
        $comment = Comment::query()->create($this->attributes() + ['repo' => 'acme/web', 'branch' => 'main']);

        $array = $comment->fresh()->toLoupeArray();

        $this->assertSame('acme/web', $array['repo']);
        $this->assertSame('main', $array['branch']);
    }

    public function test_a_legacy_status_reads_as_a_board_stage(): void
    {
        // A row written before the five-stage board must still land on a column,
        // even if the data migration has not run yet.
        $comment = Comment::query()->create(['status' => 'open'] + $this->attributes());

        $this->assertSame('queue', $comment->fresh()->toLoupeArray()['status']);
    }

    private function attributes(): array
    {
        return [
            'id' => 'c1',
            'project_key' => 'app',
            'url' => '/p',
            'status' => 'queue',
            'body' => 'hi',
            'kind' => 'element',
            'author' => ['id' => '1', 'name' => 'Sara'],
            'author_id' => '1',
            'anchor' => ['testid' => null, 'cssPath' => 'div'],
            'context' => ['html' => '<div></div>', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ];
    }
}
