<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Triage metadata on every comment: how urgent it is, and which part of the
 * product it touches. Additive and guarded, so it is safe on an existing table.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = config('loupe.table', 'loupe_comments');

        if (! Schema::hasTable($table)) {
            return;
        }

        Schema::table($table, function (Blueprint $t) use ($table) {
            if (! Schema::hasColumn($table, 'priority')) {
                // Unindexed on purpose: SQLite cannot drop an indexed column, and the
                // table is already scoped by (project_key, url).
                $t->string('priority', 16)->default('medium');
            }
            if (! Schema::hasColumn($table, 'change_type')) {
                $t->string('change_type', 16)->default('other');
            }
        });
    }

    public function down(): void
    {
        $table = config('loupe.table', 'loupe_comments');

        if (! Schema::hasTable($table)) {
            return;
        }

        Schema::table($table, function (Blueprint $t) use ($table) {
            foreach (['priority', 'change_type'] as $column) {
                if (Schema::hasColumn($table, $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
