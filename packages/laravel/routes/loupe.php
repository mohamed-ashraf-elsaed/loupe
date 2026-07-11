<?php

use Illuminate\Support\Facades\Route;
use Loupekit\Loupe\Http\Controllers\BlobController;
use Loupekit\Loupe\Http\Controllers\CommentController;
use Loupekit\Loupe\Http\Controllers\DashboardController;

// Screenshots are referenced by <img> and identified by an unguessable UUID, so
// the read route is public (mirrors the reference server; use a private disk +
// signed URLs for stricter setups).
Route::get('v1/blobs/{id}', [BlobController::class, 'show'])->name('loupe.blobs.show');

// The JSON API the widget talks to.
Route::middleware(array_merge(config('loupe.middleware.api', ['web', 'auth']), ['loupe.authorize:use']))
    ->group(function () {
        Route::get('v1/comments', [CommentController::class, 'index'])->name('loupe.comments.index');
        Route::post('v1/comments', [CommentController::class, 'store'])->name('loupe.comments.store');
        Route::patch('v1/comments/{id}', [CommentController::class, 'update'])->name('loupe.comments.update');
        Route::delete('v1/comments/{id}', [CommentController::class, 'destroy'])->name('loupe.comments.destroy');
        Route::post('v1/blobs', [BlobController::class, 'store'])->name('loupe.blobs.store');
    });

// The triage dashboard (human back-office).
Route::middleware(array_merge(config('loupe.middleware.dashboard', ['web', 'auth']), ['loupe.authorize:admin']))
    ->group(function () {
        Route::get('dashboard', [DashboardController::class, 'show'])->name('loupe.dashboard');
    });
