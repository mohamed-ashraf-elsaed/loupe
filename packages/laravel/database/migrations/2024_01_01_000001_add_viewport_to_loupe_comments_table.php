<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            if (! Schema::hasColumn($this->table(), 'viewport')) {
                // The viewport the feedback was captured on → desktop / tablet / mobile.
                $table->json('viewport')->nullable()->after('region');
            }
        });
    }

    public function down(): void
    {
        Schema::table($this->table(), function (Blueprint $table) {
            if (Schema::hasColumn($this->table(), 'viewport')) {
                $table->dropColumn('viewport');
            }
        });
    }

    private function table(): string
    {
        return config('loupe.table', 'loupe_comments');
    }
};
