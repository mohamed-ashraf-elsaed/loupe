<?php

namespace Loupekit\Loupe\Tests\Feature;

use Loupekit\Loupe\Tests\TestCase;

class MultiGuardTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        // A second, NON-default guard (e.g. an admin area) backed by the same users.
        $app['config']->set('auth.guards.admin', ['driver' => 'session', 'provider' => 'users']);
        $app['config']->set('loupe.guards', ['web', 'admin']);
        $app['config']->set('loupe.authorize.use', fn () => true);
        // Exercise the package auth middleware explicitly (independent of any
        // published config that could shadow the package default).
        $app['config']->set('loupe.middleware.api', ['web', 'loupe.auth']);
    }

    public function test_a_user_on_a_non_default_guard_can_post_without_a_403(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'admin'); // authenticated on the non-default guard only

        $this->postJson('/loupe/v1/comments', $this->payload('g1', $user->id))
            ->assertCreated()
            ->assertJsonPath('author.id', (string) $user->id);

        $this->assertDatabaseHas('loupe_comments', ['id' => 'g1', 'author_id' => (string) $user->id]);
    }

    public function test_it_still_blocks_spoofing_another_users_author_id(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'admin');

        $this->postJson('/loupe/v1/comments', $this->payload('g2', 999999))
            ->assertForbidden()
            ->assertJsonPath('error', 'cannot post as another user');
    }

    public function test_unknown_guard_names_are_skipped(): void
    {
        config()->set('loupe.guards', ['does-not-exist', 'web']);
        $user = $this->makeUser();
        $this->actingAs($user); // default (web) guard

        // The bogus guard is skipped; the web session is accepted.
        $this->getJson('/loupe/v1/comments?projectKey=app')->assertOk();
    }

    public function test_guests_are_rejected_across_all_guards(): void
    {
        $this->getJson('/loupe/v1/comments?projectKey=app')->assertUnauthorized();
    }

    private function payload(string $id, $authorId): array
    {
        return [
            'id' => $id,
            'projectKey' => 'app',
            'url' => '/p',
            'status' => 'open',
            'body' => 'hi',
            'kind' => 'element',
            'author' => ['id' => (string) $authorId, 'name' => 'A'],
            'anchor' => ['testid' => 't', 'cssPath' => 'div'],
            'context' => ['html' => '<div></div>', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ];
    }
}
