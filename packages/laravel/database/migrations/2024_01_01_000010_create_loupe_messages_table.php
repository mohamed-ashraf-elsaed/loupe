<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replies on a comment thread. The comment's own body is message #1 and is not
 * stored here. A reply that arrived from another project through Loupe Hub keeps
 * that project in `origin`, so it is shown as such and never sent back.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('loupe_messages')) {
            return;
        }

        Schema::create('loupe_messages', function (Blueprint $table) {
            $table->string('id', 191)->primary();
            $table->string('comment_id', 191)->index();
            $table->json('author');
            $table->text('body');
            $table->json('attachments')->nullable();
            $table->json('origin')->nullable();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loupe_messages');
    }
};
