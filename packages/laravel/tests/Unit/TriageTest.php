<?php

namespace Loupekit\Loupe\Tests\Unit;

use Loupekit\Loupe\Support\Triage;
use Loupekit\Loupe\Tests\TestCase;

class TriageTest extends TestCase
{
    public function test_priorities_are_ordered_most_urgent_first_with_labels(): void
    {
        $this->assertSame(['critical', 'high', 'medium', 'low'], Triage::PRIORITIES);

        foreach (Triage::PRIORITIES as $p) {
            $this->assertArrayHasKey($p, Triage::PRIORITY_LABELS);
            $this->assertNotSame('', Triage::PRIORITY_LABELS[$p]);
        }
    }

    public function test_every_change_type_has_a_label(): void
    {
        $this->assertSame(['frontend', 'backend', 'api', 'other'], Triage::TYPES);

        foreach (Triage::TYPES as $t) {
            $this->assertArrayHasKey($t, Triage::TYPE_LABELS);
        }
    }

    public function test_normalize_passes_a_known_value_through(): void
    {
        foreach (Triage::PRIORITIES as $p) {
            $this->assertSame($p, Triage::normalizePriority($p));
        }
        foreach (Triage::TYPES as $t) {
            $this->assertSame($t, Triage::normalizeType($t));
        }
    }

    public function test_normalize_falls_back_to_the_default(): void
    {
        // A row written before triage metadata has neither column.
        $this->assertSame('medium', Triage::normalizePriority(null));
        $this->assertSame('medium', Triage::normalizePriority('urgent'));
        $this->assertSame('medium', Triage::normalizePriority(7));

        $this->assertSame('other', Triage::normalizeType(null));
        $this->assertSame('other', Triage::normalizeType('css'));
    }
}
