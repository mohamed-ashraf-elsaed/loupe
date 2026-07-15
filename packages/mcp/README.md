<div align="center">

<a href="https://mohamed-ashraf-elsaed.github.io/loupe/">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/promo-marquee-1400x560.jpg" alt="Loupe — Pin feedback to the live UI. Hand it to Claude." width="100%" />
</a>

<h1>@loupekit/mcp</h1>

<p><strong>The Model Context Protocol server that hands Loupe comments to Claude Code</strong><br />
as an actionable, fully-contextualized backlog — request + element HTML + styles + screenshot.</p>

<p>
  <a href="https://www.npmjs.com/package/@loupekit/mcp"><img src="https://img.shields.io/npm/v/@loupekit/mcp?color=4a55d6&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@loupekit/mcp"><img src="https://img.shields.io/npm/dm/@loupekit/mcp?color=4a55d6" alt="npm downloads" /></a>
  <img src="https://img.shields.io/npm/l/@loupekit/mcp?color=4a55d6" alt="MIT license" />
  <img src="https://img.shields.io/badge/MCP-stdio-4a55d6" alt="MCP stdio server" />
  <a href="https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/loupe"><img src="https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/loupe/badges/score.svg" alt="Loupe MCP server on Glama" /></a>
</p>

<p>
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/"><b>Website</b></a> ·
  <a href="https://mohamed-ashraf-elsaed.github.io/loupe/guide/"><b>Docs</b></a> ·
  <a href="https://github.com/mohamed-ashraf-elsaed/loupe"><b>GitHub</b></a> ·
  <a href="https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md"><b>Changelog</b></a> ·
  <a href="https://www.npmjs.com/package/@loupekit/sdk"><b>SDK</b></a>
</p>

</div>

---

## Overview

Product managers pin visual feedback on the live product with the
[Loupe SDK](https://www.npmjs.com/package/@loupekit/sdk) or browser extension. This MCP
server lets **Claude Code read that feedback**, open each comment with everything needed to
make the change, and flow the status back when the work is done — closing the loop.

<div align="center">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/screenshot-3-claude.jpg" alt="Claude Code reading Loupe comments via MCP" width="90%" />
</div>

## What Claude gets

Each comment arrives as a ready-to-act package: the natural-language request, the page URL,
the target element (stable id / CSS path), its outer HTML, a curated slice of computed
styles, and a screenshot URL. No more _"the header looks off somewhere"_ — Claude knows the
element, its state, and the page.

## Tools

| Tool | Description |
| --- | --- |
| `list_comments(status?, url?)` | List comments, optionally filtered by status (`open` / `in_progress` / `done`) or page URL. |
| `get_comment(id)` | The full Claude-ready package for one comment: request + element HTML + computed styles + screenshot URL. |
| `update_status(id, status)` | Move a comment across the workflow (`open` → `in_progress` → `done`) so triage state stays in sync. |

## Install

```bash
npm i -g @loupekit/mcp     # exposes the `loupe-mcp` binary
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/mcp` — add
> `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc` to install from there.

## Configure Claude Code

Add Loupe to your MCP servers (e.g. in `.mcp.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "loupe": {
      "command": "loupe-mcp",
      "env": {
        "LOUPE_API": "https://loupe.yourbackend.com",
        "LOUPE_PROJECT_KEY": "pk_live_yourkey",
        "LOUPE_ADMIN_KEY": "sk_live_yoursecret"
      }
    }
  }
}
```

Then ask Claude Code: _"List the open Loupe comments and fix the first one."_

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `LOUPE_API` | `http://localhost:8787` | Base URL of the Loupe backend API. |
| `LOUPE_PROJECT_KEY` | `pk_demo_acme` | The project whose comments to expose. |
| `LOUPE_ADMIN_KEY` | _(empty)_ | The project secret — authenticates the server as admin (`X-Loupe-Admin`). Required against a real backend. |

## Where the comments come from

The dashboard is the human side of the same backlog Claude reads:

<div align="center">
  <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/store/screenshot-2-board.jpg" alt="Loupe triage board" width="90%" />
</div>

## Transport

Runs over **stdio** using the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).
The published package ships compiled JS (`dist/index.js`), so `npm i -g @loupekit/mcp`
exposes a working `loupe-mcp` binary. From a source checkout it also runs directly with
`node index.ts` (Node 24+ native type-stripping).

## Related packages

| Package | Description |
| --- | --- |
| [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk) | The embeddable widget that captures the feedback. |
| [`@loupekit/shared`](https://www.npmjs.com/package/@loupekit/shared) | The canonical TypeScript types shared across the platform. |

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
