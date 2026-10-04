<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Auth;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Models\Message;
use Loupekit\Loupe\Support\People;
use Loupekit\Loupe\Tests\TestCase;

class PeopleTest extends TestCase
{
    public function test_it_lists_allowed_users_and_participants_once_and_never_hub_reporters(): void
    {
        config()->set('loupe.allowed_emails', ['omar@example.com', 'SARA@example.com ']);
        $omar = $this->makeUser(['name' => 'Omar', 'email' => 'omar@example.com']);
        $this->makeUser(['name' => 'Not Listed', 'email' => 'nobody@example.com']);
        $me = $this->actingAsAllowed();
        Comment::query()->create(['id' => 'c1', 'project_key' => 'app', 'url' => '/', 'status' => 'queue', 'body' => 'x',
            'kind' => 'free', 'author' => ['id' => 'p-5', 'name' => 'Past Reporter'], 'anchor' => [], 'context' => [], 'offset' => []]);
        Comment::query()->create(['id' => 'c2', 'project_key' => 'app', 'url' => '/', 'status' => 'queue', 'body' => 'x',
            'kind' => 'free', 'author' => ['id' => 'hub:far@away.test', 'name' => 'Far Away'], 'anchor' => [], 'context' => [], 'offset' => []]);
        (new Message)->forceFill(['comment_id' => 'c1', 'author' => ['id' => 'p-6', 'name' => 'Replier', 'email' => 'r@example.com'], 'body' => 'x'])->save();
        (new Message)->forceFill(['comment_id' => 'c1', 'author' => ['id' => 'hub:x', 'name' => 'Remote'], 'body' => 'x', 'origin' => ['projectId' => 'p']])->save();

        $people = $this->getJson('/loupe/v1/people')->assertOk()->json();

        $this->assertEqualsCanonicalizing([
            ['id' => (string) $omar->id, 'name' => 'Omar', 'email' => 'omar@example.com'],
            ['id' => (string) $me->id, 'name' => 'Sara PM', 'email' => 'sara@example.com'],
            ['id' => 'p-5', 'name' => 'Past Reporter'],
            ['id' => 'p-6', 'name' => 'Replier', 'email' => 'r@example.com'],
        ], $people);
    }

    public function test_an_empty_allow_list_lists_participants_only(): void
    {
        $this->actingAsAllowed();
        $this->assertSame([], $this->getJson('/loupe/v1/people')->assertOk()->json());
    }

    public function test_a_resolver_replaces_the_default_and_its_rows_are_cleaned(): void
    {
        config()->set('loupe.people_resolver', PeopleFixtureResolver::class);
        $this->assertSame([['id' => '1', 'name' => 'One'], ['id' => '2', 'name' => 'two@x.test', 'email' => 'two@x.test']], People::all());

        config()->set('loupe.people_resolver', fn () => [['id' => '3', 'name' => 'Three']]);
        $this->assertSame([['id' => '3', 'name' => 'Three']], People::all());
    }

    public function test_a_guard_without_an_eloquent_provider_or_email_column_lists_nobody(): void
    {
        config()->set('loupe.allowed_emails', ['sara@example.com']);
        $this->makeUser();
        config()->set('loupe.guards', ['missing-guard', 'web']);
        config()->set('auth.providers.users.model', NoEmailUser::class);
        Auth::forgetGuards();

        $this->assertSame([], People::all());
    }
}

class PeopleFixtureResolver
{
    public function __invoke(): array
    {
        return [['id' => '1', 'name' => 'One'], ['id' => '1', 'name' => 'Duplicate'], ['name' => 'no id'], 'junk', ['id' => '2', 'email' => 'two@x.test']];
    }
}

class NoEmailUser extends \Illuminate\Foundation\Auth\User
{
    protected $table = 'loupe_activity';
}
