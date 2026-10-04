<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The widget's in-app inbox: a mention of you, or a reply on your ticket.
 * `recipient_id` is the id describeUser() gives that user.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('loupe_notifications')) {
            return;
        }

        Schema::create('loupe_notifications', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('project_key', 191);
            $table->string('recipient_id', 191);
            $table->string('comment_id', 191)->index();
            $table->string('kind', 32);
            $table->string('body', 500);
            $table->string('actor_name', 255)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['project_key', 'recipient_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loupe_notifications');
    }
};
