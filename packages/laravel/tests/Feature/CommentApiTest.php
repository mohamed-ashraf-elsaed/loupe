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
            ->assertJsonPath('status', 'queue')
            // A comment filed without triage metadata reads as the defaults.
            ->assertJsonPath('priority', 'medium')
            ->assertJsonPath('changeType', 'other');

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

    public function test_it_stores_a_free_comment(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('f1', $user->id, [
            'kind' => 'free',
            'anchor' => ['tag' => 'page', 'cssPath' => 'page', 'testid' => null],
            'context' => ['html' => '', 'styles' => []],
            'offset' => ['x' => 0.25, 'y' => 0.75],
            'screenshot' => null,
        ]))->assertCreated()
            ->assertJsonPath('kind', 'free')
            ->assertJsonPath('screenshot', null)
            ->assertJsonPath('offset.x', 0.25);

        $this->assertDatabaseHas('loupe_comments', ['id' => 'f1', 'kind' => 'free', 'screenshot_url' => null]);
    }

    public function test_it_stores_a_recording_comment(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('rec1', $user->id, [
            'kind' => 'region',
            'region' => ['x' => 1, 'y' => 2, 'w' => 3, 'h' => 4],
            'recording' => 'http://x/rec.webm',
        ]))->assertCreated()
            ->assertJsonPath('recording', 'http://x/rec.webm');

        $this->assertDatabaseHas('loupe_comments', ['id' => 'rec1', 'recording_url' => 'http://x/rec.webm']);
    }

    public function test_it_patches_a_proposal_onto_a_comment(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        $proposal = ['html' => '<b>fixed</b>', 'css' => '.x{color:red}', 'notes' => 'tightened', 'author' => 'Claude Code via MCP', 'createdAt' => '2026-01-02T00:00:00.000Z'];

        $this->patchJson('/loupe/v1/comments/c1', ['proposal' => $proposal])
            ->assertOk()
            ->assertJsonPath('proposal.html', '<b>fixed</b>')
            ->assertJsonPath('proposal.css', '.x{color:red}');

        $this->assertSame($proposal, Comment::query()->find('c1')->fresh()->toLoupeArray()['proposal']);
    }

    public function test_it_stores_a_pr_on_create_and_accepts_it_on_patch(): void
    {
        $user = $this->actingAsAllowed();

        $pr = ['number' => 412, 'url' => 'https://github.com/acme/web/pull/412', 'checksPassed' => 3, 'checksTotal' => 4];

        $this->postJson('/loupe/v1/comments', $this->payload('p1', $user->id, ['pr' => $pr]))
            ->assertCreated()
            ->assertJsonPath('pr.number', 412)
            ->assertJsonPath('pr.checksTotal', 4);

        $this->assertSame($pr, Comment::query()->find('p1')->fresh()->toLoupeArray()['pr']);

        // A patch can move it on — a merged PR is the same shape with a new state.
        $this->patchJson('/loupe/v1/comments/p1', ['pr' => ['number' => 412, 'state' => 'merged']])
            ->assertOk()
            ->assertJsonPath('pr.state', 'merged');
    }

    public function test_it_ignores_a_non_array_pr(): void
    {
        // A garbage `pr` is dropped rather than stored, so the panel never renders a
        // chip from something that is not a PR.
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('p2', $user->id, ['pr' => 'nope']))
            ->assertCreated()
            ->assertJsonMissingPath('pr');

        $this->assertNull(Comment::query()->find('p2')->fresh()->pr);
    }

    public function test_it_stores_a_title_and_attachments(): void
    {
        $user = $this->actingAsAllowed();

        $attachments = [
            ['url' => 'http://x/a.png', 'name' => 'a.png', 'mime' => 'image/png', 'kind' => 'image', 'size' => 10],
            ['url' => 'http://x/b.webm', 'name' => 'b.webm', 'mime' => 'video/webm', 'kind' => 'video', 'size' => 20],
        ];

        $this->postJson('/loupe/v1/comments', $this->payload('t1', $user->id, [
            'title' => 'Revenue card is wrong',
            'attachments' => $attachments,
        ]))->assertCreated()
            ->assertJsonPath('title', 'Revenue card is wrong')
            ->assertJsonPath('attachments.1.kind', 'video');

        $this->assertDatabaseHas('loupe_comments', ['id' => 't1', 'title' => 'Revenue card is wrong']);

        // Round-trips through the canonical shape the dashboard/Hub consume.
        $row = Comment::query()->find('t1')->fresh()->toLoupeArray();
        $this->assertSame('Revenue card is wrong', $row['title']);
        $this->assertCount(2, $row['attachments']);
    }

    public function test_it_ignores_a_non_array_attachments_value(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('t2', $user->id, ['attachments' => 'nope']))
            ->assertCreated();

        $this->assertNull(Comment::query()->find('t2')->attachments);
    }

    public function test_it_patches_a_title(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        $this->patchJson('/loupe/v1/comments/c1', ['title' => 'A better title'])
            ->assertOk()
            ->assertJsonPath('title', 'A better title');
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

        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'resolved', 'body' => 'b2'])
            ->assertOk()
            ->assertJsonPath('status', 'resolved')
            ->assertJsonPath('body', 'b2');
    }

    public function test_it_accepts_a_legacy_status_and_lands_it_on_a_stage(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        // An older widget still sends `done`; it must not fall off the board.
        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'done'])
            ->assertOk()
            ->assertJsonPath('status', 'resolved');
    }

    public function test_it_updates_triage_metadata(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1');

        // The API speaks camelCase `changeType`; the column is snake.
        $this->patchJson('/loupe/v1/comments/c1', ['priority' => 'critical', 'changeType' => 'api'])
            ->assertOk()
            ->assertJsonPath('priority', 'critical')
            ->assertJsonPath('changeType', 'api');

        // An unknown value is coerced rather than stored raw.
        $this->patchJson('/loupe/v1/comments/c1', ['priority' => 'urgent', 'changeType' => 'css'])
            ->assertOk()
            ->assertJsonPath('priority', 'medium')
            ->assertJsonPath('changeType', 'other');
    }

    public function test_it_records_the_repo_and_branch(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id) + ['repo' => 'acme/web', 'branch' => 'feature/x'])
            ->assertCreated()
            ->assertJsonPath('repo', 'acme/web')
            ->assertJsonPath('branch', 'feature/x');

        // A blank value is stored as NULL, not as an empty string.
        $this->postJson('/loupe/v1/comments', $this->payload('c2', $user->id) + ['repo' => '', 'branch' => ''])
            ->assertCreated();
        $this->assertDatabaseHas('loupe_comments', ['id' => 'c2', 'repo' => null, 'branch' => null]);
    }

    public function test_it_filters_the_list_by_query_params(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('a', ['repo' => 'acme/web', 'branch' => 'main', 'priority' => 'critical', 'change_type' => 'api', 'title' => 'Checkout', 'url' => '/p']);
        $this->seedComment('b', ['repo' => 'acme/api', 'branch' => 'main', 'kind' => 'free', 'title' => 'Docs', 'body' => 'cramped', 'url' => '/q']);

        $ids = function (string $qs): array {
            $res = $this->getJson('/loupe/v1/comments'.($qs !== '' ? '?'.$qs : ''))->assertOk()->json();

            return array_column($res, 'id');
        };

        $this->assertSame(['a', 'b'], $ids(''));
        $this->assertSame(['a'], $ids('repo=acme/web'));
        $this->assertSame(['b'], $ids('repo=acme/api'));
        $this->assertSame(['a', 'b'], $ids('branch=main'));
        $this->assertSame(['a'], $ids('priority=critical'));
        $this->assertSame(['a'], $ids('changeType=api'));
        $this->assertSame(['b'], $ids('kind=free'));
        $this->assertSame(['a'], $ids('q=checkout'));   // title, case-insensitive
        $this->assertSame(['b'], $ids('q=CRAMPED'));    // body
        $this->assertSame([], $ids('repo=acme/web&priority=low')); // filters compose
        // A legacy stage name still matches board rows.
        $this->assertSame(['a', 'b'], $ids('status=open'));
    }

    public function test_update_with_no_patchable_fields_is_a_noop(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1', ['status' => 'open']);

        $this->patchJson('/loupe/v1/comments/c1', ['ignored' => 'x'])
            ->assertOk()
            // A pre-board row still reads as a stage.
            ->assertJsonPath('status', 'queue');
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

    public function test_an_unknown_status_is_refused_not_coerced_to_the_queue(): void
    {
        $this->actingAsAllowed();
        $this->seedComment('c1', ['status' => 'in_progress']);

        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'shipped'])->assertStatus(422);
        $this->patchJson('/loupe/v1/comments/c1', ['status' => null])->assertStatus(422);
        $this->assertSame('in_progress', \Loupekit\Loupe\Models\Comment::query()->find('c1')->status);
        // Legacy aliases are still accepted.
        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'done'])->assertOk();
    }

    public function test_only_the_author_or_an_admin_deletes_a_comment(): void
    {
        $this->actingAsAllowed();
        config()->set('loupe.authorize.dashboard', fn () => false);
        $this->seedComment('theirs', ['author' => ['id' => 'someone-else', 'name' => 'X'], 'author_id' => 'someone-else']);

        $this->deleteJson('/loupe/v1/comments/theirs')->assertForbidden();
        $this->assertDatabaseHas('loupe_comments', ['id' => 'theirs']);

        config()->set('loupe.authorize.dashboard', fn () => true);
        $this->deleteJson('/loupe/v1/comments/theirs')->assertNoContent();
        $this->assertDatabaseMissing('loupe_comments', ['id' => 'theirs']);
    }

    public function test_delete_is_idempotent_for_missing_comments(): void
    {
        $this->actingAsAllowed();

        $this->deleteJson('/loupe/v1/comments/missing')->assertNoContent();
    }

    public function test_a_custom_user_resolver_defines_who_may_post(): void
    {
        $this->actingAsAllowed();
        // The host app decides the widget's identity — here, an admin impersonating a
        // user: the comment must be attributable to the ADMIN, not the impersonated account.
        config()->set('loupe.user_resolver', fn () => [
            'id' => 'admin-7',
            'name' => 'Admin Impersonator',
            'email' => 'admin@converted.in',
        ]);

        $this->postJson('/loupe/v1/comments', $this->payload('imp1', 'admin-7'))
            ->assertCreated()
            ->assertJsonPath('author.id', 'admin-7');

        $this->assertSame('admin-7', Comment::query()->find('imp1')->author_id);
    }

    public function test_the_identity_check_still_rejects_an_unrelated_author(): void
    {
        $this->actingAsAllowed();
        config()->set('loupe.user_resolver', fn () => ['id' => 'admin-7', 'name' => 'Admin', 'email' => 'admin@converted.in']);

        $this->postJson('/loupe/v1/comments', $this->payload('imp2', 'someone-else'))
            ->assertForbidden()
            ->assertJsonPath('error', 'cannot post as another user');
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
