<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Events\CommentCreated;
use Loupekit\Loupe\Events\CommentDeleted;
use Loupekit\Loupe\Events\CommentStatusChanged;
use Loupekit\Loupe\Events\HubUpdateReceived;
use Loupekit\Loupe\Facades\Loupe;
use Loupekit\Loupe\Jobs\SendUpdateToHub;
use Loupekit\Loupe\Models\Activity;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Models\Notification;
use Loupekit\Loupe\Support\Relay;
use Loupekit\Loupe\Tests\TestCase;

/** Two-way sync after Hub delivered a ticket: status back to the sender, replies both ways. */
class RelayTest extends TestCase
{
    private const SECRET = 'psk_receiver_secret';

    private const PROJECT = 'prj_tracker';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('loupe.hub.url', 'https://hub.test/');
        config()->set('loupe.hub.project_id', self::PROJECT);
        config()->set('loupe.hub.project_secret', self::SECRET);
    }

    private function comment(string $id, array $over = []): Comment
    {
        return Comment::query()->create(array_merge([
            'id' => $id, 'project_key' => 'app', 'url' => '/', 'status' => 'queue', 'title' => 'Pay button',
            'body' => 'It overlaps', 'kind' => 'free', 'author' => ['id' => '7', 'name' => 'Reporter'],
            'anchor' => [], 'context' => [], 'offset' => [],
        ], $over));
    }

    private function received(string $id = 'c1'): Comment
    {
        return $this->comment($id, ['author' => ['id' => 'hub:sara@shop.test', 'name' => 'Sara'], 'source' => ['projectId' => 'prj_shop', 'projectName' => 'Shop']]);
    }

    private function forwarded(string $id = 'c1'): Comment
    {
        return $this->comment($id, ['forwarded' => ['status' => 'ok', 'destinationProjectId' => 'prj_tracker', 'destinationProjectName' => 'Tracker']]);
    }

    private function send(array $body)
    {
        $raw = json_encode($body);
        $ts = (string) time();
        $server = [
            'HTTP_X_LOUPE_HUB_DELIVERY' => 'dlv_9',
            'HTTP_X_LOUPE_HUB_PROJECT' => self::PROJECT,
            'HTTP_X_LOUPE_HUB_TIMESTAMP' => $ts,
            'HTTP_X_LOUPE_HUB_SIGNATURE' => hash_hmac('sha256', $ts.'.'.$raw, self::SECRET),
            'CONTENT_TYPE' => 'application/json',
        ];

        return $this->call('POST', '/loupe/v1/hub/inbound', [], [], [], $server, $raw);
    }

    private function update(array $update, string $issue = 'c1', array $from = ['project_id' => 'prj_os', 'project_name' => 'Converted OS']): array
    {
        return ['type' => 'update', 'issue_id' => $issue, 'from' => $from, 'update' => $update];
    }

    public function test_model_events_fire_for_create_status_change_and_delete(): void
    {
        Event::fake([CommentCreated::class, CommentStatusChanged::class, CommentDeleted::class]);
        $c = $this->comment('c1', ['status' => 'open']);
        $c->update(['status' => 'queue']);            // legacy alias of the same stage: no change
        $c->update(['title' => 'Renamed']);           // not a status change
        $c->update(['status' => 'in_progress']);
        $c->delete();

        Event::assertDispatched(CommentCreated::class, fn ($e) => $e->comment->getKey() === 'c1');
        Event::assertDispatchedTimes(CommentStatusChanged::class, 1);
        Event::assertDispatched(CommentStatusChanged::class, fn ($e) => $e->from === 'queue' && $e->to === 'in_progress');
        Event::assertDispatched(CommentDeleted::class);
    }

    public function test_a_status_change_on_a_received_ticket_goes_back_through_hub_with_the_hosts_words(): void
    {
        Http::fake(['hub.test/*' => Http::response(['delivery' => 'ok'], 202)]);
        $c = $this->received();

        Loupe::describeTicket('c1', 'Ready for testing', 'CT-1405', 'https://crm.test/t/1405');
        $c->update(['status' => 'in_review']);
        $this->app->terminate();

        Http::assertSent(function (Request $r) {
            $ts = $r->header('X-Loupe-Timestamp')[0];

            return $r->url() === 'https://hub.test/v1/issues/c1/updates'
                && $r->header('X-Loupe-Project')[0] === self::PROJECT
                && hash_equals(hash_hmac('sha256', $ts.'.'.$r->body(), self::SECRET), $r->header('X-Loupe-Signature')[0])
                && json_decode($r->body(), true) === ['kind' => 'status', 'status' => 'in_review', 'label' => 'Ready for testing', 'reference' => 'CT-1405', 'url' => 'https://crm.test/t/1405'];
        });
        $this->assertSame(0, Activity::query()->where('kind', 'ticket.update_failed')->count());
    }

    public function test_status_changes_on_local_or_forwarded_tickets_and_quiet_changes_are_not_relayed(): void
    {
        Bus::fake();
        Loupe::describeTicket('c1', 'consumed and dropped');
        $this->comment('c1')->update(['status' => 'todo']);
        $this->forwarded('c2')->update(['status' => 'todo']);
        $r = $this->received('c3');
        Relay::quietly(fn () => $r->update(['status' => 'todo']));

        Bus::assertNothingDispatched();

        // The description was consumed by c1's change, so it does not leak into a later one.
        $r->update(['status' => 'resolved']);
        Bus::assertDispatchedAfterResponse(SendUpdateToHub::class, fn ($j) => $j->update === ['kind' => 'status', 'status' => 'resolved']);
    }

    public function test_nothing_is_relayed_when_hub_is_off(): void
    {
        config()->set('loupe.hub.url', '');
        Bus::fake();
        $this->received()->update(['status' => 'todo']);
        Bus::assertNothingDispatched();
    }

    public function test_a_reply_on_a_forwarded_or_received_ticket_is_relayed_and_one_from_hub_is_not(): void
    {
        Bus::fake();
        $this->forwarded('c1');
        $this->received('c2');
        $this->comment('c3');

        $m = Loupe::reply('c1', ['id' => '7', 'name' => 'Sara', 'email' => 'sara@shop.test'], 'Any news?', [['url' => '/a.png']]);
        Loupe::reply('c2', ['id' => '8', 'name' => 'Dev'], 'Fixed');
        Loupe::reply('c3', ['id' => '8', 'name' => 'Dev'], 'Local only');
        (new Message)->forceFill(['comment_id' => 'c1', 'author' => ['id' => 'hub:x', 'name' => 'X'], 'body' => 'came from hub', 'origin' => ['projectId' => 'prj_os']])->save();
        Relay::quietly(fn () => Loupe::reply('c1', ['id' => '7', 'name' => 'Sara'], 'quiet'));

        Bus::assertDispatchedAfterResponseTimes(SendUpdateToHub::class, 2);
        Bus::assertDispatchedAfterResponse(SendUpdateToHub::class, fn ($j) => $j->issueId === 'c1' && $j->update['kind'] === 'message'
            && $j->update['message']['id'] === $m->id
            && $j->update['message']['author'] === ['name' => 'Sara', 'email' => 'sara@shop.test']
            && $j->update['message']['body'] === 'Any news?'
            && $j->update['message']['attachments'] === [['url' => '/a.png']]
            && is_string($j->update['message']['createdAt']));
        Bus::assertDispatchedAfterResponse(SendUpdateToHub::class, fn ($j) => $j->issueId === 'c2' && $j->update['message']['author'] === ['name' => 'Dev']
            && ! array_key_exists('attachments', $j->update['message']));
    }

    public function test_a_failed_or_unreachable_update_is_logged_and_recorded_never_thrown(): void
    {
        Log::spy();
        Http::fake(['hub.test/*' => Http::sequence()
            ->push(['error' => 'not your ticket'], 403)
            ->push(['delivery' => 'failed'], 202)
            ->push(['delivery' => 'none'], 202)
            ->pushFailedConnection()]);

        foreach (range(1, 4) as $_) {
            (new SendUpdateToHub('c1', ['kind' => 'status', 'status' => 'todo']))->handle();
        }

        $this->assertSame(
            ['not your ticket', 'HTTP 202 · delivery failed', null],
            Activity::query()->where('kind', 'ticket.update_failed')->orderBy('id')->get()->map(fn ($a) => $a->detail)->take(2)->push(null)->all(),
        );
        $this->assertSame(3, Activity::query()->where('kind', 'ticket.update_failed')->count());
        $this->assertSame('Could not reach Loupe Hub', Activity::query()->where('kind', 'ticket.update_failed')->orderByDesc('id')->first()->label);
        Log::shouldHaveReceived('warning')->times(3);
    }

    public function test_an_update_failure_with_no_feed_table_still_does_not_throw(): void
    {
        Http::fake(fn () => throw new \RuntimeException('boom'));
        Schema::drop('loupe_activity');
        (new SendUpdateToHub('c1', ['kind' => 'message']))->handle();
        $this->assertFalse(Schema::hasTable('loupe_activity'));
    }

    public function test_a_feed_that_cannot_be_written_never_breaks_the_update(): void
    {
        Http::fake(fn () => throw new \RuntimeException('boom'));
        Activity::creating(fn () => throw new \RuntimeException('feed down'));
        Log::spy();

        (new SendUpdateToHub('c1', ['kind' => 'message']))->handle();

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_a_ticket_is_still_forwarded_when_the_receiver_route_is_missing(): void
    {
        Bus::fake();
        app('url')->setRoutes(new \Illuminate\Routing\RouteCollection);

        \Loupekit\Loupe\Support\Hub::forward(['email' => 'sara@acme.com'], ['id' => 'c1']);

        Bus::assertDispatchedAfterResponse(\Loupekit\Loupe\Jobs\SendToHub::class, fn ($j) => $j->replyUrl === null);
    }

    public function test_a_status_from_the_receiver_moves_the_senders_card_and_says_why(): void
    {
        Bus::fake();
        Event::fake([HubUpdateReceived::class]);
        $this->forwarded();

        $this->send($this->update(['kind' => 'status', 'status' => 'in_review', 'label' => 'Ready for testing', 'reference' => 'CT-1405', 'url' => 'https://crm.test/t/1405']))
            ->assertStatus(202)->assertExactJson(['applied' => 'status', 'status' => 'in_review']);

        $c = Comment::query()->find('c1');
        $this->assertSame('in_review', $c->status);
        $this->assertSame('ok', $c->forwarded['status']);
        $this->assertSame(['status', 'label', 'reference', 'url', 'projectName', 'at'], array_keys($c->forwarded['remote']));
        $this->assertSame('Ready for testing', $c->forwarded['remote']['label']);
        $this->assertSame('Converted OS: CT-1405 · Ready for testing — “Pay button”', Notification::query()->sole()->body);
        $this->assertSame('Converted OS moved “Pay button” to Ready for testing', Activity::query()->where('kind', 'ticket.updated')->sole()->label);
        // Applied quietly: the receiver's own change is not echoed back.
        Bus::assertNothingDispatched();
        Event::assertDispatched(HubUpdateReceived::class, fn ($e) => $e->update['status'] === 'in_review' && $e->from['project_id'] === 'prj_os');
    }

    public function test_a_bare_status_uses_the_board_label_and_the_project_id(): void
    {
        $this->comment('c1', ['title' => null, 'author' => ['id' => '7']]);

        $this->send($this->update(['kind' => 'status', 'status' => 'done'], 'c1', ['project_id' => 'prj_os']))->assertStatus(202);

        $c = Comment::query()->find('c1');
        $this->assertSame('resolved', $c->status);
        $this->assertSame(['status', 'at'], array_keys($c->forwarded['remote']));
        $this->assertSame('prj_os: Resolved — “It overlaps”', Notification::query()->sole()->body);
    }

    public function test_a_reply_from_the_other_project_lands_in_the_thread_once(): void
    {
        Bus::fake();
        $this->forwarded();
        $msg = ['kind' => 'message', 'message' => ['id' => 'm_remote_1', 'author' => ['name' => 'Dev', 'email' => 'dev@os.test'], 'body' => 'Fixed on staging', 'createdAt' => '2026-10-04T09:00:00.000Z', 'attachments' => [['url' => 'https://os.test/a.png']]]];

        $this->send($this->update($msg))->assertStatus(202)->assertExactJson(['applied' => 'message', 'message' => 'm_remote_1']);
        $this->send($this->update($msg))->assertStatus(202)->assertExactJson(['applied' => 'message', 'duplicate' => true]);

        $m = Message::query()->sole();
        $this->assertSame(['id' => 'hub:dev@os.test', 'name' => 'Dev', 'email' => 'dev@os.test', 'type' => 'user'], $m->author);
        $this->assertSame(['projectId' => 'prj_os', 'projectName' => 'Converted OS'], $m->origin);
        $this->assertSame('2026-10-04T09:00:00.000000Z', $m->created_at->toISOString());
        $this->assertSame([['url' => 'https://os.test/a.png']], $m->attachments);
        $this->assertSame(['projectId' => 'prj_os', 'projectName' => 'Converted OS'], $m->toLoupeArray()['origin']);
        $this->assertSame('Dev replied from Converted OS on “Pay button”', Notification::query()->sole()->body);
        $this->assertSame(1, Activity::query()->where('kind', 'ticket.reply')->count());
        Bus::assertNothingDispatched();
    }

    public function test_a_reply_with_no_author_or_date_is_still_stored(): void
    {
        $this->forwarded();
        foreach (['m1' => null, 'm2' => 'not a date'] as $id => $at) {
            $this->send($this->update(['kind' => 'message', 'message' => array_filter(['id' => $id, 'body' => 'hi', 'createdAt' => $at])], 'c1', ['project_id' => 'prj_os']))->assertStatus(202);
        }

        $this->assertSame(['id' => 'hub:prj_os', 'name' => 'prj_os', 'type' => 'user'], Message::query()->find('m1')->author);
        $this->assertEqualsWithDelta(time(), Message::query()->find('m2')->created_at->getTimestamp(), 5);
    }

    public function test_a_reply_without_the_messages_table_is_acknowledged_not_failed(): void
    {
        $this->forwarded();
        Schema::drop('loupe_messages');

        $this->send($this->update(['kind' => 'message', 'message' => ['id' => 'm1', 'body' => 'hi']]))
            ->assertStatus(202)->assertJson(['applied' => 'none']);
    }

    public function test_it_validates_updates(): void
    {
        $this->forwarded();
        $bad = [
            ['type' => 'update'],
            $this->update(['kind' => 'status', 'status' => 'shipped']),
            $this->update(['kind' => 'status']),
            $this->update(['kind' => 'message', 'message' => ['id' => 'm1', 'body' => ' ']]),
            $this->update(['kind' => 'message', 'message' => ['id' => str_repeat('a', 192), 'body' => 'x']]),
            $this->update(['kind' => 'message']),
            $this->update(['kind' => 'nudge']),
            $this->update(['kind' => 'status', 'status' => 'todo'], 'c1', ['project_name' => 'x']),
        ];
        foreach ($bad as $body) {
            $this->send($body)->assertStatus(422);
        }
        $this->send($this->update(['kind' => 'status', 'status' => 'todo'], 'missing'))->assertStatus(404);
        $this->assertSame('queue', Comment::query()->find('c1')->status);
    }

    public function test_the_ingest_body_carries_where_to_send_updates_back(): void
    {
        Bus::fake();
        $user = $this->actingAsAllowed(['email' => 'sara@acme.com']);
        $this->postJson('/loupe/v1/comments', [
            'id' => 'c9', 'projectKey' => 'app', 'url' => '/', 'status' => 'queue', 'body' => 'x',
            'author' => ['id' => (string) $user->id, 'name' => 'Sara'], 'anchor' => [], 'context' => [], 'offset' => ['x' => 0, 'y' => 0],
        ])->assertCreated();

        Bus::assertDispatchedAfterResponse(\Loupekit\Loupe\Jobs\SendToHub::class, fn ($j) => $j->replyUrl === 'http://localhost/loupe/v1/hub/inbound');
    }
}
