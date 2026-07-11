<?php

use Laravel\Mcp\Facades\Mcp;
use Loupekit\Loupe\Mcp\Servers\LoupeServer;

// Registers the local (stdio) MCP server. Start it with:
//   php artisan mcp:start loupe
// then add it to Claude Code. Only loaded when laravel/mcp is installed.
Mcp::local('loupe', LoupeServer::class);
