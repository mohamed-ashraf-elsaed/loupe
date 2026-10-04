<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Carbon;
use Loupekit\Loupe\Support\Inbox;
use Loupekit\Loupe\Tests\TestCase;

class NotificationApiTest extends TestCase
{
    public function test_the_inbox_is_the_signed_in_users_own_whatever_recipient_is_asked_for(): void
    {
        $me = $this->actingAsAllowed();
        Carbon::setTestNow('2026-10-05 10:00:00');
        Inbox::notify((string) $me->id, 'c1', 'mention', 'Omar mentioned you', 'Omar');
        Carbon::setTestNow('2026-10-05 11:00:00');
        Inbox::notify((string) $me->id, 'c2', 'reply', 'A reply');
        Inbox::notify('someone-else', 'c1', 'mention', 'Not yours');
        Carbon::setTestNow();

        $list = $this->getJson('/loupe/v1/notifications?recipient=someone-else')->assertOk()->json('notifications');

        $this->assertSame(['A reply', 'Omar mentioned you'], array_column($list, 'body'));
        $this->assertSame('Omar', $list[1]['actorName']);
        $this->assertArrayNotHasKey('actorName', $list[0]);
        $this->assertArrayNotHasKey('readAt', $list[0]);
    }

    public function test_it_marks_one_or_all_read_and_never_another_users(): void
    {
        $me = $this->actingAsAllowed();
        $a = Inbox::notify((string) $me->id, 'c1', 'mention', 'one');
        Inbox::notify((string) $me->id, 'c2', 'mention', 'two');
        $theirs = Inbox::notify('other', 'c1', 'mention', 'theirs');

        $this->postJson('/loupe/v1/notifications/read', ['id' => $a->id])->assertExactJson(['read' => 1]);
        $this->assertArrayHasKey('readAt', $this->getJson('/loupe/v1/notifications')->json('notifications.1'));
        $this->postJson('/loupe/v1/notifications/read', ['recipient' => 'other'])->assertExactJson(['read' => 1]);
        $this->assertNull($theirs->fresh()->read_at);
    }

    public function test_hub_reporters_and_missing_tables_get_no_inbox(): void
    {
        $this->assertNull(Inbox::notify('hub:far@away.test', 'c1', 'reply', 'x'));
        $this->assertNull(Inbox::notify('', 'c1', 'reply', 'x'));
        \Illuminate\Support\Facades\Schema::drop('loupe_notifications');
        $this->assertNull(Inbox::notify('7', 'c1', 'reply', 'x'));
    }
}
