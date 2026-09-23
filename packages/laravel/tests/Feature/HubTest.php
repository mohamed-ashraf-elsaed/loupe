<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Loupekit\Loupe\Jobs\SendToHub;
use Loupekit\Loupe\Support\Hub;
use Loupekit\Loupe\Tests\TestCase;
use RuntimeException;

class HubTest extends TestCase
{
    private const SECRET = 'psk_test_secret';

    private function enableHub(): void
    {
        config()->set('loupe.hub.url', 'https://hub.test/');
        config()->set('loupe.hub.project_id', 'prj_123');
        config()->set('loupe.hub.project_secret', self::SECRET);
    }

    private function payload(string $id, int|string $userId, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'projectKey' => 'app',
            'url' => '/checkout',
            'status' => 'open',
            'body' => 'The button is misaligned',
            'author' => ['id' => (string) $userId, 'name' => 'Sara PM'],
            'anchor' => ['tag' => 'button'],
            'context' => ['html' => '<button>Pay</button>', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ], $overrides);
    }

    public function test_it_is_off_unless_all_three_keys_are_set(): void
    {
        $this->assertFalse(Hub::enabled());

        foreach (['url', 'project_id', 'project_secret'] as $missing) {
            $this->enableHub();
            config()->set("loupe.hub.$missing", '');
            $this->assertFalse(Hub::enabled(), "enabled without $missing");
        }

        $this->enableHub();
        $this->assertTrue(Hub::enabled());
    }

    public function test_config_reads_the_documented_env_keys(): void
    {
        $config = require __DIR__.'/../../config/loupe.php';

        $this->assertSame(['url', 'project_id', 'project_secret'], array_keys($config['hub']));
        $source = file_get_contents(__DIR__.'/../../config/loupe.php');
        foreach (['LOUPE_HUB_URL', 'LOUPE_PROJECT_ID', 'LOUPE_PROJECT_SECRET'] as $env) {
            $this->assertStringContainsString("env('$env')", $source);
        }
    }

    public function test_nothing_is_sent_when_disabled(): void
    {
        Http::fake();
        Bus::fake();
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();

        Bus::assertNothingDispatched();
        Http::assertNothingSent();
    }

    public function test_a_new_comment_is_signed_and_sent_to_hub_after_the_response(): void
    {
        $this->enableHub();
        Http::fake(['hub.test/*' => Http::response(['id' => 'dlv_1', 'delivery' => 'ok'], 202)]);
        $user = $this->actingAsAllowed(['name' => 'Sara PM', 'email' => 'sara@acme.com']);

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();

        // Sync queue: sent from a terminating callback, i.e. after the response.
        Http::assertSentCount(1);
        Http::assertSent(function (Request $request) {
            $timestamp = $request->header('X-Loupe-Timestamp')[0];
            $body = $request->body();
            $data = json_decode($body, true);

            return $request->url() === 'https://hub.test/v1/issues'
                && $request->method() === 'POST'
                && $request->header('Content-Type')[0] === 'application/json'
                && $request->header('X-Loupe-Project')[0] === 'prj_123'
                && abs(time() - (int) $timestamp) < 5
                && hash_equals(hash_hmac('sha256', $timestamp.'.'.$body, self::SECRET), $request->header('X-Loupe-Signature')[0])
                && $data['user'] === ['email' => 'sara@acme.com', 'name' => 'Sara PM']
                && $data['issue']['id'] === 'c1'
                && $data['issue']['projectKey'] === 'app'
                && $data['issue']['body'] === 'The button is misaligned'
                && $data['issue']['url'] === '/checkout';
        });
    }

    public function test_edits_of_an_existing_comment_are_not_resent(): void
    {
        $this->enableHub();
        Bus::fake();
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();
        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id, ['body' => 'edited']))->assertCreated();

        Bus::assertDispatchedAfterResponseTimes(SendToHub::class, 1);
    }

    public function test_it_queues_the_job_on_a_real_queue(): void
    {
        $this->enableHub();
        config()->set('queue.default', 'database');
        Bus::fake();
        $user = $this->actingAsAllowed(['email' => 'sara@acme.com']);

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();

        Bus::assertDispatched(SendToHub::class, fn (SendToHub $job) => $job->user === ['email' => 'sara@acme.com', 'name' => 'Sara PM']
            && $job->issue['id'] === 'c1');
        Bus::assertNotDispatchedAfterResponse(SendToHub::class);
    }

    public function test_it_falls_back_to_after_response_when_the_queue_is_down(): void
    {
        $this->enableHub();
        config()->set('queue.default', 'redis');
        Log::spy();
        Bus::shouldReceive('dispatch')->once()->andThrow(new RuntimeException('Connection refused'));
        Bus::shouldReceive('dispatchAfterResponse')->once()->with(\Mockery::type(SendToHub::class));

        Hub::forward(['email' => 'sara@acme.com', 'name' => ''], ['id' => 'c1']);

        Log::shouldHaveReceived('warning')->withArgs(fn ($m, $ctx) => str_contains($m, 'could not queue') && $ctx['error'] === 'Connection refused');
    }

    public function test_it_skips_users_without_an_email(): void
    {
        $this->enableHub();
        Bus::fake();
        Log::spy();
        $user = $this->actingAsAllowed(['email' => null]);

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();

        Bus::assertNothingDispatched();
        Log::shouldHaveReceived('warning')->withArgs(fn ($m) => str_contains($m, 'has no email'));
    }

    public function test_forward_is_a_no_op_when_disabled(): void
    {
        Bus::fake();

        Hub::forward(['email' => 'a@b.co'], ['id' => 'c1']);

        Bus::assertNothingDispatched();
    }

    public function test_a_hub_rejection_is_logged_and_never_breaks_comment_creation(): void
    {
        $this->enableHub();
        Log::spy();
        Http::fake(['hub.test/*' => Http::response(['error' => 'user not in organization'], 403)]);
        $user = $this->actingAsAllowed();

        $this->postJson('/loupe/v1/comments', $this->payload('c1', $user->id))->assertCreated();

        $this->assertDatabaseHas('loupe_comments', ['id' => 'c1']);
        Log::shouldHaveReceived('warning')->withArgs(fn ($m, $ctx) => $m === '[loupe] Hub rejected comment'
            && $ctx === ['comment' => 'c1', 'status' => 403, 'error' => 'user not in organization']);
    }

    public function test_a_failed_webhook_delivery_is_logged(): void
    {
        $this->enableHub();
        Log::spy();
        Http::fake(['hub.test/*' => Http::response(['id' => 'dlv_9', 'delivery' => 'failed'], 202)]);

        (new SendToHub(['email' => 'a@b.co'], ['id' => 'c1']))->handle();

        Log::shouldHaveReceived('warning')->withArgs(fn ($m, $ctx) => str_contains($m, 'webhook delivery failed') && $ctx['delivery'] === 'dlv_9');
    }

    public function test_a_successful_delivery_logs_nothing(): void
    {
        $this->enableHub();
        Log::spy();
        Http::fake(['hub.test/*' => Http::response(['id' => 'dlv_1', 'delivery' => 'ok'], 202)]);

        (new SendToHub(['email' => 'a@b.co'], ['id' => 'c1']))->handle();

        Log::shouldNotHaveReceived('warning');
    }

    public function test_a_network_error_is_logged_and_swallowed(): void
    {
        $this->enableHub();
        Log::spy();
        Http::fake(fn () => throw new ConnectionException('cURL error 7: Failed to connect'));

        (new SendToHub(['email' => 'a@b.co'], ['id' => 'c1']))->handle();

        Log::shouldHaveReceived('warning')->withArgs(fn ($m, $ctx) => $m === '[loupe] could not send comment to Hub'
            && str_contains($ctx['error'], 'Failed to connect'));
    }

    public function test_the_job_is_not_retried_and_waits_long_enough_for_hub_retries(): void
    {
        $job = new SendToHub(['email' => 'a@b.co'], ['id' => 'c1']);

        $this->assertSame(1, $job->tries);
        $this->assertGreaterThan(35, SendToHub::TIMEOUT_SECONDS);
    }
}
