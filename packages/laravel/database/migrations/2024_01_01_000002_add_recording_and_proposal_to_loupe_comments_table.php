<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            if (! Schema::hasColumn($this->table(), 'recording_url')) {
                // A screen recording of the region (webm), stored like a screenshot.
                $table->text('recording_url')->nullable()->after('screenshot_url');
            }
            if (! Schema::hasColumn($this->table(), 'proposal')) {
                // Claude's proposed UI change, written back via MCP (see @loupekit/shared Proposal).
                $table->json('proposal')->nullable()->after('recording_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            foreach (['proposal', 'recording_url'] as $column) {
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
