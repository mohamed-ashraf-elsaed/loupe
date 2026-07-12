<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Contracts\View\View;
use Loupekit\Loupe\Support\Url;

/**
 * Serves the Loupe triage board (the vanilla-JS Kanban, vendored from
 * @loupekit/dashboard). Config is injected server-side via window.__LOUPE__ so
 * no secret ever reaches the browser.
 */
class DashboardController extends Controller
{
    public function show(): View
    {
        return view('loupe::dashboard', [
            'api' => url(config('loupe.path', 'loupe')),
            'project' => config('loupe.project_key', 'app'),
            // App-origin asset URL (bypasses ASSET_URL/CDN — see Url::asset()).
            'appSrc' => Url::asset('vendor/loupe/dashboard/app.js'),
        ]);
    }
}
