<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The pull request carrying a thread's fix, so the panel can show its lifecycle
 * chip and checks meter. Nullable and additive — rows written before this simply
 * have no PR, which is the truth for them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loupe_comments', function (Blueprint $table) {
            $table->json('pr')->nullable()->after('proposal');
        });
    }

    public function down(): void
    {
        Schema::table('loupe_comments', function (Blueprint $table) {
            $table->dropColumn('pr');
        });
    }
};
