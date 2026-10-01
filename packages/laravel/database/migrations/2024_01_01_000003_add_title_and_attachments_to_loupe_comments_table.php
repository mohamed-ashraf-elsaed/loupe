<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            if (! Schema::hasColumn($this->table(), 'title')) {
                // One-line summary of the issue (falls back to the first line of `body`).
                $table->string('title')->nullable()->after('body');
            }
            if (! Schema::hasColumn($this->table(), 'attachments')) {
                // Files the reporter attached — a JSON array of @loupekit/shared Attachments.
                $table->json('attachments')->nullable()->after('recording_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            foreach (['attachments', 'title'] as $column) {
                if (Schema::hasColumn($this->table(), $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function table(): string
    {
        return config('loupe.table', 'loupe_comments');
    }
};
