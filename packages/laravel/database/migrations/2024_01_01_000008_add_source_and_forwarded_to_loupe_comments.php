<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cross-project tickets through Loupe Hub.
 *
 * `source` is set on a ticket this app RECEIVED from another project in its
 * organization (which project, which organization, which Hub delivery).
 * `forwarded` is set on a comment this app SENT to Hub (where it went, and
 * whether it arrived). Both nullable and additive: older rows were never routed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loupe_comments', function (Blueprint $table) {
            $table->json('source')->nullable()->after('pr');
            $table->json('forwarded')->nullable()->after('source');
        });
    }

    public function down(): void
    {
        Schema::table('loupe_comments', function (Blueprint $table) {
            $table->dropColumn(['source', 'forwarded']);
        });
    }
};
