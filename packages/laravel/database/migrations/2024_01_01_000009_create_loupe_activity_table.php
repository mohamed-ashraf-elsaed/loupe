<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The widget's Activity feed, kept on the server so it works without a bridge:
 * comment changes and Hub forwarding results are written here as they happen,
 * and pruned after config('loupe.activity.retention_days').
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loupe_activity', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('project_key', 191)->index();
            $table->string('kind', 64);
            $table->string('label', 255);
            $table->text('detail')->nullable();
            $table->string('level', 8)->default('info');
            $table->string('comment_id')->nullable()->index();
            $table->json('actor')->nullable();
            $table->timestamp('created_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loupe_activity');
    }
};
