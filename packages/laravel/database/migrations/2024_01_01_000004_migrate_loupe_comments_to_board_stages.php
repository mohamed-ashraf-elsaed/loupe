<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Five-stage board: rows written before it kept the old three-value status.
 * Idempotent — after the first run there is nothing left to rewrite
 * (`in_progress` is unchanged, so it needs no statement).
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = config('loupe.table', 'loupe_comments');

        if (! Schema::hasTable($table)) {
            return;
        }

        DB::table($table)->where('status', 'open')->update(['status' => 'queue']);
        DB::table($table)->where('status', 'done')->update(['status' => 'resolved']);
    }

    public function down(): void
    {
        // Not reversible on purpose: `open` and `done` cannot be recovered once
        // rows have been placed on the board.
    }
};
