<?php

/**
 * Fail the build unless line coverage meets a threshold.
 *
 * Usage: php bin/check-coverage.php build/clover.xml 100
 */

[$_, $clover, $min] = $argv + [null, 'build/clover.xml', '100'];
$min = (float) $min;

if (! is_file($clover)) {
    fwrite(STDERR, "Coverage file not found: {$clover}\n");
    exit(1);
}

$xml = simplexml_load_file($clover);
$metrics = $xml->project->metrics ?? null;

if ($metrics === null) {
    fwrite(STDERR, "No metrics in {$clover}\n");
    exit(1);
}

$statements = (int) $metrics['statements'];
$covered = (int) $metrics['coveredstatements'];
$percent = $statements > 0 ? ($covered / $statements) * 100 : 100.0;

printf("Line coverage: %.2f%% (%d/%d)\n", $percent, $covered, $statements);

if ($percent + 1e-9 < $min) {
    fwrite(STDERR, sprintf("Coverage %.2f%% is below the required %.2f%%\n", $percent, $min));
    exit(1);
}

echo "Coverage threshold met.\n";
