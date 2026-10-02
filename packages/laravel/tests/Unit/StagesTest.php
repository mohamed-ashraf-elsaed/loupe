<?php

namespace Loupekit\Loupe\Tests\Unit;

use Loupekit\Loupe\Support\Stages;
use Loupekit\Loupe\Tests\TestCase;

class StagesTest extends TestCase
{
    public function test_order_and_labels_cover_every_stage(): void
    {
        $this->assertSame(['queue', 'todo', 'in_progress', 'in_review', 'resolved'], Stages::ORDER);

        foreach (Stages::ORDER as $stage) {
            $this->assertArrayHasKey($stage, Stages::LABELS);
            $this->assertNotSame('', Stages::LABELS[$stage]);
        }
    }

    public function test_normalize_passes_a_current_stage_through(): void
    {
        foreach (Stages::ORDER as $stage) {
            $this->assertSame($stage, Stages::normalize($stage));
        }
    }

    public function test_normalize_maps_the_legacy_statuses(): void
    {
        $this->assertSame('queue', Stages::normalize('open'));
        $this->assertSame('in_progress', Stages::normalize('in_progress'));
        $this->assertSame('resolved', Stages::normalize('done'));
    }

    public function test_normalize_falls_back_to_the_untriaged_queue(): void
    {
        $this->assertSame('queue', Stages::normalize('bogus'));
        $this->assertSame('queue', Stages::normalize(''));
        $this->assertSame('queue', Stages::normalize(null));
        $this->assertSame('queue', Stages::normalize(42));
    }

    public function test_is_open_covers_everything_but_resolved(): void
    {
        $this->assertTrue(Stages::isOpen('queue'));
        $this->assertTrue(Stages::isOpen('in_review'));
        $this->assertFalse(Stages::isOpen('resolved'));
    }

    public function test_with_legacy_includes_the_alias_that_maps_to_the_stage(): void
    {
        // `open` predates the board and maps to Queue, so a filter has to match both
        // or it would miss rows written before the migration ran.
        $this->assertSame(['queue', 'open'], Stages::withLegacy('queue'));
        $this->assertSame(['resolved', 'done'], Stages::withLegacy('resolved'));
        $this->assertSame(['todo'], Stages::withLegacy('todo'));
        // in_progress maps to itself, so the alias must not be duplicated.
        $this->assertSame(['in_progress'], Stages::withLegacy('in_progress'));
    }
}
