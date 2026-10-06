# @loupekit/mcp

[![npm version](https://img.shields.io/npm/v/@loupekit/mcp?color=4a55d6&label=npm)](https://www.npmjs.com/package/@loupekit/mcp)
![MIT license](https://img.shields.io/npm/l/@loupekit/mcp?color=4a55d6)
![MCP stdio server](https://img.shields.io/badge/MCP-stdio-4a55d6)

`@loupekit/mcp` is an MCP (Model Context Protocol) server for [Loupe](https://github.com/mohamed-ashraf-elsaed/loupe). It gives a coding agent, such as Claude Code, the visual feedback that people pin on your site. For each comment the agent gets the request, the target element's HTML and computed styles, and the screenshot.

The server talks to your MCP client over stdio: the client starts the server as a child process and exchanges messages with it over standard input and output.

## Contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [Configure your MCP client](#configure-your-mcp-client)
- [Verify](#verify)
- [Tools at a glance](#tools-at-a-glance)
- [Environment](#environment)
- [The bridge and the /monitor page](#the-bridge-and-the-monitor-page)
- [Troubleshooting](#troubleshooting)
- [Links](#links)
- [License](#license)

## Prerequisites

- **Node.js 24 or later.** The package is built for Node.js 24. It does not declare an `engines` field, so npm does not warn you on an older version.
- **A running Loupe server.** This is the backend that stores comments and serves the API the MCP server calls, for example the Node server `@loupekit/server`. To run one on your machine, see [Run the local server and dashboard](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/run-local-server.md).
- **A project key and its project secret.** A *project* is the unit Loupe groups comments under. It has a public *project key*, such as `pk_demo_acme`, and a private *project secret*. The project secret is the admin key: the server accepts it in the `X-Loupe-Admin` header. For the demo project that `npm run seed` creates, the key is `pk_demo_acme` and the seed prints the secret as `admin key`.
- **An MCP client**, such as Claude Code.
- **npm**, which includes `npx`. To run the server from a source checkout instead, you also need **git**.

## Install

### Install from npm

Run it without installing:

```bash
npx -y @loupekit/mcp
```

Or install it globally. This adds the `loupe-mcp` command:

```bash
npm install -g @loupekit/mcp
```

> **Note:** Fixed in 0.14.1. The published 0.14.0 package fails at start with `ERR_MODULE_NOT_FOUND` for `@loupekit/shared`. On 0.14.0, run the server from a source checkout.

### Install from a source checkout

Use this method to run the server from the repository, for example while you work on Loupe itself.

1. Clone the repository:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   ```

   You should see a new `loupe` folder.

2. Go into the folder:

   ```bash
   cd loupe
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

   The command finishes without errors and creates `node_modules`.

4. Build the shared package:

   ```bash
   npm run build:shared
   ```

   You should see `tsc -p tsconfig.json` in the output, and the command exits without errors.

5. Print the full path of the folder:

   ```bash
   pwd
   ```

   You should see an absolute path that ends in `/loupe`. You use it as `<ABSOLUTE_PATH_TO_LOUPE>` when you configure your client. Node.js 24 runs the TypeScript entry `packages/mcp/index.ts` directly, so you do not need to build the MCP package.

## Configure your MCP client

Add a `loupe` server to your client's MCP configuration. For Claude Code, this is `.mcp.json` in your project root.

```json
{
  "mcpServers": {
    "loupe": {
      "command": "npx",
      "args": ["-y", "@loupekit/mcp"],
      "env": {
        "LOUPE_API": "<API_URL>",
        "LOUPE_PROJECT_KEY": "<PROJECT_KEY>",
        "LOUPE_ADMIN_KEY": "<PROJECT_SECRET>"
      }
    }
  }
}
```

For a source checkout, set `"command": "node"` and `"args": ["<ABSOLUTE_PATH_TO_LOUPE>/packages/mcp/index.ts"]` instead, where `<ABSOLUTE_PATH_TO_LOUPE>` is the path that `pwd` printed in step 5 of the install.

Replace the placeholders:

- `<API_URL>`: the base URL of your Loupe server, for example `http://localhost:8787`.
- `<PROJECT_KEY>`: the project whose comments the agent works on, for example `pk_demo_acme`.
- `<PROJECT_SECRET>`: that project's secret. `LOUPE_ADMIN_KEY` holds the project secret, and the server sends it as the `X-Loupe-Admin` header. Keep the file out of version control if it holds a real secret.

For other MCP clients, see [Connect Claude Code and other MCP clients](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/connect-mcp-clients.md).

## Verify

1. Start the server by hand, with the same values as your client configuration:

   ```bash
   LOUPE_API=<API_URL> LOUPE_PROJECT_KEY=<PROJECT_KEY> LOUPE_ADMIN_KEY=<PROJECT_SECRET> npx -y @loupekit/mcp
   ```

   For a source checkout, replace `npx -y @loupekit/mcp` with `node <ABSOLUTE_PATH_TO_LOUPE>/packages/mcp/index.ts`.

   You should see this line on standard error:

   ```text
   [loupe-mcp] connected · project=<PROJECT_KEY> · api=<API_URL> · bridge=http://127.0.0.1:9800
   ```

   The line ends in `bridge=disabled` when `LOUPE_BRIDGE_PORT` is `0` or the port is busy. Press `Ctrl+C` to stop the server, so the client's own copy can use port 9800.

2. Start your client. In Claude Code, run `/mcp`.

   You should see `loupe` listed as connected, with 19 tools.

3. Ask your agent:

   ```text
   List my Loupe comments.
   ```

   You should see the agent call `list_comments` and reply with a line such as `3 comment(s):`, then one line per comment. If the project has no matching comments, you see `No comments match.`

## Tools at a glance

The server exposes 19 tools.

| Purpose | Tools |
| --- | --- |
| Comments (the feedback backlog) | `list_comments`, `get_comment`, `update_status`, `propose_change` |
| Selections and element context | `get_latest_selection`, `get_selection_history`, `get_element_context`, `find_source_for_selection` |
| Companion chat with the person watching | `get_companion_messages`, `reply_to_companion` |
| Agent activity | `get_activity_summary`, `get_recent_events`, `get_files_touched`, `get_dashboard_url`, `install_agent_hooks` |
| Threads and pull requests | `get_thread_conversation`, `add_thread_message`, `mark_thread_addressed`, `create_pr_for_thread` |

Terms used in the table:

- **Companion chat**: messages that the person watching the page sends to the agent from the widget's Chat tab, and the agent's replies.
- **Thread**: the conversation on a piece of feedback: the original request, then every reply with its author.

`create_pr_for_thread` needs a GitHub token in `GITHUB_TOKEN` or `GH_TOKEN`, or a signed-in `gh` CLI.

`install_agent_hooks` edits your user-level Claude Code settings, `$HOME/.claude/settings.json`, unless you set `LOUPE_CLAUDE_SETTINGS` or pass a `path`. Before it writes, it copies the existing file to `settings.json.loupe-backup` in the same folder. It leaves other hook entries alone. To undo it, restore the backup:

```bash
cp "$HOME/.claude/settings.json.loupe-backup" "$HOME/.claude/settings.json"
```

For each tool's arguments and output, see the [MCP reference](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/mcp.md).

## Environment

The defaults point at the local demo server. Set these three variables whenever you use another server or project:

| Variable | Type | Default | Purpose | Example |
| --- | --- | --- | --- | --- |
| `LOUPE_API` | URL | `http://localhost:8787` | Base URL of the Loupe server. | `https://tracker.example.com` |
| `LOUPE_PROJECT_KEY` | string | `pk_demo_acme` | The project the agent works on. | `pk_demo_acme` |
| `LOUPE_ADMIN_KEY` | string | empty | The project secret, sent as `X-Loupe-Admin`. | `sk_demo_acme_0f3b9c` |

Other variables control the bridge port, the workspace, the hooks and GitHub. See [Environment variables](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/mcp.md#environment-variables).

## The bridge and the /monitor page

The server also runs a local HTTP bridge on `127.0.0.1`, port `9800` by default. Set `LOUPE_BRIDGE_PORT` to change the port, or to `0` to turn the bridge off. The comment tools work without the bridge.

The Loupe *widget* is the feedback panel that [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk) adds to your page. It uses the bridge only when you configure it to:

- Set the widget's `bridge` option to `'http://127.0.0.1:9800'` to send element selections and show *presence*, the list of people who have the page open. Without it, the widget hides the peer list.
- Also set `chat: true` to turn on the Chat tab for companion chat. It is off by default.

If you run `install_agent_hooks`, Claude Code also reports its tool calls, prompts and sessions to the bridge. Open `http://127.0.0.1:9800/monitor` to watch that activity live on a read-only page.

![The Loupe agent activity page at /monitor, listing recent tool calls and files touched](https://raw.githubusercontent.com/mohamed-ashraf-elsaed/loupe/main/docs/images/mcp-monitor.png)

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The server exits at start with `ERR_MODULE_NOT_FOUND` for `@loupekit/shared`. | You run `@loupekit/mcp` 0.14.0, which does not declare `@loupekit/shared` as a runtime dependency. | Use 0.14.1 or later (`npx -y @loupekit/mcp@latest`), or [install from a source checkout](#install-from-a-source-checkout). |
| A tool fails with an error such as `GET /v1/comments?projectKey=pk_demo_acme → 401`. | `LOUPE_ADMIN_KEY` is empty or is not the project secret. | Set `LOUPE_ADMIN_KEY` to the project secret, then restart the client. |
| The log shows `[loupe] bridge port 9800 is busy after 6 attempts — continuing without it`. | Another process, often a second Loupe MCP server, holds port 9800. | Stop the other process, or set `LOUPE_BRIDGE_PORT` to a free port. The comment tools work either way. |
| Claude Code does not list `loupe` in `/mcp`. | `.mcp.json` is not in the folder where you started Claude Code, or you declined the trust prompt. | Start Claude Code from the project root and approve the server. |

For more cases, see [Troubleshooting in Connect Claude Code and other MCP clients](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/connect-mcp-clients.md#troubleshooting).

## Links

- [Loupe on GitHub](https://github.com/mohamed-ashraf-elsaed/loupe)
- [Website and guide](https://mohamed-ashraf-elsaed.github.io/loupe/)
- [Connect Claude Code and other MCP clients](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/how-to/connect-mcp-clients.md)
- [MCP reference](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/docs/reference/mcp.md)
- [Changelog](https://github.com/mohamed-ashraf-elsaed/loupe/blob/main/CHANGELOG.md)
- [`@loupekit/sdk`](https://www.npmjs.com/package/@loupekit/sdk), the widget that captures the feedback
- [Report an issue](https://github.com/mohamed-ashraf-elsaed/loupe/issues)

## License

MIT © [Mohamed Ashraf Elsaed](https://github.com/mohamed-ashraf-elsaed)
