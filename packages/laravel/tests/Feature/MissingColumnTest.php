<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Support\Facades\Schema;
use Loupekit\Loupe\Models\Comment;
use Loupekit\Loupe\Tests\TestCase;

/**
 * A host app can upgrade the package before running its migrations.
 *
 * That is not hypothetical: when the `pr` column landed in 0.10.15 the controller
 * wrote it unconditionally, so every create on an un-migrated app raised a
 * QueryException and returned a 500 — the app could not file feedback at all. A
 * package upgrade must degrade, never break the host's writes.
 */
class MissingColumnTest extends TestCase
{
    private function dropPrColumn(): void
    {
        Schema::table('loupe_comments', function ($table) {
            $table->dropColumn('pr');
        });
    }

    protected function tearDown(): void
    {
        // Put the schema back as we found it. Leaving it dropped makes the migration
        // rollback at the end of the run try to drop a column that is already gone.
        if (Schema::hasColumn('loupe_comments', 'pr') === false) {
            Schema::table('loupe_comments', function ($table) {
                $table->json('pr')->nullable();
            });
        }

        parent::tearDown();
    }

    public function test_a_create_still_succeeds_when_a_pending_migration_has_not_run(): void
    {
        $this->dropPrColumn();
        $user = $this->actingAsAllowed();

        $res = $this->postJson('/loupe/v1/comments', [
            'id' => 'pending1',
            'projectKey' => 'app',
            'url' => '/',
            'status' => 'open',
            'body' => 'The page is still usable',
            'kind' => 'free',
            'author' => ['id' => (string) $user->id, 'name' => 'Sara'],
            'anchor' => ['tag' => 'page', 'cssPath' => 'page'],
            'context' => ['html' => '', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ]);

        // The write lands, and the fields that have no column are simply absent.
        $res->assertCreated()->assertJsonPath('body', 'The page is still usable');
        $this->assertSame(1, Comment::query()->count());
        $this->assertArrayNotHasKey('pr', $res->json());
    }

    public function test_a_patch_still_succeeds_when_a_pending_migration_has_not_run(): void
    {
        $user = $this->actingAsAllowed();
        $this->postJson('/loupe/v1/comments', [
            'id' => 'pending2',
            'projectKey' => 'app',
            'url' => '/',
            'body' => 'before',
            'kind' => 'free',
            'author' => ['id' => (string) $user->id, 'name' => 'Sara'],
            'anchor' => ['tag' => 'page', 'cssPath' => 'page'],
            'context' => ['html' => '', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ])->assertCreated();

        $this->dropPrColumn();

        // A patch carrying both a real column and the un-migrated one keeps the real
        // one and drops the other, rather than failing the whole update.
        $this->patchJson('/loupe/v1/comments/pending2', [
            'status' => 'in_review',
            'pr' => ['number' => 412],
        ])->assertOk()->assertJsonPath('status', 'in_review');

        $this->assertSame('in_review', Comment::query()->find('pending2')->status);
    }

    public function test_the_write_path_is_unchanged_once_the_migration_has_run(): void
    {
        $user = $this->actingAsAllowed();
        $pr = ['number' => 412, 'state' => 'open'];

        $this->postJson('/loupe/v1/comments', [
            'id' => 'migrated1',
            'projectKey' => 'app',
            'url' => '/',
            'body' => 'with a PR',
            'kind' => 'free',
            'pr' => $pr,
            'author' => ['id' => (string) $user->id, 'name' => 'Sara'],
            'anchor' => ['tag' => 'page', 'cssPath' => 'page'],
            'context' => ['html' => '', 'styles' => []],
            'offset' => ['x' => 0.5, 'y' => 0.5],
        ])->assertCreated()->assertJsonPath('pr.number', 412);

        $this->assertSame($pr, Comment::query()->find('migrated1')->pr);
    }
}
