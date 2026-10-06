# Loupe documentation

This page lists every Loupe 0.14.1 guide, reference page, and explanation, grouped by what you want to do.

Loupe is an open-source visual feedback tool. A reviewer pins comments to elements of a live web page, and an AI agent can read those comments and propose fixes. Loupe has these parts:

- **Widget (SDK):** the feedback panel a reviewer sees on the page, shipped as `@loupekit/sdk`. You start it with `init()`.
- **Local server:** a Node API, `@loupekit/server`, that stores comments and serves the dashboard on port 8787.
- **Dashboard:** a triage board with one column per stage. The local server serves it at `/dashboard/`.
- **Laravel package:** `loupekit/laravel`, which replaces the local server, dashboard, and MCP server with an implementation inside your Laravel app.
- **MCP server:** `@loupekit/mcp`, which gives an AI agent such as Claude Code access to comments through MCP (Model Context Protocol, the standard that lets an agent call external tools).
- **Browser extension:** loads the widget into any tab without changing the site.
- **Loupe Hub:** an optional, self-hosted service that routes tickets between the apps of one organization and syncs status changes and replies between them.

### Which path do I need?

- A plain HTML page: [embed the widget with a script tag](how-to/embed-script-tag.md).
- A bundled JavaScript app: [install the SDK from npm](how-to/install-npm.md).
- A Laravel app: [install the Laravel package](how-to/laravel-install.md).
- Feedback on a site you cannot change: [use the browser extension](how-to/browser-extension.md).
- Several apps that share tickets: [Loupe Hub](tutorials/hub-two-projects-local.md).
- An AI agent that reads and acts on comments: [connect MCP clients](how-to/connect-mcp-clients.md).

## Start here

Both tutorials need Node.js 24 and a local clone of the repository. Each lists its full requirements under *Before you begin*.

- [Tutorial: pin your first comment and hand it to Claude Code](tutorials/first-comment-local.md): run the local server and demo, pin a comment on a page, and let Claude Code propose a change through MCP.
- [Tutorial: route a ticket between two projects with a local Loupe Hub](tutorials/hub-two-projects-local.md): run Hub on your machine and send a ticket from one project to another.

## How-to guides

- [Embed the widget with a script tag](how-to/embed-script-tag.md): add Loupe to any page without a build step.
- [Install the SDK from npm](how-to/install-npm.md): add `@loupekit/sdk` to a bundled app and call `init()`.
- [Install the Laravel package](how-to/laravel-install.md): add `loupekit/laravel` and render the widget with `@loupeWidget`.
- [Authorize who can use Loupe in Laravel](how-to/laravel-authorize.md): control widget and dashboard access outside `local`.
- [Use the browser extension](how-to/browser-extension.md): load the extension and start Loupe on any tab.
- [Connect Claude Code and other MCP clients](how-to/connect-mcp-clients.md): give an AI agent access to comments through `@loupekit/mcp`.
- [Run the local server and dashboard](how-to/run-local-server.md): start the API, dashboard, and demo on port 8787.
- [Use the widget](how-to/use-the-widget.md): pin, record, reply, and resolve feedback in the panel.
- [Self-host Loupe Hub](how-to/hub-self-host.md): deploy Hub on a server you control.
- [Manage Hub organizations and projects](how-to/hub-manage-projects.md): add members, create projects, and rotate secrets.
- [Connect apps to Hub](how-to/hub-connect-apps.md): send tickets from one app to another through Hub.
- [Receive and verify Loupe Hub webhooks](how-to/verify-hub-webhooks.md): check that a delivery came from your Hub.
- [Upgrade Loupe](how-to/upgrade.md): move to a new version and refresh assets and migrations.

## Reference

- [SDK](reference/sdk.md): `init()` options, public functions, and HTTP calls.
- [Laravel package](LARAVEL.md): config keys, routes, events, migrations, and Artisan commands.
- [MCP server](reference/mcp.md): tools, environment variables, and the local bridge.
- [Local server](reference/server.md): endpoints, environment variables, and integrations.
- [Loupe Hub](reference/hub.md): signed API, environment variables, and dashboard routes.
- [Browser extension](reference/extension.md): permissions, context menus, and stored settings.
- [Shared types](reference/shared.md): types, constants, and helpers in `@loupekit/shared`.

## Explanation

- [Architecture](ARCHITECTURE.md): how the packages fit together and where data flows.
- [How Loupe Hub works](explanation/hub.md): organizations, routing, and two-way sync.
- [Authentication and privacy](explanation/auth-and-privacy.md): identity checks, signatures, and what leaves the page.

## Help

- [Troubleshooting](troubleshooting.md): symptoms, causes, and fixes for every integration.

## By integration

| Integration | Get started | Reference | Troubleshoot |
|---|---|---|---|
| Script tag | [Embed with a script tag](how-to/embed-script-tag.md) | [SDK](reference/sdk.md) | [Script tag](troubleshooting.md#script-tag) |
| npm | [Install from npm](how-to/install-npm.md) | [SDK](reference/sdk.md) | [npm](troubleshooting.md#npm) |
| Laravel | [Install the Laravel package](how-to/laravel-install.md) | [Laravel package](LARAVEL.md) | [Laravel](troubleshooting.md#laravel) |
| Extension | [Use the browser extension](how-to/browser-extension.md) | [Browser extension](reference/extension.md) | [Extension](troubleshooting.md#extension) |
| MCP | [Connect Claude Code and other MCP clients](how-to/connect-mcp-clients.md) | [MCP server](reference/mcp.md) | [MCP](troubleshooting.md#mcp) |
| Local server and dashboard | [Run the local server and dashboard](how-to/run-local-server.md) | [Local server](reference/server.md) | [Local server](troubleshooting.md#local-server) |
| Hub | [Tutorial: two projects with a local Hub](tutorials/hub-two-projects-local.md) | [Loupe Hub](reference/hub.md) | [Hub](troubleshooting.md#hub) |

After you embed Loupe in any of these ways, see [Use the Loupe widget](how-to/use-the-widget.md) to pin, record, reply, and resolve feedback.

The dashboard has no separate setup. The local server redirects `/` to `/dashboard/`; see [Run the local server and dashboard](how-to/run-local-server.md) and the [Local server reference](reference/server.md). For Hub, after the tutorial, see [Self-host Loupe Hub](how-to/hub-self-host.md), [Manage organizations and projects in Loupe Hub](how-to/hub-manage-projects.md), [Route tickets between apps with Loupe Hub](how-to/hub-connect-apps.md), and [Receive and verify Loupe Hub webhooks](how-to/verify-hub-webhooks.md).

## Project

- [Contributing](../CONTRIBUTING.md): set up the repository and open a pull request.
- [Testing](TESTING.md): run the test suites and read what each one covers.
- [Releasing](../RELEASING.md): version, tag, and publish a release.
- [Changelog](../CHANGELOG.md): what changed in each version.
- [Privacy policy](https://mohamed-ashraf-elsaed.github.io/loupe/privacy.html): what the browser extension and the SDK collect, and where it goes.
