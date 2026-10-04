<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Lottery;
use Loupekit\Loupe\Models\Activity;
use Loupekit\Loupe\Support\ActivityLog;
use Loupekit\Loupe\Tests\TestCase;

class ActivityTest extends TestCase
{
    private function comment(int|string $userId, array $over = []): array
    {
        return array_merge([
            'id' => 'c1', 'projectKey' => 'app', 'url' => '/checkout', 'status' => 'open',
            'title' => 'Pay button', 'body' => 'The button is misaligned', 'kind' => 'element',
            'author' => ['id' => (string) $userId, 'name' => 'Sara PM'],
            'anchor' => ['tag' => 'button'], 'context' => ['html' => '', 'styles' => []], 'offset' => ['x' => 0.5, 'y' => 0.5],
        ], $over);
    }

    public function test_comment_writes_are_recorded_with_the_actor(): void
    {
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->comment($user->id))->assertCreated();
        $this->postJson('/loupe/v1/comments', $this->comment($user->id, ['title' => null, 'body' => 'Edited body']))->assertCreated();
        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'in_progress'])->assertOk();
        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'in_progress', 'title' => 'Renamed'])->assertOk();
        $this->patchJson('/loupe/v1/comments/c1', [])->assertOk();
        $this->deleteJson('/loupe/v1/comments/c1')->assertNoContent();
        $this->deleteJson('/loupe/v1/comments/c1')->assertNoContent(); // already gone: nothing recorded

        $rows = Activity::query()->orderBy('id')->get();
        $this->assertSame(
            ['comment.create', 'comment.update', 'comment.status', 'comment.update', 'comment.delete'],
            $rows->pluck('kind')->all(),
        );
        $this->assertSame([
            'Sara PM added “Pay button”',
            'Sara PM edited “Edited body”',
            'Sara PM moved “Edited body” to In Progress',
            'Sara PM edited “Renamed”',
            'Sara PM deleted “Renamed”',
        ], $rows->pluck('label')->all());
        $this->assertSame('/checkout', $rows[0]->detail);
        $this->assertSame(['id' => (string) $user->id, 'name' => 'Sara PM'], $rows[0]->actor);
        $this->assertSame('c1', $rows[4]->comment_id);
    }

    public function test_the_feed_is_newest_first_scoped_to_the_project_and_filtered_by_since(): void
    {
        $this->actingAsAllowed();
        Carbon::setTestNow('2026-10-01 10:00:00');
        ActivityLog::record('comment.create', 'first', commentId: 'c1', actor: ['id' => '1', 'name' => 'A']);
        Carbon::setTestNow('2026-10-01 10:05:00');
        ActivityLog::record('ticket.forward_failed', 'second', 'HTTP 500', 'warn');
        ActivityLog::record('x', 'bad level', level: 'loud');
        Activity::query()->create(['project_key' => 'other', 'kind' => 'x', 'label' => 'other app', 'level' => 'info', 'created_at' => Carbon::now()]);
        Carbon::setTestNow();

        $feed = $this->getJson('/loupe/v1/activity')->assertOk()->json();
        $this->assertSame(['bad level', 'second', 'first'], array_column($feed, 'label'));
        $this->assertSame('info', $feed[0]['level']);
        $this->assertSame(['id' => $feed[1]['id'], 'at' => '2026-10-01T10:05:00.000000Z', 'kind' => 'ticket.forward_failed', 'label' => 'second', 'level' => 'warn', 'detail' => 'HTTP 500'], $feed[1]);
        $this->assertSame(['id' => '1', 'name' => 'A'], $feed[2]['actor']);
        $this->assertSame('c1', $feed[2]['commentId']);

        $since = $this->getJson('/loupe/v1/activity?since='.urlencode('2026-10-01T10:05:00Z'))->assertOk()->json();
        $this->assertSame(['bad level', 'second'], array_column($since, 'label'));
        $this->getJson('/loupe/v1/activity?since=yesterday-ish-nonsense')->assertStatus(422);
    }

    public function test_the_feed_is_capped(): void
    {
        $this->actingAsAllowed();
        for ($i = 0; $i < 205; $i++) {
            ActivityLog::record('x', "e$i");
        }

        $this->assertCount(200, $this->getJson('/loupe/v1/activity')->json());
    }

    public function test_it_is_off_when_disabled_or_not_migrated(): void
    {
        $user = $this->actingAsAllowed();
        config()->set('loupe.activity.enabled', false);
        $this->assertNull(ActivityLog::record('x', 'y'));
        $this->getJson('/loupe/v1/activity')->assertNotFound();
        $this->postJson('/loupe/v1/comments', $this->comment($user->id))->assertCreated();
        $this->assertSame(0, Activity::query()->count());

        config()->set('loupe.activity.enabled', true);
        Schema::drop('loupe_activity');
        $this->assertNull(ActivityLog::record('x', 'y'));
        $this->getJson('/loupe/v1/activity')->assertNotFound();
        $this->patchJson('/loupe/v1/comments/c1', ['status' => 'todo'])->assertOk();
    }

    public function test_it_needs_the_use_ability(): void
    {
        config()->set('loupe.authorize.use', fn () => false);
        $this->actingAs($this->makeUser());

        $this->getJson('/loupe/v1/activity')->assertForbidden();
    }

    public function test_old_rows_are_pruned(): void
    {
        Carbon::setTestNow('2026-08-01 00:00:00');
        ActivityLog::record('x', 'old');
        Carbon::setTestNow('2026-10-01 00:00:00');
        Lottery::alwaysWin();
        ActivityLog::record('x', 'new');
        Lottery::determineResultNormally();

        $this->assertSame(['new'], Activity::query()->pluck('label')->all());

        config()->set('loupe.activity.retention_days', 0); // clamped to one day, so today's row stays
        $this->assertSame(0, ActivityLog::prune());
        Carbon::setTestNow();
    }

    public function test_actor_name_falls_back(): void
    {
        $this->assertSame('Someone', ActivityLog::actorName(null));
        $this->assertSame('Someone', ActivityLog::actorName(['name' => '']));
        $this->assertSame('Ali', ActivityLog::actorName(['name' => 'Ali']));
    }
}
