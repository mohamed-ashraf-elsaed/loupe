<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Events\TicketReceived;
use Loupekit\Loupe\Http\Middleware\VerifyHubSignature;
use Loupekit\Loupe\Models\Activity;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Tests\TestCase;
use RuntimeException;

class InboundTicketTest extends TestCase
{
    private const SECRET = 'psk_receiver_secret';

    private const PROJECT = 'prj_tracker';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('loupe.hub.url', 'https://hub.test');
        config()->set('loupe.hub.project_id', self::PROJECT);
        config()->set('loupe.hub.project_secret', self::SECRET);
    }

    private function delivery(array $issue = [], array $over = []): array
    {
        return array_replace_recursive([
            'project_id' => 'prj_shop',
            'organization_id' => 'org_1',
            'source' => [
                'project_id' => 'prj_shop',
                'project_name' => 'Shop',
                'organization_id' => 'org_1',
                'organization_name' => 'Acme',
            ],
            'user' => ['email' => 'sara@acme.com', 'name' => 'Sara PM'],
            'issue' => array_merge([
                'id' => 'c_remote_1',
                'projectKey' => 'shop',
                'url' => '/checkout',
                'title' => 'Pay button overlaps',
                'body' => 'On mobile the pay button covers the total',
                'status' => 'in_progress',
                'priority' => 'high',
                'changeType' => 'bug',
                'kind' => 'element',
                'author' => ['id' => '7', 'name' => 'Sara PM'],
                'anchor' => ['tag' => 'button'],
                'context' => ['html' => '<button/>', 'styles' => []],
                'offset' => ['x' => 0.2, 'y' => 0.4],
                'screenshot' => 'https://shop.test/loupe/v1/blobs/abc.png',
                'createdAt' => '2026-10-01T10:00:00.000Z',
            ], $issue),
            'received_at' => '2026-10-01T10:00:01.000Z',
        ], $over);
    }

    /** @param  array<string, string|null>  $headers  null removes a header */
    private function send(array|string $body, array $headers = [], ?string $secret = null)
    {
        $raw = is_string($body) ? $body : json_encode($body);
        $ts = (string) time();
        $base = [
            'X-Loupe-Hub-Delivery' => 'dlv_1',
            'X-Loupe-Hub-Project' => self::PROJECT,
            'X-Loupe-Hub-Timestamp' => $ts,
            'X-Loupe-Hub-Signature' => hash_hmac('sha256', $ts.'.'.$raw, $secret ?? self::SECRET),
        ];
        $all = array_filter(array_replace($base, $headers), fn ($v) => $v !== null);
        $server = [];
        foreach ($all as $k => $v) {
            $server['HTTP_'.strtoupper(str_replace('-', '_', $k))] = $v;
        }
        $server['CONTENT_TYPE'] = 'application/json';

        return $this->call('POST', '/loupe/v1/hub/inbound', [], [], [], $server, $raw);
    }

    public function test_a_signed_delivery_creates_a_ticket_in_the_queue_and_fires_the_event(): void
    {
        Event::fake([TicketReceived::class]);

        $this->send($this->delivery())->assertStatus(202)->assertExactJson(['ticket' => 'c_remote_1']);

        $c = Comment::query()->findOrFail('c_remote_1');
        $this->assertSame('app', $c->project_key); // this app's key, not the sender's
        $this->assertSame('queue', $c->status);   // untriaged here, whatever it was there
        $this->assertSame('high', $c->priority);
        $this->assertSame('Pay button overlaps', $c->title);
        $this->assertSame(['id' => 'hub:sara@acme.com', 'name' => 'Sara PM'], $c->author);
        $this->assertNull($c->author_id);
        $this->assertSame('https://shop.test/loupe/v1/blobs/abc.png', $c->screenshot_url);
        $this->assertSame('2026-10-01T10:00:00.000000Z', $c->created_at->toISOString());
        $this->assertSame([
            'projectId' => 'prj_shop',
            'projectName' => 'Shop',
            'organizationId' => 'org_1',
            'organizationName' => 'Acme',
            'deliveryId' => 'dlv_1',
            'receivedAt' => '2026-10-01T10:00:01.000Z',
            'reporter' => ['email' => 'sara@acme.com', 'name' => 'Sara PM'],
        ], $c->source);
        $this->assertSame($c->source, $c->toLoupeArray()['source']);

        Event::assertDispatched(TicketReceived::class, fn (TicketReceived $e) => $e->comment->getKey() === 'c_remote_1'
            && $e->source['projectName'] === 'Shop'
            && $e->user === ['email' => 'sara@acme.com', 'name' => 'Sara PM']);

        $event = Activity::query()->sole();
        $this->assertSame('ticket.received', $event->kind);
        $this->assertSame('Received “Pay button overlaps” from Shop', $event->label);
        $this->assertSame('c_remote_1', $event->comment_id);
    }

    public function test_a_repeat_delivery_is_acknowledged_once(): void
    {
        Event::fake([TicketReceived::class]);

        $this->send($this->delivery())->assertStatus(202);
        $this->send($this->delivery(['body' => 'changed']))->assertStatus(202)
            ->assertExactJson(['ticket' => 'c_remote_1', 'duplicate' => true]);

        $this->assertSame(1, Comment::query()->count());
        Event::assertDispatchedTimes(TicketReceived::class, 1);
    }

    public function test_a_failing_listener_rolls_the_ticket_back_so_the_retry_runs_again(): void
    {
        Event::listen(TicketReceived::class, fn () => throw new RuntimeException('tracker down'));

        $this->send($this->delivery())->assertStatus(500);
        $this->assertSame(0, Comment::query()->count());
    }

    public function test_it_fills_defaults_for_a_minimal_ticket(): void
    {
        $body = $this->delivery();
        $body['issue'] = ['id' => 'c_min', 'createdAt' => 'not a date'];
        $body['user'] = ['email' => 'dev@acme.com'];
        $body['source'] = ['project_id' => 'prj_shop'];

        $this->send($body)->assertStatus(202);

        $c = Comment::query()->findOrFail('c_min');
        $this->assertSame('/', $c->url);
        $this->assertSame('free', $c->kind);
        $this->assertSame(['id' => 'hub:dev@acme.com', 'name' => 'dev@acme.com'], $c->author);
        $this->assertSame(['x' => 0.5, 'y' => 0.5], $c->offset);
        $this->assertNull($c->title);
        $this->assertNull($c->source['projectName']);
        $this->assertSame(['email' => 'dev@acme.com'], $c->source['reporter']);
        $this->assertEqualsWithDelta(time(), $c->created_at->getTimestamp(), 5);
        $this->assertSame('Received “” from prj_shop', Activity::query()->sole()->label);

        $body['issue'] = ['id' => 'c_undated'];
        $this->send($body)->assertStatus(202);
        $this->assertEqualsWithDelta(time(), Comment::query()->findOrFail('c_undated')->created_at->getTimestamp(), 5);
    }

    public function test_it_validates_the_body(): void
    {
        $this->send('not json')->assertStatus(422)->assertJson(['error' => 'issue.id required']);
        $this->send($this->delivery(['id' => '']))->assertStatus(422);
        $this->send($this->delivery(['id' => str_repeat('a', 192)]))->assertStatus(422);
        $this->send(array_merge($this->delivery(), ['user' => ['name' => 'x']]))->assertStatus(422)->assertJson(['error' => 'user.email required']);
        $this->send(array_merge($this->delivery(), ['source' => []]))->assertStatus(422)->assertJson(['error' => 'source.project_id required']);
        $this->assertSame(0, Comment::query()->count());
    }

    public function test_it_fails_closed_on_every_bad_signature_shape(): void
    {
        $body = $this->delivery();

        $this->send($body, secret: 'psk_someone_else')->assertStatus(401)->assertJson(['error' => 'invalid signature']);
        $this->send($body, ['X-Loupe-Hub-Project' => 'prj_other'])->assertStatus(401)->assertJson(['error' => 'delivery is for another project']);
        $this->send($body, ['X-Loupe-Hub-Timestamp' => (string) (time() - 301)])->assertStatus(401)->assertJson(['error' => 'timestamp out of range']);
        $this->send($body, ['X-Loupe-Hub-Timestamp' => 'abc'])->assertStatus(401);
        foreach (['X-Loupe-Hub-Project', 'X-Loupe-Hub-Timestamp', 'X-Loupe-Hub-Signature'] as $h) {
            $this->send($body, [$h => null])->assertStatus(401);
        }
        $this->assertSame(0, Comment::query()->count());
    }

    public function test_it_is_unavailable_when_hub_is_not_configured(): void
    {
        config()->set('loupe.hub.project_secret', '');

        $this->send($this->delivery())->assertStatus(503);
    }

    public function test_it_refuses_an_oversized_body(): void
    {
        $this->send($this->delivery(['body' => str_repeat('x', 6_000_001)]))->assertStatus(413);
    }

    public function test_it_needs_no_session_or_csrf_token(): void
    {
        // The route sits outside the `web` group: no cookie, no X-CSRF-TOKEN, still accepted.
        $this->send($this->delivery())->assertStatus(202);
        $this->assertSame([VerifyHubSignature::class], app('router')->getRoutes()->getByName('loupe.hub.inbound')->gatherMiddleware());
    }

    public function test_it_degrades_when_the_source_column_is_not_migrated(): void
    {
        Schema::table('loupe_comments', fn ($t) => $t->dropColumn(['source', 'forwarded']));
        try {
            $this->send($this->delivery())->assertStatus(202);
            $this->assertSame(1, Comment::query()->count());
        } finally {
            Schema::table('loupe_comments', function ($t) {
                $t->json('source')->nullable();
                $t->json('forwarded')->nullable();
            });
        }
    }
}
