<?php

use Loupekit\Loupe\Models\Comment;

return [

    /*
    |--------------------------------------------------------------------------
    | Enabled
    |--------------------------------------------------------------------------
    | Master switch. When false, the @loupeWidget directive renders nothing and
    | the routes are not registered. Handy to disable in specific environments.
    */
    'enabled' => env('LOUPE_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Route path & domain
    |--------------------------------------------------------------------------
    | Everything (the JSON API, the blob endpoint and the dashboard) is nested
    | under this prefix so it never collides with your own routes. The SDK is
    | pointed at url(config('loupe.path')) and appends "/v1/...".
    */
    'path' => env('LOUPE_PATH', 'loupe'),
    'domain' => env('LOUPE_DOMAIN'),

    /*
    |--------------------------------------------------------------------------
    | Asset URL
    |--------------------------------------------------------------------------
    | Base URL that Loupe's OWN published assets (public/vendor/loupe/**) are
    | served from. These files live on the app's own filesystem — never on your
    | CDN — so Loupe resolves them from the app URL, deliberately bypassing
    | Laravel's asset() / ASSET_URL (which would point them at a CDN that doesn't
    | have them, causing 404s and a silently missing widget). Defaults to the app
    | URL. Set this only if you serve public/vendor/loupe from a different origin.
    */
    'asset_url' => env('LOUPE_ASSET_URL'),

    /*
    |--------------------------------------------------------------------------
    | Project key
    |--------------------------------------------------------------------------
    | A single Laravel app is one Loupe "project". Comments are scoped by this
    | key so you can later point several apps at a shared store if you wish.
    */
    'project_key' => env('LOUPE_PROJECT_KEY', 'app'),

    /*
    |--------------------------------------------------------------------------
    | Middleware
    |--------------------------------------------------------------------------
    | The "api" stack protects the JSON API the widget talks to; "dashboard"
    | protects the triage board. Both default to the session guard so identity
    | is the logged-in user. Add Sanctum's stateful middleware here for a
    | cross-subdomain SPA.
    */
    'middleware' => [
        'api' => ['web', 'auth'],
        'dashboard' => ['web', 'auth'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Authorization
    |--------------------------------------------------------------------------
    | Decide WHICH users may use the widget ("use") and see the dashboard
    | ("dashboard"). Two mechanisms, checked in this order:
    |   1. A closure here (takes the authenticated user, returns bool).
    |   2. Otherwise the Gate abilities "loupe:use" / "loupe:admin" defined in
    |      the published App\Providers\LoupeServiceProvider.
    | Leave null to use the Gate abilities.
    */
    'authorize' => [
        'use' => null,
        'dashboard' => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Frictionless local access
    |--------------------------------------------------------------------------
    | When true (default), any authenticated user may use Loupe and open the
    | dashboard in the `local` environment — so a fresh install "just works" in
    | development without configuring gates. In every other environment access
    | is governed by the closures above / the loupe:use & loupe:admin gates.
    | An explicit `authorize` closure (above) always takes precedence, in all
    | environments. Set false to require authorization even locally.
    */
    'allow_in_local' => true,

    /*
    |--------------------------------------------------------------------------
    | Models
    |--------------------------------------------------------------------------
    | The Eloquent model used to persist comments (swap for your own subclass
    | to add relationships/scopes) and the table it lives in.
    */
    'comment_model' => Comment::class,
    'table' => 'loupe_comments',

    /*
    |--------------------------------------------------------------------------
    | User payload
    |--------------------------------------------------------------------------
    | How the @loupeWidget directive describes the current user to the SDK.
    | Provide a closure fn($user): array{id,name,email?} to customize.
    */
    'user_resolver' => null,

    /*
    |--------------------------------------------------------------------------
    | Screenshot storage
    |--------------------------------------------------------------------------
    | Screenshots are stored on this filesystem disk under "blob_path". The
    | default "public" disk serves them directly; a private disk is streamed
    | through the (unguessable-id) blob route instead.
    */
    'disk' => env('LOUPE_DISK', 'public'),
    'blob_path' => 'loupe/screenshots',

];
