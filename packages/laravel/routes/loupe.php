<?php

use Illuminate\Support\Facades\Route;
use Loupekit\Loupe\Http\Controllers\ActivityController;
use Loupekit\Loupe\Http\Controllers\BlobController;
use Loupekit\Loupe\Http\Controllers\CommentController;
use Loupekit\Loupe\Http\Controllers\DashboardController;
use Loupekit\Loupe\Http\Controllers\InboundTicketController;
use Loupekit\Loupe\Http\Controllers\NotificationController;
use Loupekit\Loupe\Http\Controllers\OrganizationController;
use Loupekit\Loupe\Http\Controllers\PeopleController;
use Loupekit\Loupe\Http\Controllers\ThreadController;
use Loupekit\Loupe\Http\Middleware\VerifyHubSignature;

// Screenshots are referenced by <img> and identified by an unguessable UUID, so
// the read route is public (mirrors the reference server; use a private disk +
// signed URLs for stricter setups).
Route::get('v1/blobs/{id}', [BlobController::class, 'show'])->name('loupe.blobs.show');

// Tickets Loupe Hub delivers from other projects in the organization. Server to
// server: no session and no CSRF token, authenticated by the Hub signature instead.
Route::post('v1/hub/inbound', InboundTicketController::class)
    ->middleware(VerifyHubSignature::class)
    ->name('loupe.hub.inbound');

// The JSON API the widget talks to.
Route::middleware(array_merge(config('loupe.middleware.api', ['web', 'auth']), ['loupe.authorize:use']))
    ->group(function () {
        Route::get('v1/comments', [CommentController::class, 'index'])->name('loupe.comments.index');
        Route::post('v1/comments', [CommentController::class, 'store'])->name('loupe.comments.store');
        Route::patch('v1/comments/{id}', [CommentController::class, 'update'])->name('loupe.comments.update');
        Route::delete('v1/comments/{id}', [CommentController::class, 'destroy'])->name('loupe.comments.destroy');
        Route::post('v1/blobs', [BlobController::class, 'store'])->name('loupe.blobs.store');
        Route::get('v1/org', OrganizationController::class)->name('loupe.org');
        Route::get('v1/activity', [ActivityController::class, 'index'])->name('loupe.activity.index');
        Route::get('v1/comments/{id}/messages', [ThreadController::class, 'index'])->name('loupe.messages.index');
        Route::post('v1/comments/{id}/messages', [ThreadController::class, 'store'])->name('loupe.messages.store');
        Route::get('v1/comments/{id}/reactions', [ThreadController::class, 'reactions'])->name('loupe.reactions.index');
        Route::post('v1/comments/{id}/messages/{messageId}/reactions', [ThreadController::class, 'toggleReaction'])->name('loupe.reactions.toggle');
        Route::get('v1/people', PeopleController::class)->name('loupe.people');
        Route::get('v1/notifications', [NotificationController::class, 'index'])->name('loupe.notifications.index');
        Route::post('v1/notifications/read', [NotificationController::class, 'read'])->name('loupe.notifications.read');
    });

// The triage dashboard (human back-office).
Route::middleware(array_merge(config('loupe.middleware.dashboard', ['web', 'auth']), ['loupe.authorize:admin']))
    ->group(function () {
        Route::get('dashboard', [DashboardController::class, 'show'])->name('loupe.dashboard');
    });
