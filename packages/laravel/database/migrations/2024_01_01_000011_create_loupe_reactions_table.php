<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Emoji reactions on thread messages. One row per message, emoji and user. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('loupe_reactions')) {
            return;
        }

        Schema::create('loupe_reactions', function (Blueprint $table) {
            $table->id();
            $table->string('comment_id', 191)->index();
            $table->string('message_id', 191);
            $table->string('emoji', 32);
            $table->string('user_id', 191);
            $table->string('user_name', 255)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->unique(['message_id', 'emoji', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loupe_reactions');
    }
};
