<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create($this->table(), function (Blueprint $table) {
            // Client-generated UUID (the SDK creates it, we upsert by it).
            $table->string('id')->primary();
            $table->string('project_key')->index();
            $table->text('url');
            $table->string('status')->default('open')->index();
            $table->text('body');
            // "element" (anchored to a DOM node) or "region" (a dragged rectangle).
            $table->string('kind')->default('element');
            $table->json('author');
            // Denormalized for cheap ownership / gate checks.
            $table->string('author_id')->nullable()->index();
            $table->json('anchor');
            $table->json('context');
            $table->json('offset');
            // Present only for region comments: the dragged rect in document coords.
            $table->json('region')->nullable();
            $table->text('screenshot_url')->nullable();
            $table->timestamps();

            $table->index(['project_key', 'url']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists($this->table());
    }

    private function table(): string
    {
        return config('loupe.table', 'loupe_comments');
    }
};
