<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Event;
use Loupekit\Loupe\Events\MessageAdded;
use Loupekit\Loupe\Models\Activity;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Models\Notification;
use Loupekit\Loupe\Tests\TestCase;

class ThreadTest extends TestCase
{
    private function comment(string $id = 'c1', array $author = ['id' => '99', 'name' => 'Reporter'], string $title = 'Pay button'): Comment
    {
        return Comment::query()->create([
            'id' => $id, 'project_key' => 'app', 'url' => '/', 'status' => 'queue', 'title' => $title,
            'body' => 'It overlaps', 'kind' => 'element', 'author' => $author, 'author_id' => $author['id'],
            'anchor' => [], 'context' => [], 'offset' => ['x' => 0.5, 'y' => 0.5],
        ]);
    }

    public function test_the_thread_routes_need_a_user_who_may_use_loupe(): void
    {
        $this->getJson('/loupe/v1/comments/c1/messages')->assertUnauthorized();
        $this->actingAs($this->makeUser());
        $this->getJson('/loupe/v1/comments/c1/messages')->assertForbidden();
    }

    public function test_a_reply_is_stored_as_the_signed_in_user_and_listed_oldest_first(): void
    {
        $me = $this->actingAsAllowed();
        $this->comment();
        Event::fake([MessageAdded::class]);

        $first = $this->postJson('/loupe/v1/comments/c1/messages', [
            'author' => ['id' => 'someone-else', 'name' => 'Spoof'],
            'body' => 'Looking now',
            'attachments' => [['url' => '/loupe/v1/blobs/a.png', 'kind' => 'image']],
        ])->assertCreated()->json();

        $this->assertSame(['id' => (string) $me->id, 'name' => 'Sara PM', 'email' => 'sara@example.com', 'type' => 'user'], $first['author']);
        $this->assertSame('c1', $first['threadId']);
        $this->assertSame([['url' => '/loupe/v1/blobs/a.png', 'kind' => 'image']], $first['attachments']);
        $this->assertSame([], $first['mentions']);
        $this->assertSame([], $first['unknownMentions']);
        Event::assertDispatched(MessageAdded::class, fn (MessageAdded $e) => $e->message->id === $first['id'] && $e->comment->getKey() === 'c1');

        $this->postJson('/loupe/v1/comments/c1/messages', ['body' => 'Fixed', 'attachments' => []])->assertCreated();
        $list = $this->getJson('/loupe/v1/comments/c1/messages')->assertOk()->json();
        $this->assertSame(['Looking now', 'Fixed'], array_column($list, 'body'));
        $this->assertArrayNotHasKey('attachments', $list[1]);

        $this->assertSame('Sara PM replied on “Pay button”', Activity::query()->where('kind', 'comment.reply')->first()->label);
    }

    public function test_deleted_replies_are_hidden_unless_asked_for(): void
    {
        $this->actingAsAllowed();
        $this->comment();
        $id = $this->postJson('/loupe/v1/comments/c1/messages', ['body' => 'oops'])->json('id');
        Message::query()->whereKey($id)->update(['deleted_at' => now()]);

        $this->assertSame([], $this->getJson('/loupe/v1/comments/c1/messages')->json());
        $all = $this->getJson('/loupe/v1/comments/c1/messages?includeDeleted=1')->json();
        $this->assertArrayHasKey('deletedAt', $all[0]);
    }

    public function test_a_reply_notifies_who_it_mentions_and_the_reporter_once_and_reports_unknown_handles(): void
    {
        config()->set('loupe.allowed_emails', ['omar@example.com']);
        $omar = $this->makeUser(['name' => 'Omar Ali', 'email' => 'omar@example.com']);
        $me = $this->actingAsAllowed();
        $this->comment('c1', ['id' => (string) $omar->id, 'name' => 'Omar Ali']);

        $res = $this->postJson('/loupe/v1/comments/c1/messages', ['body' => '@omar please check, @ghost too, and @sara'])->assertCreated();

        $this->assertSame([(string) $omar->id, (string) $me->id], $res->json('mentions'));
        $this->assertSame(['ghost'], $res->json('unknownMentions'));
        // Omar is mentioned AND the reporter: one notification. The author mentioning herself: none.
        $n = Notification::query()->sole();
        $this->assertSame([(string) $omar->id, 'mention', 'Sara PM mentioned you on “Pay button”'], [$n->recipient_id, $n->kind, $n->body]);
    }

