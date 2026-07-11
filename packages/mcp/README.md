# @loupekit/mcp

**Model Context Protocol (MCP) server that hands [Loupe](https://github.com/mohamed-ashraf-elsaed/loupe)
comments to Claude Code as an actionable, fully-contextualized backlog.**

Product managers pin visual feedback on the live product with the
[Loupe SDK](https://www.npmjs.com/package/@loupekit/sdk) or browser extension. This MCP
server lets **Claude Code read that feedback**, open each comment with everything needed to
make the change — the request, the target element's HTML, its computed styles, and a
screenshot — and flow the status back when the work is done.

---

## What Claude gets

Each comment arrives as a ready-to-act package: the natural-language request, the page URL,
the target element (stable id / CSS path), its outer HTML, a curated slice of computed
styles, and a screenshot URL. No more "the header looks off somewhere" — Claude knows the
element, its state, and the page.

## Tools

| Tool                        | Description                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `list_comments(status?, url?)` | List comments, optionally filtered by status (`open` / `in_progress` / `done`) or page URL.               |
| `get_comment(id)`           | The full Claude-ready package for one comment: request + element HTML + computed styles + screenshot URL.     |
| `update_status(id, status)` | Move a comment across the workflow (`open` → `in_progress` → `done`) so triage state stays in sync.           |

## Install

```bash
npm i -g @loupekit/mcp     # exposes the `loupe-mcp` binary
```

> Also mirrored to **GitHub Packages** as `@mohamed-ashraf-elsaed/mcp`. To install from there,
> add `@mohamed-ashraf-elsaed:registry=https://npm.pkg.github.com` to your `.npmrc`.

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

| Variable            | Default                   | Description                                                          |
| ------------------- | ------------------------- | -------------------------------------------------------------------- |
| `LOUPE_API`         | `http://localhost:8787`   | Base URL of the Loupe backend API.                                   |
| `LOUPE_PROJECT_KEY` | `pk_demo_acme`            | The project whose comments to expose.                                |
| `LOUPE_ADMIN_KEY`   | _(empty)_                 | The project secret — authenticates the server as admin (`X-Loupe-Admin`). Required against a real backend. |

## Transport

Runs over **stdio** using the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).
Node 24+ runs the TypeScript entry directly (native type-stripping) — no build step.

## Related packages

- [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk) — the embeddable widget that
  captures the feedback.
- [`@loupekit/shared`](https://www.npmjs.com/package/@loupekit/shared) — the canonical types.

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
