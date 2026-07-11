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
        $this->assertSame('open', $array['status']);
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

    public function test_kind_defaults_to_element_when_blank(): void
    {
        $comment = new Comment(array_merge($this->attributes(), ['kind' => '']));

        $this->assertSame('element', $comment->toLoupeArray()['kind']);
    }

    private function attributes(): array
    {
        return [
            'id' => 'c1',
            'project_key' => 'app',
            'url' => '/p',
            'status' => 'open',
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