    public function test_the_reporter_hears_about_a_reply_without_a_mention_but_not_about_their_own(): void
    {
        $me = $this->actingAsAllowed();
        $this->comment('c1', ['id' => '42', 'name' => 'Reporter'], '');
        $this->comment('c2', ['id' => (string) $me->id, 'name' => 'Sara PM']);

        $this->postJson('/loupe/v1/comments/c1/messages', ['body' => 'on it'])->assertCreated();
        $this->postJson('/loupe/v1/comments/c2/messages', ['body' => 'note to self'])->assertCreated();

        $n = Notification::query()->sole();
        $this->assertSame(['42', 'reply', 'Sara PM replied on “It overlaps”'], [$n->recipient_id, $n->kind, $n->body]);
    }

    public function test_it_validates_replies(): void
    {
        $this->actingAsAllowed();
        $this->postJson('/loupe/v1/comments/missing/messages', ['body' => 'x'])->assertNotFound();
        $this->getJson('/loupe/v1/comments/missing/messages')->assertNotFound();
        $this->comment();
        $this->postJson('/loupe/v1/comments/c1/messages', ['body' => '  '])->assertStatus(422);
        $this->postJson('/loupe/v1/comments/c1/messages', [])->assertStatus(422);
        $this->assertSame(0, Message::query()->count());
    }

    public function test_reactions_toggle_per_user_on_replies_and_on_the_comment_itself(): void
    {
        $me = $this->actingAsAllowed();
        $this->comment();
        $mid = $this->postJson('/loupe/v1/comments/c1/messages', ['body' => 'hi'])->json('id');

        $this->postJson("/loupe/v1/comments/c1/messages/$mid/reactions", ['emoji' => '👍', 'userId' => 'spoof'])
            ->assertOk()->assertExactJson(['reactions' => [['messageId' => $mid, 'emoji' => '👍', 'userId' => (string) $me->id, 'userName' => 'Sara PM']]]);
        $this->postJson('/loupe/v1/comments/c1/messages/c1/reactions', ['emoji' => '🎉'])->assertOk();
        $this->assertCount(2, $this->getJson('/loupe/v1/comments/c1/reactions')->assertOk()->json('reactions'));

        // Toggling the same emoji again removes it.
        $this->postJson("/loupe/v1/comments/c1/messages/$mid/reactions", ['emoji' => '👍'])->assertOk();
        $this->assertSame(['🎉'], array_column($this->getJson('/loupe/v1/comments/c1/reactions')->json('reactions'), 'emoji'));
    }

    public function test_reactions_validate_their_target_and_emoji(): void
    {
        $this->actingAsAllowed();
        $this->getJson('/loupe/v1/comments/missing/reactions')->assertNotFound();
        $this->postJson('/loupe/v1/comments/missing/messages/x/reactions', ['emoji' => '👍'])->assertNotFound();
        $this->comment();
        $this->postJson('/loupe/v1/comments/c1/messages/not-a-message/reactions', ['emoji' => '👍'])->assertNotFound();
        $this->postJson('/loupe/v1/comments/c1/messages/c1/reactions', ['emoji' => ''])->assertStatus(422);
        $this->postJson('/loupe/v1/comments/c1/messages/c1/reactions', ['emoji' => str_repeat('a', 17)])->assertStatus(422);
    }

    public function test_a_reaction_without_a_name_has_no_user_name(): void
    {
        config()->set('loupe.user_resolver', fn ($u) => ['id' => 'x1', 'name' => null]);
        $this->actingAsAllowed();
        $this->comment();

        $this->postJson('/loupe/v1/comments/c1/messages/c1/reactions', ['emoji' => '👀'])
            ->assertExactJson(['reactions' => [['messageId' => 'c1', 'emoji' => '👀', 'userId' => 'x1']]]);
    }
}
