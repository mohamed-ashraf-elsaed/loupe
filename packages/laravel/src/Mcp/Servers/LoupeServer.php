<?php

namespace Loupekit\Loupe\Mcp\Servers;

use Laravel\Mcp\Server;
use Loupekit\Loupe\Mcp\Tools\GetComment;
use Loupekit\Loupe\Mcp\Tools\ListComments;
use Loupekit\Loupe\Mcp\Tools\ProposeChange;
use Loupekit\Loupe\Mcp\Tools\UpdateStatus;

/**
 * Exposes the Loupe feedback backlog to Claude Code. Reads the app's own
 * database directly — no HTTP round-trip or admin key.
 *
 * Start with:  php artisan mcp:start loupe
 */
class LoupeServer extends Server
{
    protected string $name = 'Loupe';

    protected string $version = '1.0.0';

    protected string $instructions = 'Read, act on, and triage Loupe visual-feedback comments left by product managers on the running app. Use list_comments to see the backlog, get_comment for the full Claude-ready context of one item (the request, the element HTML, its computed styles, the screenshot as an image, and any screen recording), propose_change to send your rewritten HTML/CSS back to the dev team, and update_status once you have acted on it.';

    protected array $tools = [
        ListComments::class,
        GetComment::class,
        ProposeChange::class,
        UpdateStatus::class,
    ];
}
