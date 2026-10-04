<?php

namespace Loupekit\Loupe\Tests\Unit;

use Loupekit\Loupe\Support\Mentions;
use PHPUnit\Framework\TestCase;

class MentionsTest extends TestCase
{
    public function test_it_parses_handles_like_the_shared_package(): void
    {
        $this->assertSame([], Mentions::parse(''));
        $this->assertSame(['sara', 'jane.doe'], Mentions::parse('@sara, can (@jane.doe) look? @Sara again'));
        // An email is not a mention; neither is a handle in code.
        $this->assertSame([], Mentions::parse('mail sara@acme.test or `@sara` or ```@sara```'));
        $this->assertSame(['ok'], Mentions::parse("```\n@fenced `@x`\n``` @ok"));
        // Trailing punctuation is not part of the handle, and a bare @ is nothing.
        $this->assertSame(['sara'], Mentions::parse('@sara. @ @- @...'));
    }

    public function test_it_resolves_by_name_first_name_email_and_id_and_reports_unknowns(): void
    {
        $people = [
            ['id' => '7', 'name' => 'Sara Pm', 'email' => 'sara.p@acme.test'],
            ['id' => 'u-9', 'name' => 'Omar'],
        ];

        $r = Mentions::resolve('@sara @SaraPm @sara.p @u-9 @ghost', $people);

        $this->assertSame(['7', 'u-9'], array_column($r['resolved'], 'id'));
        $this->assertSame(['ghost'], $r['unknown']);
    }
}
