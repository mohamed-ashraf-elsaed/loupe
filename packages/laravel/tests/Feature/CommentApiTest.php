<?php

namespace Loupekit\Loupe\Tests\Feature;

use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Tests\TestCase;

class CommentApiTest extends TestCase
{
    public function test_it_requires_authentication(): void
    {
        // No user → the auth middleware rejects (401 for JSON).
        $this->getJson('/loupe/v1/comments?projectKey=app')->assertUnauthorized();
    }

    public function test_it_forbids_unauthorized_users(): void
    {
        config()->set('loupe.authorize.use', fn () => false);
        $this->actingAs($this->makeUser());

        $this->getJson('/loupe/v1/comments?projectKey=app')->assertForbidden();
    }

    public function test_it_lists_comments_newest_first(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('a', ['created_at' => now()->subMinute()]);
        $this->seedComment('b', ['created_at' => now()]);

        $response = $this->getJson('/loupe/v1/comments?projectKey=app')->assertOk();

        $ids = array_column($response->json(), 'id');
        $this->assertSame(['b', 'a'], $ids);
    }

    public function test_it_filters_by_normalized_url(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('a', ['url' => '/p']);
        $this->seedComment('b', ['url' => '/other']);

        $response = $this->getJson('/loupe/v1/comments?projectKey=app&url='.urlencode('/p/?utm_source=x'))->assertOk();

        $this->assertCount(1, $response->json());
        $this->assertSame('a', $response->json()[0]['id']);
    }

    public function test_it_creates_a_comment(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))
            ->assertCreated()
            ->assertJsonPath('id', 'c1')
            ->assertJsonPath('projectKey', 'app')
            ->assertJsonPath('status', 'open');

        $this->assertDatabaseHas('loupe_comments', ['id' => 'c1', 'author_id' => (string) $user->id]);
    }

    public function test_it_honors_a_client_supplied_created_at_and_preserves_it_on_upsert(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id, [
            'createdAt' => '2020-01-02T03:04:05Z',
        ]))->assertCreated()->assertJsonPath('createdAt', '2020-01-02T03:04:05.000000Z');

        // Upsert with a new body — created_at must not change.
        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id, ['body' => 'edited']))
            ->assertCreated()
            ->assertJsonPath('body', 'edited')
            ->assertJsonPath('createdAt', '2020-01-02T03:04:05.000000Z');
    }

    public function test_it_stores_a_region_comment(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('r1', $user->id, [
            'kind' => 'region',
            'region' => ['x' => 1, 'y' => 2, 'w' => 3, 'h' => 4],
        ]))->assertCreated()
            ->assertJsonPath('kind', 'region')
            ->assertJsonPath('region.w', 3);
    }

    public function test_it_rejects_a_missing_id(): void
    {
        $user = $this->actingAsAllowed();
        $payload = $this->payload('x', $user->id);
        unset($payload['id']);

        $this->postJson('/loupe/v1/comments', $payload)
            ->assertStatus(422)
            ->assertJsonPath('error', 'id required');
    }

    public function test_it_forbids_posting_as_another_user(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', 999999))
            ->assertForbidden()
            ->assertJsonPath('error', 'cannot post as another user');
    }

    public function test_it_updates_status_and_body(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'done', 'body' => 'b2'])
            ->assertOk()
            ->assertJsonPath('status', 'done')
            ->assertJsonPath('body', 'b2');
    }

    public function test_update_with_no_patchable_fields_is_a_noop(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1', ['status' => 'open']);

        $this->patchJson('/loupe/v1/comments/c1', ['ignored' => 'x'])
            ->assertOk()
            ->assertJsonPath('status', 'open');
    }

    public function test_update_returns_404_for_missing_comment(): void
    {
        $this->actingAsAllowed();

        $this->patchJson('/loupe/v1/comments/missing', ['status' => 'done'])
            ->assertNotFound();
    }

    public function test_it_deletes_a_comment(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        $this->deleteJson('/loupe/v1/comments/c1')->assertNoContent();
        $this->assertDatabaseMissing('loupe_comments', ['id' => 'c1']);
    }

    public function test_delete_is_idempotent_for_missing_comments(): void
    {
        $this->actingAsAllowed();

        $this->deleteJson('/loupe/v1/comments/missing')->assertNoContent();
    }

    private function seedComment(string $id, array $overrides = []): Comment
    {
        return Comment::query()->create(array_merge([
            'id' => $id,
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
        ], $overrides));
    }

    private function payload(string $id, $userId, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'projectKey' => 'app',
            'url' => '/p',
            'status' => 'open',
            'body' => 'hello',
            'kind' => 'element',
            'author' => ['id' => (string) $userId, 'name' => 'Sara'],
            'anchor' => ['testid' => 'kpi', 'cssPath' => 'div'],
            'context' => ['html' => '<div></div>', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ], $overrides);
    }
}
