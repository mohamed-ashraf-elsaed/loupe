<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Branch-aware threads: which repository and branch the feedback was filed
 * against. Additive and guarded, so it is safe on an existing table.
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
            // 191 keeps the pair within MySQL's index-length budget if an app
            // later indexes them; they are not indexed here (SQLite cannot drop
            // an indexed column).
            if (! Schema::hasColumn($table, 'repo')) {
                $t->string('repo', 191)->nullable();
            }
            if (! Schema::hasColumn($table, 'branch')) {
                $t->string('branch', 191)->nullable();
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
            foreach (['repo', 'branch'] as $column) {
                if (Schema::hasColumn($table, $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
