# MCP server reference

This page lists every binary, environment variable, tool, bridge route, event, hook, limit and
GitHub call of the Loupe MCP servers. It covers two servers:

- `@loupekit/mcp`, version 0.14.1: a Node stdio server with a local HTTP *bridge* (defined
  under [Terms](#terms)).
- The Laravel server that ships with the Loupe Laravel package: four tools that read the
  database directly.

To connect a client, see [Connect MCP clients](../how-to/connect-mcp-clients.md). For known
problems, see [Troubleshooting](../troubleshooting.md#mcp).

Each table has a **Source** column. It gives the file and line in the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) that defines the fact. All
paths are relative to `packages/mcp/` unless they start with `packages/`.

## Contents

1. [Terms](#terms)
2. [Package and binaries](#package-and-binaries)
3. [Environment variables](#environment-variables)
4. [Tools](#tools)
5. [Laravel server tools](#laravel-server-tools)
6. [Local bridge](#local-bridge)
7. [SSE event types](#sse-event-types)
8. [Claude Code hooks](#claude-code-hooks)
9. [Source mapper](#source-mapper)
10. [Stores and caps](#stores-and-caps)
11. [Pull requests](#pull-requests)

## Terms

| Term | Meaning | Source |
|---|---|---|
| Project key | The public id of a Loupe project, for example `pk_demo_acme`. Every API call is scoped to it. See [Run the local server](../how-to/run-local-server.md#step-2-create-the-demo-project) for where the demo key comes from. | `index.ts:72` |
| Admin key (project secret) | The secret of a project. The Node server sends it as the `X-Loupe-Admin` header. The seed output calls it `admin key`. See [Authentication](server.md#authentication). | `index.ts:92-98` |
| Comment and thread | A *comment* is one piece of feedback stored by the Loupe API. Its *thread* is the same record seen as a conversation with messages. The `id` and `thread_id` arguments take the same value: both address `/v1/comments/<ID>`. | `index.ts:202`, `index.ts:576-584` |
| Bridge | A local HTTP server that the Node MCP server starts on `127.0.0.1`. The browser widget and extension use it to reach the agent. See [Local bridge](#local-bridge). | `src/bridge/http-bridge.ts:110` |
| Selection | An element a person picks in the browser with the widget or extension. The bridge keeps recent selections in memory. | `src/bridge/selection-store.ts:21-40` |
| Panel and companion message | The *panel* is the widget's Chat tab. A *companion message* is a message a person types there; it reaches the agent through `POST /companion` on the bridge. | `index.ts:83-87`, `src/bridge/http-bridge.ts:409` |
| Hook events | Records that Claude Code hooks send to the bridge, one per hook call. See [Claude Code hooks](#claude-code-hooks). | `hooks/loupe-hook.mjs:89-94` |
| Source mapper | Code that guesses which files in your workspace render a selected element. See [Source mapper](#source-mapper). | `src/mapper.ts:47-54` |
| SSE | Server-Sent Events: a long-lived HTTP response that streams events as text. | `src/bridge/http-bridge.ts:477` |

## Package and binaries

| Fact | Value | Source |
|---|---|---|
| Package | `@loupekit/mcp`, version `0.14.1`, `"type": "module"` | `package.json:8`, `:30` |
| Binary | `loupe-mcp`, which runs `./dist/index.js` | `package.json:36-38` |
| Published files | `dist` and `hooks` | `package.json:32-35` |
| Runtime dependencies | `@loupekit/shared` `0.14.1`, `@modelcontextprotocol/sdk` `^1.12.0`, `zod` `^3.24.1` | `package.json:45-49` |
| Development dependencies | none | `package.json:50` |
| Build | `tsup`: entry `index.ts`, ESM, platform `node`, target `node24`; `@loupekit/shared` is external | `tsup.config.ts:8-14` |
| Node version | Node 24 or later: the build target, the Docker base image, and the `start` script, which runs `node index.ts` with Node's built-in TypeScript type stripping | `tsup.config.ts:11`, `Dockerfile:9`, `package.json:41` |
| Server name and version | `loupe`, `0.14.1` | `index.ts:307` |
| Transport | stdio | `index.ts:673-711` |
| Startup line (stderr) | `[loupe-mcp] connected · project=<KEY> · api=<URL> · bridge=<URL>` or `bridge=disabled` | `index.ts:673-711` |
| Shutdown | `SIGINT` and `SIGTERM` stop the bridge and exit | `index.ts:673-711` |

### Running the server

Requires Node 24 or later. Run the published package:

```bash
npx -y @loupekit/mcp
```

`npx` downloads `@loupekit/mcp` and its runtime dependencies, including `@loupekit/shared`, and
starts the `loupe-mcp` binary.

> [!NOTE]
> Fixed in 0.14.1. The published 0.14.0 package exits at startup with
> `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@loupekit/shared'`, because it listed
> `@loupekit/shared` only under `devDependencies`. On 0.14.0, run the server from a checkout, as
> below.

To run the server from a repository checkout instead:

```bash
git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
cd loupe
npm install
npm run build:shared
node <ABSOLUTE_PATH_TO_CLONE>/packages/mcp/index.ts
```

- `npm install` runs at the repository root and links the workspace packages.
- `npm run build:shared` builds `@loupekit/shared`. Its `exports` resolve to
  `./dist/index.js`, which does not exist until you build it
  (`package.json:22` at the root, `packages/shared/package.json:32-37`).
- `<ABSOLUTE_PATH_TO_CLONE>` is the full path of the `loupe` directory you cloned, for example
  `/home/sara/src/loupe`.

Either way, you should see this line on stderr, with the default environment (`index.ts:707-710`):

```text
[loupe-mcp] connected · project=pk_demo_acme · api=http://localhost:8787 · bridge=http://127.0.0.1:9800
```

The server then waits for an MCP client on stdin. To make a client launch it, see
[Connect MCP clients](../how-to/connect-mcp-clients.md#procedure-a-connect-the-node-server-to-claude-code).

### Dockerfile

`Dockerfile` builds from `node:24-slim`, runs `npm install -g @loupekit/mcp@latest`, and sets
`ENTRYPOINT ["loupe-mcp"]` (`Dockerfile:9`, `:12`, `:15`).

The comments in `Dockerfile` are stale. Do not rely on them:

| The comment says | The code does |
|---|---|
| The server has three tools: `list_comments`, `get_comment`, `update_status` | It registers 19 tools (`test/mcp.test.ts:93-112`) |
| Node 24 runs the package's TypeScript entry | The binary runs the built `dist/index.js` (`package.json:36-38`) |

## Environment variables

| Variable | Type | Default | Effect | Example | Source |
|---|---|---|---|---|---|
| `LOUPE_API` | URL | `http://localhost:8787` | Base URL of the Loupe API. A trailing `/` is removed. | `LOUPE_API=http://localhost:8787` | `index.ts:71` |
| `LOUPE_PROJECT_KEY` | string | `pk_demo_acme` | [Project key](#terms) sent with API calls. The default works only against the demo project. | `LOUPE_PROJECT_KEY=pk_demo_acme` | `index.ts:72` |
| `LOUPE_BRIDGE_PORT` | integer | `9800` | Port of the local bridge. `0` disables the bridge. | `LOUPE_BRIDGE_PORT=0` | `index.ts:74` |
| `LOUPE_SELECTION_CAP` | positive integer | `50` | How many element selections the bridge keeps. | `LOUPE_SELECTION_CAP=100` | `index.ts:79`, `src/bridge/selection-store.ts:114-125` |
| `LOUPE_EVENT_FILE` | file path | none (memory only) | JSON file that persists hook events. | `LOUPE_EVENT_FILE=/home/sara/.loupe/events.json` | `index.ts:86`, `src/bridge/event-store.ts:118`, `:188` |
| `LOUPE_ADMIN_KEY` | string | `""` | [Admin key (project secret)](#terms). Sent as the `X-Loupe-Admin` header on every API call. | `LOUPE_ADMIN_KEY=sk_demo_acme_0f3b9c` | `index.ts:92-98` |
| `LOUPE_WORKSPACE` | directory path | current directory | Root that the source mapper scans. Also the workspace reported to the agent registry. | `LOUPE_WORKSPACE=/home/sara/src/shop` | `index.ts:371`, `index.ts:685` |
| `LOUPE_MAP_MAX_FILES` | integer | `4000` | Maximum files the source mapper scans. | `LOUPE_MAP_MAX_FILES=8000` | `index.ts:385` |
| `LOUPE_HOOK_SCRIPT` | file path | `hooks/loupe-hook.mjs` in the package | Hook script path that `install_agent_hooks` writes. | `LOUPE_HOOK_SCRIPT=/home/sara/src/loupe/packages/mcp/hooks/loupe-hook.mjs` | `index.ts:545`, `index.ts:299-305` |
| `LOUPE_CLAUDE_SETTINGS` | file path | `$HOME/.claude/settings.json` | Settings file that `install_agent_hooks` edits. | `LOUPE_CLAUDE_SETTINGS=/home/sara/src/shop/.claude/settings.json` | `index.ts:546` |
| `LOUPE_AGENT_ID` | string | `loupe-agent` | Author id on thread messages the agent posts. | `LOUPE_AGENT_ID=loupe-agent` | `index.ts:569` |
| `LOUPE_AGENT_NAME` | string | `Claude Code` (thread author), `loupe-mcp` (agent registry) | Display name. The two uses have different defaults. | `LOUPE_AGENT_NAME="Claude Code"` | `index.ts:570`, `index.ts:683` |
| `LOUPE_AGENT_TYPE` | string | `claude-code` | Agent type in the agent registry. | `LOUPE_AGENT_TYPE=claude-code` | `index.ts:684` |
| `LOUPE_NOTIFY` | `0` or unset | on | `0` turns off desktop notifications for [companion messages](#terms). Any other value leaves them on. | `LOUPE_NOTIFY=0` | `src/bridge/http-bridge.ts:433` |
| `LOUPE_STATE_DIR` | directory path | `~/.loupe` | Directory of the bridge state file `bridge.json`. | `LOUPE_STATE_DIR=/home/sara/.loupe` | `src/bridge/state-file.ts:24-30` |
| `GITHUB_TOKEN` | string | none | GitHub token for `create_pr_for_thread`. See [Token rules](#token-rules). | `GITHUB_TOKEN=<GITHUB_TOKEN>` | `src/github/github-client.ts:92` |
| `GH_TOKEN` | string | none | Read only when `GITHUB_TOKEN` is unset. See [Token rules](#token-rules). | `GH_TOKEN=<GITHUB_TOKEN>` | `src/github/github-client.ts:92` |
| `LOUPE_BRIDGE_URL` | URL | read from the state file | Hook script only: bridge URL override. | `LOUPE_BRIDGE_URL=http://127.0.0.1:9800` | `hooks/loupe-hook.mjs:55` |
| `LOUPE_HOOK_DEBUG` | any non-empty value | off | Hook script only: write diagnostics to stderr. | `LOUPE_HOOK_DEBUG=1` | `hooks/loupe-hook.mjs:26` |

`<GITHUB_TOKEN>` is a GitHub token, as described under [Token rules](#token-rules).

## Tools

The server registers 19 tools. `test/mcp.test.ts:93-112` asserts the exact list.

Every tool is wrapped by `withCompanion` (`index.ts:317-331`). If companion messages are
waiting, the server puts them before the tool result, with this preamble
(`src/bridge/companion-queue.ts:149-170`):

```text
⚠️ The person watching sent you N message(s) while you were working. Read and act on this before continuing:
...
Answer with reply_to_companion so it reaches them, then carry on.
```

API errors surface as `<METHOD> <path> → <status>` (`index.ts:95-102`).

### Comment tools

| Tool | Arguments | What it does | Output | Known defects | Source |
|---|---|---|---|---|---|
| `list_comments` | `status?`, `priority?`, `changeType?`, `repo?`, `branch?`, `url?`: all strings. `status` also accepts the legacy `open` and `done`. | Sends the filters as query parameters to `GET /v1/comments`, then filters again on the client. | `N comment(s):`, then one entry per comment: `- [Stage] Priority · ChangeType · #id — title: body` and `↳ target on url (by author) [repo @ branch]`. Ends with `Use get_comment(id) for the full element context.` No match: `No comments match.` | None found | `index.ts:332-344`, `index.ts:164-199` |
| `get_comment` | `id`: string | Reads `GET /v1/comments/<ID>`. | Text with title, request, page, target element, screenshot, screen recording (webm), attachments, `## Target element HTML`, `## Computed styles`, and `## Existing proposal` when one exists. Then image blocks for the screenshot and image attachments. A free note returns a shorter block. | None found | `index.ts:345-350`, `index.ts:201-261` |
| `update_status` | `id`: string, `status`: string | Normalizes the status. If it normalizes to `resolved` (including the legacy `done`), changes nothing and answers with a refusal. Otherwise sends `PATCH {status}` and publishes a `thread` event, `status_changed`. | `#id → Label`. For `resolved`: `#id was not changed: only a person resolves a comment. Set in_review, or call mark_thread_addressed, when the change is ready.` | None found. Before 0.14.1 the tool stored `resolved` despite its description. | `index.ts:351-356`, `index.ts:263-275` |
| `propose_change` | `id`: string, `html`: string, `css?`: string, `notes?`: string | Sends `PATCH {proposal: {html, css, notes, author: "Claude Code via MCP", createdAt}}` and publishes `preview_live`. | `Proposal saved for #id…` | None found | `index.ts:357-367`, `index.ts:277-288` |

Images are inlined only for `image/*` content types. Data URLs work. A failed fetch drops the
image without an error (`index.ts:117-133`). The target of a page-level note is
`page-level note`; otherwise it is `[data-testid="…"]` or the CSS path (`index.ts:136-139`).

### Selection and source tools

| Tool | Arguments | What it does | Output | Known defects | Source |
|---|---|---|---|---|---|
| `get_latest_selection` | none | Returns the newest element picked in the browser. | Markdown `# Selected element` block | None found | `index.ts:396-401` |
| `get_selection_history` | `limit?`: positive integer, max 50, default 10 | Lists recent selections. | List of selections | None found | `index.ts:402-407` |
| `get_element_context` | `thread_id?`, `selection_id?`: strings; `include_prompt?`: boolean, default `true` | Builds the full context for a thread or selection, with source candidates and an optional task prompt. | `# Selected element`, `## Computed styles`, `## Source candidates`, then the prompt sections `# Task`, `## Where it probably lives` or `## Where it lives`, `## How to make the change`, `## What happens next` | None found | `index.ts:408-417`, `src/tools/element-context.ts:91-125`, `src/prompt-template.ts:46-98` |
| `find_source_for_selection` | `thread_id?`, `selection_id?`: strings | Runs the [source mapper](#source-mapper) only. | Candidate list: `` `file:start-end` — N% · reason `` | None found | `index.ts:418-424` |

With nothing selected, these tools return the `NOTHING_SELECTED` message
(`src/tools/element-context.ts:173`). An unknown `selection_id` returns a message that says
the bridge keeps the most recent 50 selections. The `50` is fixed text and does not follow
`LOUPE_SELECTION_CAP`. An unknown `thread_id` returns ``Use `list_comments` to see the
available ids.`` (`src/tools/element-context.ts:179-183`).

### Companion tools

| Tool | Arguments | What it does | Output | Known defects | Source |
|---|---|---|---|---|---|
| `get_companion_messages` | `drain?`: boolean, default `true` | Reads messages sent from the panel. `drain: false` reads without removing. | One line each: `[at] name: body (re: …) [urls]`. Empty: `No companion messages waiting.` | None found | `index.ts:428-444` |
| `reply_to_companion` | `body`: string, `inReplyTo?`: string | Sends a reply to the panel and publishes a `companion` `reply` event. | `Sent to the panel at …` | None found | `index.ts:446-458` |

### Activity tools

| Tool | Arguments | What it does | Output | Known defects | Source |
|---|---|---|---|---|---|
| `get_activity_summary` | `session_id?`: string, `limit?`: integer, max 50, default 5 | Summarizes agent sessions from hook events. | One line per session: `● live` or `○ ended`, id, prompts, tool calls, files touched, and the 3 most used tools | None found | `index.ts:460-479`, `src/bridge/session-manager.ts:126-136` |
| `get_recent_events` | `limit?`: integer, max 200, default 30; `type?`: string | Lists recent hook events, newest first. | One line per event: `<at>  <type> (<tool>)[ [FAILED]]: <summary> — <files>`. No events: `No agent events recorded yet. The hooks may not be installed — install_agent_hooks adds them.`, or `No events of type <TYPE> recorded.` | None found. Before 0.14.1 the tool threw a `ReferenceError` on every call. | `index.ts:481-507` |
| `get_files_touched` | none | Lists files that hook events touched. | File list | None found | `index.ts:509-524` |
| `get_dashboard_url` | none | Returns the address of the `/monitor` page. | `Open <BRIDGE_URL>/monitor…`, or a "not running" message when the bridge is off | None found | `index.ts:526-536` |
| `install_agent_hooks` | `path?`: string, default `~/.claude/settings.json` | Adds the Loupe hooks to a Claude Code settings file. See [Claude Code hooks](#claude-code-hooks). | Install result | None found | `index.ts:538-564` |

### Thread tools

| Tool | Arguments | What it does | Output | Known defects | Source |
|---|---|---|---|---|---|
| `mark_thread_addressed` | `thread_id`: string, `message?`: string | Sends `PATCH {status: "in_review"}`. Posts the message when it is not empty, with the agent as author (`type: "agent"`). | Confirmation | None found | `index.ts:587-595`, `src/tools/handoff.ts:41-61` |
| `add_thread_message` | `thread_id`: string, `message`: string | Posts a message. Does not change the status. | Confirmation. A blank message returns `A message body is required…` | None found | `index.ts:596-604`, `src/tools/handoff.ts:67-77` |
| `get_thread_conversation` | `thread_id`: string | Reads the thread and its messages. | Conversation text | None found | `index.ts:605-610`, `src/tools/handoff.ts:80-98` |
| `create_pr_for_thread` | `repo`: `owner/name`; `thread_id`: string; `description`: string; `files`: array of `{path, content}`, minimum 1, full file contents; `base_branch?`: default `main`; `branch_name?`; `revision_of?` | Commits the files and opens or updates a pull request. See [Pull requests](#pull-requests). On success it saves `pr {number, url, state: "open"}` on the thread and publishes `pr_created`. | `#id → <PR_URL>`, a note, and ``Branch `…` · commit `abc1234` · outcome: …``. Failure: `Could not open the pull request: …` | None found | `index.ts:612-661` |

## Laravel server tools

The Laravel package ships a second MCP server with four tools. It requires `laravel/mcp`
`^0.8`, an optional dependency: `loupekit/laravel` lists it only under `require-dev` and
`suggest`, so installing the package does not install it, and `php artisan mcp:start loupe`
does not exist until you add it (`packages/laravel/composer.json:36-37`, `:42-43`). Install it in
your app:

```bash
composer require laravel/mcp:^0.8
```

See [the Laravel guide](../LARAVEL.md) for the rest of the installation.

| Fact | Value | Source |
|---|---|---|
| Registration | `Mcp::local('loupe', LoupeServer::class)` | `packages/laravel/routes/ai.php` |
| Start command | `php artisan mcp:start loupe` | `packages/laravel/routes/ai.php`, `packages/laravel/src/Mcp/Servers/LoupeServer.php:15` |
| Server name and version | `Loupe`, `1.0.0` | `packages/laravel/src/Mcp/Servers/LoupeServer.php:19-21` |
| Tools | `ListComments`, `GetComment`, `ProposeChange`, `UpdateStatus` | `packages/laravel/src/Mcp/Servers/LoupeServer.php:25-30` |

| Tool | Arguments | Output | How it differs from the Node tool | Source |
|---|---|---|---|---|
| `list-comments` | `status`, `priority`, `changeType`, `repo`, `branch`, `url`: optional strings | JSON `{count, comments}` | Returns JSON, not text. | `packages/laravel/src/Mcp/Tools/ListComments.php:21-31`, `:78` |
| `get-comment` | `id`: required string | Markdown text and images read from the storage disk. Missing: error `Comment not found.` | Reads images from disk, not over HTTP. | `packages/laravel/src/Mcp/Tools/GetComment.php:20-24`, `:35` |
| `propose-change` | `id`, `html`: required; `css`, `notes`: optional | `Proposal saved for #id. …` Missing: error `Comment not found.` | Same author string, `Claude Code via MCP`. | `packages/laravel/src/Mcp/Tools/ProposeChange.php:19-26`, `:36`, `:43`, `:48` |
| `update-status` | `id`, `status`: required | JSON `{id, status}`. Missing: error `Comment not found.` | The status is normalized with `Stages::normalize`. | `packages/laravel/src/Mcp/Tools/UpdateStatus.php:19-24`, `:30`, `:37`, `:43` |

The tool names are kebab-case. No tool class sets a name, so `laravel/mcp` derives each name
from the class name with `Str::kebab` (`vendor/laravel/mcp/src/Server/Primitive.php:31-37`,
v0.8.2). The Node server uses snake_case names such as `list_comments`. The server
instructions in `packages/laravel/src/Mcp/Servers/LoupeServer.php:23` name the snake_case forms,
which do not match the Laravel tool names.

All four tools query the database directly. They do not call the HTTP API, they have no bridge,
and they do not publish events. Every query is scoped to the project key in the
`loupe.project_key` config value, default `app` (`packages/laravel/src/Mcp/Concerns/ResolvesComments.php:16-18`,
`packages/laravel/src/Mcp/Tools/ListComments.php:36`).

## Local bridge

The Node server starts an HTTP bridge when `LOUPE_BRIDGE_PORT` is not `0` (`index.ts:673-711`).
The browser widget and extension use it to send selections, presence and companion messages.

| Setting | Value | Source |
|---|---|---|
| Bind address | `127.0.0.1` | `src/bridge/http-bridge.ts:110` |
| Port | `9800` by default | `index.ts:74` |
| Retries when the port is busy | 5, every 1500 ms. After that the server runs without a bridge and logs `[loupe] bridge port N is busy after 6 attempts — continuing without it`. | `src/bridge/http-bridge.ts:65-66`, `:93` |
| Body limit | 1 MiB. Larger bodies get `400 body exceeds N bytes`. | `src/bridge/http-bridge.ts:46` |
| CORS origins | `chrome-extension://*`, and the hosts `localhost`, `127.0.0.1` and `[::1]` | `src/bridge/http-bridge.ts:131-141` |
| Preflight | `OPTIONS` returns `204`; methods `GET, POST, DELETE, OPTIONS`; header `Content-Type` | `src/bridge/http-bridge.ts:183-190` |
| State file | `<LOUPE_STATE_DIR>/bridge.json` with `{url, port, pid, at}`. Written on start, removed on close only when the port matches. A write failure never throws. | `src/bridge/state-file.ts:17-53`, `src/bridge/http-bridge.ts:77`, `:83` |

### Routes

| Method and path | Request | Response | Source |
|---|---|---|---|
| `GET /health`, `GET /` | none | `{ok, selections, agents, peers, subscribers}` | `src/bridge/http-bridge.ts:194` |
| `POST /selection` | selection payload (see [Stores and caps](#stores-and-caps)) | `201 {ok, correlationId, at}`. `400 body is not valid JSON` or a validation error. | `src/bridge/http-bridge.ts:205` |
| `GET /selection/latest` | none | `{selection}` | `src/bridge/http-bridge.ts:221` |
| `GET /selection/history?limit=<N>` | none | `{selections}` | `src/bridge/http-bridge.ts:228` |
| `GET /selection?correlationId=<ID>` | none | `{selection}` | `src/bridge/http-bridge.ts:235` |
| `DELETE /selection` | none | `{ok, selections: 0}` | `src/bridge/http-bridge.ts:240` |
| `POST /agents` | `name`, `type`, `workspace`, `cwd?` | `201 {ok, agent}`. `400 name, type and workspace are required`. | `src/bridge/http-bridge.ts:246` |
| `GET /agents` | none | `{agents}` | `src/bridge/http-bridge.ts:264` |
| `POST /agents/<ID>/heartbeat` | none | `{ok, agent}`. `404 unknown agent`. | `src/bridge/http-bridge.ts:268` |
| `DELETE /agents/<ID>` | none | `{ok: <boolean>}`; `false` for an unknown id | `src/bridge/http-bridge.ts:275-277` |
| `POST /presence` | `url`, `userId`, `name`, `tab?` | `201 {ok, peer, peers}`. `400 url, userId and name are required`. | `src/bridge/http-bridge.ts:283` |
| `GET /presence?url=<URL>&viewer=<ID>` | none | `{peers}` | `src/bridge/http-bridge.ts:297` |
| `POST /presence/<ID>/heartbeat` | none | `{ok, peer}`. `404 unknown peer`. | `src/bridge/http-bridge.ts:303` |
| `DELETE /presence/<ID>` | none | `{ok: <boolean>}`; `false` for an unknown id | `src/bridge/http-bridge.ts:311-315` |
| `POST /thread-updates` | `threadId`, `eventType`, `data?` | `202 {ok}`. `400` when a field is missing. | `src/bridge/http-bridge.ts:321` |
| `POST /events/ingest` | `event` (string), `payload?`, `at?` | `202 {ok, event}`. `400 event is required`. `503 event store is not enabled`. | `src/bridge/http-bridge.ts:345` |
| `GET /events/recent?limit=50&type=<TYPE>` | none | `{events, total}` | `src/bridge/http-bridge.ts:367` |
| `GET /sessions` | none | `{sessions}` | `src/bridge/http-bridge.ts:375` |
| `GET /monitor`, `/monitor/`, `/dashboard` | none | HTML activity page | `src/bridge/http-bridge.ts:383` |
| `GET /monitor/api/events?limit=200` | none | `{events, total}` | `src/bridge/http-bridge.ts:391` |
| `GET /monitor/api/summary` | none | Activity summary | `src/bridge/http-bridge.ts:400` |
| `POST /companion` | `body` (required), `author?`, `contexts?` (first 20 kept), `attachments?` (first 10 kept), `voice?` | `201 {ok, message, queued}`. Sends a desktop notification unless `LOUPE_NOTIFY=0`. `503 companion is not enabled`. | `src/bridge/http-bridge.ts:409`, `:433` |
| `GET /companion` | `since?` | `{messages, replies, queued, pending}` with the last 50 replies. With `since`: `{replies, messages, queued}`. | `src/bridge/http-bridge.ts:437` |
| `POST /companion/reply` | `body`, `inReplyTo?` | `201 {ok, reply}` | `src/bridge/http-bridge.ts:455` |
| `GET /events` | none | SSE stream of all events | `src/bridge/http-bridge.ts:477` |
| `GET /thread-updates` | none | SSE stream of `thread` events only | `src/bridge/http-bridge.ts:477` |
| Any other route | none | `404 no route for <METHOD> <PATH>` | `src/bridge/http-bridge.ts:481` |

A handler that throws returns `500` (`src/bridge/http-bridge.ts:484`).

Example: check that the bridge is running.

```bash
curl -s http://127.0.0.1:9800/health
```

You should see a response like this one. `agents` is `1` because the server registers itself:

```json
{"ok":true,"selections":0,"agents":1,"peers":0,"subscribers":0}
```

If the connection is refused, the bridge is off (`LOUPE_BRIDGE_PORT=0`, which prints
`bridge=disabled` in the startup line) or the port was busy at startup (the `bridge port N is
busy` message, `src/bridge/http-bridge.ts:93`).

### Monitor page

`/monitor` shows agent activity: a timeline of the last 120 events, 5 sessions, the top 10
tools, and up to 40 files (`src/bridge/dashboard.ts:121`, `:142`, `:156`, `:171`). The page
title is `Loupe — agent activity` (`src/bridge/dashboard.ts:18`). It listens for `activity`
events on `/events`. When the stream is not open, it polls every 5 seconds. When the browser
cannot open an `EventSource`, it polls every 3 seconds (`src/bridge/dashboard.ts:182-210`).

![The /monitor page showing an agent timeline, sessions, tool counts and touched files](../images/mcp-monitor.png)

## SSE event types

`GET /events` sends a first comment `: loupe bridge`, then events as `event: <TYPE>` and
`data: <JSON>`. It sends `: ping` every 15 seconds (`src/bridge/http-bridge.ts:48`, `:502-511`).

| Type | Fields | Sent when | Source |
|---|---|---|---|
| `selection` | `data` | A selection arrives | `src/bridge/events.ts:12-20`, `src/bridge/http-bridge.ts:217` |
| `agents` | `data`: list of agents | An agent registers, or a sweep removes a stale agent | `src/bridge/http-bridge.ts:260`, `index.ts:689` |
| `presence` | `data` | A peer joins, a peer leaves (`DELETE /presence/<ID>` for a known peer), or a sweep removes an expired peer | `src/bridge/http-bridge.ts:293`, `:313-314`, `index.ts:692` |
| `companion` | `eventType`: `message` or `reply`; `data` | A panel message or an agent reply | `src/bridge/events.ts:12-20`, `:54` |
| `activity` | `data` | A hook event is ingested | `src/bridge/events.ts:19`, `src/bridge/http-bridge.ts:363` |
| `thread` | `threadId`, `eventType`, `data` | `pr_created`, `preview_live`, `thread_resolved`, `status_changed`, or any posted type | `src/bridge/events.ts:12-20`, `:59` |

## Claude Code hooks

`install_agent_hooks` connects Claude Code to the bridge so `/monitor` can show what the agent
does.

| Fact | Value | Source |
|---|---|---|
| Installed events | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `Notification`, `SessionEnd` | `src/hooks/hook-installer.ts:26-34` |
| Hook command | `node "<SCRIPT>" <EVENT>` | `src/hooks/hook-installer.ts:55` |
| Marker | `loupe-hook`: identifies Loupe entries on reinstall | `src/hooks/hook-installer.ts:23` |
| Backup | `<SETTINGS>.loupe-backup` | `src/hooks/hook-installer.ts:154-199` |
| Write | Writes `<SETTINGS>.tmp`, then renames it. Writes nothing when nothing changed. Never throws. | `src/hooks/hook-installer.ts:154-199` |
| Invalid settings | Refused: `settings file is not valid JSON (…); left untouched` | `src/hooks/hook-installer.ts:154-199` |

### Event mapping

The bridge lowercases the hook event name and removes non-letters before it looks it up. An
unknown event is stored under its own name, or `unknown` (`src/hooks/hook-events.ts:30-33`).

| Claude Code event | Stored type | Source |
|---|---|---|
| `SessionStart` | `session_start` | `src/hooks/hook-events.ts:17-28` |
| `SessionEnd` | `session_end` | `src/hooks/hook-events.ts:17-28` |
| `UserPromptSubmit` | `prompt_submit` | `src/hooks/hook-events.ts:17-28` |
| `PreToolUse` | `tool_use` | `src/hooks/hook-events.ts:17-28` |
| `PostToolUse` | `tool_result` | `src/hooks/hook-events.ts:17-28` |
| `SubagentStart` | `subagent_start` | `src/hooks/hook-events.ts:17-28` |
| `SubagentStop` | `subagent_stop` | `src/hooks/hook-events.ts:17-28` |
| `Notification` | `notification` | `src/hooks/hook-events.ts:17-28` |
| `Stop` | `turn_end` | `src/hooks/hook-events.ts:17-28` |
| `PreCompact` | `compact` | `src/hooks/hook-events.ts:17-28` |

The installer does not add `SubagentStart`, `Stop` or `PreCompact`. The mapping handles them
if you add them yourself.

### Hook script

`hooks/loupe-hook.mjs` runs once per hook call.

| Behavior | Value | Source |
|---|---|---|
| Event name | `argv[2]`, default `unknown` | `hooks/loupe-hook.mjs:67` |
| Bridge URL | `LOUPE_BRIDGE_URL`, else the `url` in `<LOUPE_STATE_DIR or ~/.loupe>/bridge.json` | `hooks/loupe-hook.mjs:49-55` |
| Request | `POST <BRIDGE_URL>/events/ingest` with `{event, payload, at}` | `hooks/loupe-hook.mjs:89-94` |
| Timeout | 1200 ms for the request; 500 ms to read stdin | `hooks/loupe-hook.mjs:23`, `:45` |
| Bad stdin | Sent as `{raw: <FIRST_2000_CHARS>}` | `hooks/loupe-hook.mjs:82` |
| Debug | `LOUPE_HOOK_DEBUG` writes diagnostics to stderr | `hooks/loupe-hook.mjs:26` |
| Exit | Always exits `0` and never writes to stdout, so it cannot block or change the agent | `hooks/loupe-hook.mjs:103-105` |

The comment at `hooks/loupe-hook.mjs:15` mentions an "ephemeral port". It is stale: the bridge
uses port 9800 by default.

## Source mapper

The source mapper guesses which files in `LOUPE_WORKSPACE` render a selected element. It
matches element signals against file text.

| Signal | Weight | Source |
|---|---|---|
| Element `id` | 0.85 | `src/mapper.ts:47-54` |
| `aria-label` | 0.8 | `src/mapper.ts:47-54` |
| Text | 0.7 | `src/mapper.ts:47-54` |
| Class | 0.5 | `src/mapper.ts:47-54` |
| Plain text | 0.4 | `src/mapper.ts:47-54` |
| File name | 0.6 | `src/mapper.ts:47-54` |

| Boost | Amount | Source |
|---|---|---|
| Component file name | +0.12 | `src/mapper.ts:388-395` |
| View file | +0.08 | `src/mapper.ts:388-395` |
| Path under `src/` | +0.05 | `src/mapper.ts:388-395`, `:167` |
| Distinct signals | +min(0.12, 0.06 × (n − 1)) | `src/mapper.ts:388-395` |
| Several matches | +min(0.06, 0.02 × (n − 1)) | `src/mapper.ts:388-395` |

| Limit | Default | Source |
|---|---|---|
| Files scanned | 4000 (`LOUPE_MAP_MAX_FILES`) | `index.ts:385` |
| File size | 512 KB | `src/mapper.ts:186-191` |
| Total bytes scanned | 64 MB | `src/mapper.ts:186-191` |
| Cache lifetime | 15000 ms | `src/mapper.ts:186-191` |
| Candidates returned | 10 | `src/mapper.ts:186-191` |
| Context lines around a match | 2 | `src/mapper.ts:186-191` |
| Line length before a file counts as generated | 1500 characters | `src/mapper.ts:151-154` |
| Concurrent file reads | 16 | `src/mapper.ts:322` |

Utility classes are removed before matching (`src/mapper.ts:102`, `:122`).

## Stores and caps

| Store | Limit | Source |
|---|---|---|
| Selections | Ring of 50 (`LOUPE_SELECTION_CAP`); the oldest is removed. The capacity must be a positive integer. | `src/bridge/selection-store.ts:114-125` |
| Selection payload | Required: `correlationId`, `url`, `tag`. Optional: `selector`, `testid`, `text`, `id`, `classes`, `attrs`, `styles`, `box {x, y, w, h}`, `screenshot`, `at`. | `src/bridge/selection-store.ts:21-40`, `:65` |
| Agents | Stale after 30 s; swept every 10 s. Id: `ag_<8 hex>`, an FNV-1a hash of type, workspace and name. | `src/bridge/agent-registry.ts:30-41` |
| Presence peers | Expire after 20 s; clients send a heartbeat every 6 s | `packages/shared/src/presence.ts:26-28` |
| Hook events | 1000 events. In each payload, every string is cut to 2000 characters with a `… [truncated N chars]` suffix, arrays keep their first 20 items, objects their first 30 keys, and anything nested 4 levels deep becomes `[deeper]`. The file is written 250 ms after the last change, through a temporary file and a rename. | `src/bridge/event-store.ts:53-63`, `:66-68`, `:77-90`, `:187-189` |
| Event fields | `{id, at, type, sessionId?, tool?, summary?, files?, payload?}` | `src/bridge/event-store.ts:27-40` |
| Sessions | Idle after 10 minutes. File paths are read from the payload keys `file`, `file_path`, `path`, `filepath`, `notebook_path`, `filename`, `target_file`. | `src/bridge/session-manager.ts:30-32` |
| Activity summary | `{totals {events, tools, files, failures, sessions}, sessions, toolCounts, files}`. A failure is a `tool_result` whose payload has `ok: false`. | `src/bridge/session-manager.ts:152-183` |
| Companion replies | 100 kept; `GET /companion` returns 50 | `src/bridge/companion-queue.ts:50`, `:132` |
| Desktop notifications | Linux `notify-send --app-name=Loupe`, macOS `osascript`, Windows not supported. Text cut to 200 characters. | `src/bridge/notify.ts:42-58`, `:73` |

## Pull requests

`create_pr_for_thread` uses one accumulating pull request per repository. Each fix adds a
commit and a table row, instead of opening a new pull request.

| Fact | Value | Source |
|---|---|---|
| Default branch name | `loupe/fixes` | `src/tools/create-pr.ts:120-124` |
| Revision branch name | `revision-<REVISION_OF>`, unless `branch_name` is given | `src/tools/create-pr.ts:120-124` |
| Base branch | `main` unless `base_branch` is given | `index.ts:612-661` |
| Title | `Feedback Fixes` | `src/tools/create-pr.ts:18` |
| Body table | `\| Thread \| Fix \| Commit \|`, after the sentinel `<!-- loupe:fixes -->` | `src/tools/create-pr.ts:16`, `:38` |
| Outcomes | `created`, `appended`, `restarted` | `src/tools/create-pr.ts:127`, `:169-189` |
| Tracking | Reads `GET /v1/working-branches?projectKey=<KEY>&repo=<REPO>`. A tracked PR that is no longer open is posted back as `merged`, and the branch restarts. A revision always starts fresh. | `src/tools/create-pr.ts:160-189` |
| Commit message | `feat(<REPO_NAME>): <DESCRIPTION>` for the first fix, `fix(…)` when appending; repository name defaults to `app`. Body: `Addresses feedback thread <ID>.` | `src/tools/create-pr.ts:249-253` |
| API | At `https://api.github.com`: the Git Data API (refs, blobs, trees, commits) and the Pulls API (create, read, update body) | `src/github/github-client.ts:148`, `:185-255`, `:266`, `:277`, `:286` |
| User-Agent | `loupe-mcp (+https://github.com/mohamed-ashraf-elsaed/loupe)` | `src/github/github-client.ts:42` |

Example commit message for a fix appended to an open PR in `acme/shop`:

```text
fix(shop): Increase checkout button contrast

Addresses feedback thread TCK-42.
```

### Token rules

The server reads the token when the tool runs, not at startup (`src/github/github-client.ts:90-111`).

| Step | Rule | Source |
|---|---|---|
| 1 | The environment candidate is `GITHUB_TOKEN`. `GH_TOKEN` is read only when `GITHUB_TOKEN` is unset. A `GITHUB_TOKEN` set to an empty string or a placeholder still hides `GH_TOKEN`. | `src/github/github-client.ts:92` |
| 2 | A candidate that is not a placeholder is used. | `src/github/github-client.ts:93-95` |
| 3 | Otherwise the server runs `gh auth token` and uses its output if it is not a placeholder. | `src/github/github-client.ts:97-101` |
| 4 | Otherwise the tool returns advice. When a non-empty environment token was rejected, the advice starts with `GITHUB_TOKEN looks like a placeholder, so it was ignored.` That text names `GITHUB_TOKEN` even when the value came from `GH_TOKEN`. | `src/github/github-client.ts:103-110` |

A *placeholder* is an empty value, a value shorter than 20 characters, or one that matches a
placeholder pattern such as `<…>`, `your token`, `changeme` or `...`
(`src/github/github-client.ts:44-68`). The advice tells you to set `GITHUB_TOKEN` to a
fine-grained personal access token with **Contents** and **Pull requests** read and write
access, or to run `gh auth login` (`src/github/github-client.ts:77-81`).

The MCP client launches the server, so the token must be in the server's environment, not only
in your shell. Put it in the `env` block of the server entry in your client configuration:

```json
"env": {
  "GITHUB_TOKEN": "<GITHUB_TOKEN>"
}
```

`<GITHUB_TOKEN>` is a fine-grained personal access token with **Contents** and
**Pull requests** set to read and write on the target repository. For the full client
configuration, see
[Let Claude open pull requests](../how-to/connect-mcp-clients.md#optional-let-claude-open-pull-requests).

To check the `gh` fallback, run `gh auth token`. You should see a token printed. After a restart
of the client, `create_pr_for_thread` no longer returns `No GitHub token is configured, so I
cannot open a pull request.`

## Related

- [Loupe overview](../README.md)
- [Connect MCP clients](../how-to/connect-mcp-clients.md)
- [Troubleshooting](../troubleshooting.md#mcp)
- [SDK reference](sdk.md)
- [Server reference](server.md)
- [Laravel guide](../LARAVEL.md)
