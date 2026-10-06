# Run the local server and dashboard

This guide shows you how to run the Loupe API server (`@loupekit/server`) on your machine, open the dashboard, and change the settings you need for development or a small self-hosted setup. The dashboard is a Kanban board: a board of columns, one per stage, where each comment is a card that you move from column to column.

The *local server* is one Node process. It serves the comment API under `/v1`, the dashboard, the demo page, and the browser build of the SDK. It stores data in an embedded Postgres database (PGlite) unless you point it at your own Postgres.

**Contents**

- [Prerequisites](#prerequisites)
- [Step 1: Build the packages](#step-1-build-the-packages)
- [Step 2: Create the demo project](#step-2-create-the-demo-project)
- [Step 3: Start the server](#step-3-start-the-server)
- [Step 4: Open the dashboard](#step-4-open-the-dashboard)
- [Step 5: Expand a card](#step-5-expand-a-card)
- [Optional procedures](#optional-procedures)
  - [Use Postgres](#use-postgres)
  - [Store uploads elsewhere](#store-uploads-elsewhere)
  - [Change the demo secret](#change-the-demo-secret)
  - [Create another project](#create-another-project)
  - [Send notifications to Slack or Telegram](#send-notifications-to-slack-or-telegram)
  - [Relay events to the MCP bridge](#relay-events-to-the-mcp-bridge)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Next steps](#next-steps)

## Prerequisites

You need:

- **Node.js 24.** The server runs its TypeScript files directly with `node index.ts`, with no compile step and no flags, so it needs a Node version that runs `.ts` files by default. CI runs on Node 24. An older Node version that does not run TypeScript files by default fails to start the server and the seed script. Check your version:

  ```bash
  node --version
  ```

  You should see `v24` followed by a minor version, for example `v24.1.0`.

- **A clone of the repository:**

  ```bash
  git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
  cd loupe
  ```

  You should see git finish with `done.` and a new `loupe` directory.

- **The workspace dependencies**, installed from the repository root:

  ```bash
  npm install
  ```

  You should see npm finish with an `added ... packages` summary.

Run every command in this guide from the repository root unless a step says otherwise.

## Step 1: Build the packages

The server serves the built dashboard (`packages/dashboard/dist/app.js`) and the built SDK (`packages/sdk/dist`), so build them first.

1. Run the build:

   ```bash
   npm run build
   ```

   The build runs in the order shared, sdk, mcp, dashboard, extension. You should see each workspace build without errors.

## Step 2: Create the demo project

A *project* is the unit Loupe scopes comments to. It has a public *project key* (for example `pk_demo_acme`) and a *project secret*. The project secret and the *admin key* are the same value: the seed output calls it `admin key`, and the dashboard sends it in the `X-Loupe-Admin` header.

The secret is also the key for user signatures. An *HMAC* (hash-based message authentication code) is a signature computed from a user id and the project secret. A host page sends it with each request so the server can trust the user id without knowing the secret in the browser.

1. Run the seed script:

   ```bash
   npm run seed
   ```

   You should see output like this:

   ```text
   [loupe] embedded Postgres (PGlite) at <DATA_DIR>
   Seeded project: pk_demo_acme
     admin key   (dashboard ?key= / X-Loupe-Admin): sk_demo_acme_0f3b9c
     demo HMAC    (host-app-injected for u_92): <HMAC>
   ```

   `<DATA_DIR>` is the database directory, by default `packages/server/data/pg`. The seed creates project `pk_demo_acme`, named "Acme Analytics (demo)", with the secret `sk_demo_acme_0f3b9c` unless you set `LOUPE_DEMO_SECRET`. `<HMAC>` is the signature the demo page uses for the demo user `u_92`.

## Step 3: Start the server

1. Start the server:

   ```bash
   npm start
   ```

   You should see:

   ```text
   [loupe] embedded Postgres (PGlite) at <DATA_DIR>
   [loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)
   ```

   `<DATA_DIR>` is the database directory. By default it is `packages/server/data/pg`.

   The server listens on port 8787. To use another port, set `PORT`, for example `PORT=9000 npm start`. The server runs in the foreground; to stop it, press Ctrl+C in its terminal.

The server answers these URLs:

| URL | What it serves |
|---|---|
| `http://localhost:8787/` | Redirects (302) to `/dashboard/`. |
| `http://localhost:8787/dashboard/` | The Kanban dashboard. |
| `http://localhost:8787/demo/` | A demo page with the widget already set up for `pk_demo_acme`. |
| `http://localhost:8787/sdk/index.global.js` | The SDK browser build that a `<script>` tag loads. Only files under `/sdk/` are served; `/sdk/` itself returns 404. |
| `http://localhost:8787/sdk/index.js` | The SDK module build. |
| `http://localhost:8787/v1/...` | The comment API. See the [server reference](../reference/server.md). |

## Step 4: Open the dashboard

1. Open the dashboard with your project secret in the `key` query parameter:

   ```text
   http://localhost:8787/dashboard/?key=<PROJECT_SECRET>
   ```

   Replace `<PROJECT_SECRET>` with the admin key from Step 2. For the default demo project, open:

   ```text
   http://localhost:8787/dashboard/?key=sk_demo_acme_0f3b9c
   ```

   You should see the board with five columns: Queue, To Do, In Progress, In Review and Resolved. The board refreshes every 4 seconds.

   ![The Loupe dashboard Kanban board with five columns, Queue, To Do, In Progress, In Review and Resolved, holding feedback cards](../images/dashboard-board.png)

   The dashboard saves the key in the browser's `localStorage` as `loupe_admin`, so later visits to `/dashboard/` work without `?key=`. It shows the project `pk_demo_acme` by default. To open another project, add `&project=<PROJECT_KEY>`.

2. In another tab, open `http://localhost:8787/demo/`.

3. Pin a comment on an element of the demo page. Follow Step 3 of [Leave your first comment locally](../tutorials/first-comment-local.md#step-3-pin-a-comment-on-an-element) for the clicks.

4. Return to the dashboard tab.

   You should see a new card in the Queue column within 4 seconds.

## Step 5: Expand a card

A collapsed card already shows the screenshot, the title, the priority and change-type chips, and a row of controls: the buttons that move the card between columns, the **Priority** and **Change type** selects, **Copy for agent**, and **Delete**. You can re-triage a card without expanding it.

1. Click a card, or focus it and press Enter or Space.

   You should see the card's details: the full comment text, the target selector, the page URL, the recording player when the comment has a recording, any attachments, and the proposed fix when there is one.

   An *agent* is an AI coding assistant, such as Claude Code, that reads comments through the MCP server and can propose a change. If an agent has proposed a change for the comment, the card also shows "Claude's proposed fix" with a **Before** frame, an **After (preview)** render of the proposed HTML and CSS in a sandboxed frame, an **HTML** block, and a **CSS** block when the proposal includes CSS. The **Before** frame shows the comment's screenshot, or the text "No screenshot" when the comment has none.

   ![An expanded dashboard card showing a proposed fix with a Before screenshot, an After preview, and HTML and CSS code blocks](../images/dashboard-card.png)

## Optional procedures

Each procedure below is independent. Set the environment variables in the same shell that runs `npm start` or `npm run seed`.

Paths in these variables are easiest to reason about as absolute paths. `npm start` and `npm run seed` run inside `packages/server`, so a relative path resolves from there.

### Use Postgres

By default the server uses PGlite, an embedded Postgres, in the directory set by `LOUPE_PG_DIR` (default `packages/server/data/pg`).

Prerequisite: a reachable Postgres server with an empty database, and a role that can create tables in it.

To use your own Postgres server instead:

1. Set `DATABASE_URL` and seed the database:

   ```bash
   DATABASE_URL=<DATABASE_URL> npm run seed
   ```

   Replace `<DATABASE_URL>` with a Postgres connection string, for example `postgres://loupe:secret@localhost:5432/loupe`.

   You should see `[loupe] Postgres via DATABASE_URL`, followed by the `Seeded project: pk_demo_acme` lines from Step 2.

2. Start the server with the same variable:

   ```bash
   DATABASE_URL=<DATABASE_URL> npm start
   ```

   You should see `[loupe] Postgres via DATABASE_URL` in the log.

The server creates and updates its tables on every start, so you do not run migrations by hand.

To keep PGlite but move its files, set `LOUPE_PG_DIR` instead, for example `LOUPE_PG_DIR=/srv/loupe/pg`. Set the same value for `npm run seed` and `npm start`.

### Store uploads elsewhere

Screenshots, recordings and attachments are uploaded to `POST /v1/blobs` and written to disk. The server returns a URL of the form `<PUBLIC_URL>/v1/blobs/<UUID>.<EXT>`, and the comment stores that full URL.

1. Start the server with the upload directory and the public base URL:

   ```bash
   LOUPE_BLOB_DIR=<BLOB_DIR> LOUPE_PUBLIC_URL=<PUBLIC_URL> npm start
   ```

   - `<BLOB_DIR>`: the directory for uploaded files. Default: `packages/server/data/blobs`.
   - `<PUBLIC_URL>`: the address browsers use to reach this server, for example `https://loupe.example.com`. Default: `http://localhost:8787`.

2. On the demo page, pin a comment with the **Attach screenshot** box in the composer checked. [Leave your first comment locally](../tutorials/first-comment-local.md#step-3-pin-a-comment-on-an-element) shows each click.

   You should see a new file in `<BLOB_DIR>`, and the card's screenshot loads from `<PUBLIC_URL>/v1/blobs/...`.

Comments that already exist keep the URL they were saved with. Changing `LOUPE_PUBLIC_URL` later does not rewrite them.

### Change the demo secret

The seed script writes the secret from `LOUPE_DEMO_SECRET`, or `sk_demo_acme_0f3b9c` when it is not set. Running the seed again overwrites the stored secret.

The demo page sends a fixed HMAC, the `userHmac` value in `packages/sdk/demo/index.html`, which was computed from the default secret. Every API call checks it, reads included, so after you change the secret the demo page's reads and writes are refused until you replace that value.

1. Generate a secret:

   ```bash
   node -e "console.log('sk_' + require('crypto').randomBytes(24).toString('hex'))"
   ```

   You should see a value that starts with `sk_`.

2. Stop the server: press Ctrl+C in the terminal that runs `npm start`. With PGlite, only one process should open the data directory.

3. Seed with the new secret:

   ```bash
   LOUPE_DEMO_SECRET=<NEW_SECRET> npm run seed
   ```

   Replace `<NEW_SECRET>` with the value from step 1. You should see the new value on the `admin key` line, and a new value on the `demo HMAC` line.

4. In `packages/sdk/demo/index.html`, replace the value of `userHmac` with the new `demo HMAC` value from step 3:

   ```js
   userHmac: "<NEW_DEMO_HMAC>",
   ```

   Replace `<NEW_DEMO_HMAC>` with the hex string printed after `demo HMAC`.

5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:8787/dashboard/?key=<NEW_SECRET>`.

   You should see the board with the five columns.

7. Reload `http://localhost:8787/demo/`.

   You should see the demo page's existing comments load in the widget.

### Create another project

The server has no HTTP endpoint that creates a project, and the seed script creates only `pk_demo_acme`. A project is a row in the `projects` table:

| Column | Type | Notes |
|---|---|---|
| `project_key` | `TEXT`, primary key | The public key, for example `pk_shop`. |
| `name` | `TEXT NOT NULL` | Display name. |
| `secret` | `TEXT NOT NULL` | The admin key and the HMAC key for user signatures. |
| `allowed_origins` | `TEXT[] NOT NULL`, default `'{}'` | Stored, but the server does not check it. |
| `created_at` | `TIMESTAMPTZ NOT NULL`, default `now()` | |

To add a row with the server's own store function:

1. Stop the server (press Ctrl+C in its terminal), so only one process opens the PGlite directory.

2. Run this from the repository root, with the same `DATABASE_URL` or `LOUPE_PG_DIR` you use for the server:

   ```bash
   node --input-type=module -e "
   const { migrate } = await import('./packages/server/db.ts');
   const { upsertProject } = await import('./packages/server/store.ts');
   await migrate();
   await upsertProject({ project_key: '<PROJECT_KEY>', name: '<PROJECT_NAME>', secret: '<PROJECT_SECRET>', allowed_origins: [] });
   console.log('created <PROJECT_KEY>');
   "
   ```

   - `<PROJECT_KEY>`: the new public key, for example `pk_shop`.
   - `<PROJECT_NAME>`: a display name, for example `Shop`.
   - `<PROJECT_SECRET>`: a new secret, generated as in [Change the demo secret](#change-the-demo-secret).

   Without `LOUPE_PG_DIR`, this one-liner uses the same default directory as the server, `packages/server/data/pg`. You should see `created <PROJECT_KEY>`.

3. Start the server:

   ```bash
   npm start
   ```

4. Open `http://localhost:8787/dashboard/?project=<PROJECT_KEY>&key=<PROJECT_SECRET>`.

   You should see an empty board.

The same function overwrites the name and secret of an existing key, so you can also use it to rotate a project's secret.

### Send notifications to Slack or Telegram

The server can post thread activity to Slack channels and Telegram chats. A *thread* is a comment together with its replies. The server sends a message when a thread is created, moves to In Progress, gets a pull request, is resolved, or gets an agent reply. It stores each bot token encrypted with AES-256-GCM, and it refuses to store one without an encryption key.

1. Generate a credential key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   You should see a 44-character base64 string.

2. Stop the server: press Ctrl+C in the terminal that runs `npm start`.

3. Start the server with the key:

   ```bash
   LOUPE_CREDENTIAL_KEY=<CREDENTIAL_KEY> npm start
   ```

   Replace `<CREDENTIAL_KEY>` with the value from step 1. Keep it: tokens stored with one key cannot be read with another.

4. In the dashboard, click **Integrations** in the sidebar.

   You should see a **Slack** card and a **Telegram** card, each marked "not connected", and no banner about `LOUPE_CREDENTIAL_KEY`.

   ![The Integrations page with Slack and Telegram cards and the repo to destination mapping table](../images/dashboard-integrations.png)

5. Paste a bot token into the card:

   - **Slack**, field "Bot User OAuth token": a token that starts with `xoxb-`. The bot needs the scopes `chat:write` and `channels:read`, plus `groups:read` for private channels.
   - **Telegram**, field "Bot token": the token from @BotFather, in the form `123456789:AA…`.

6. Click **Connect**.

   The server tests the token before it saves it. You should see the card change to "connected" with the hint `Connected as <IDENTITY>.`, where `<IDENTITY>` is the connected identity (for Slack, the workspace name and the bot user). The destination list fills in from the same response. Slack lists public and private channels the token can see. Telegram lists only chats the bot has already seen.

7. Click **Test connection**.

   You should see `OK — <IDENTITY>.` and the destination list reloads. Use this after a page reload, which empties the list, or after the Telegram bot has seen a new chat: send the bot a message, or add it to a group, then click **Test connection** again.

8. Under **Repo → destination**, type a repository as `org/repo`, or `*` for all.

9. Pick a destination from the list.

10. Click **Map**.

    You should see the row in the mapping table. Until a card has at least one mapping, it says "Nothing mapped yet — no thread will be sent anywhere."

    A thread with no repository goes to every mapping for that provider. A thread with a repository goes to the mapping for that exact repository, or to the `*` mapping when there is none. The widget does not set a repository on new comments, so in practice every mapping receives them.

11. Pin a new comment on the demo page.

    You should see a message in the mapped channel or chat.

Each message is tried up to 3 times, with waits of 1 s and then 4 s, and each try times out after 10 s. Sending runs in the background and never slows down the API request. Every try is logged in the `integration_deliveries` table.

To include an "Open in Loupe" link in messages, also set `LOUPE_PUBLIC_URL` (or `LOUPE_API_URL`) to the server's address. Without either, messages carry no link.

### Relay events to the MCP bridge

MCP (Model Context Protocol) is the protocol AI agents use to call tools. The Loupe MCP server (`@loupekit/mcp`) gives an agent tools to read and answer comments, and it also runs a local HTTP *bridge*, by default on `http://127.0.0.1:9800`. When the API server knows the bridge's address, it forwards thread message events (a reply added or deleted) to the bridge's `/thread-updates` endpoint, so open widgets connected to that bridge update live.

Prerequisite: the MCP server is running, with its bridge on port 9800. See [Connect MCP clients](connect-mcp-clients.md) to start it.

1. Stop the server: press Ctrl+C in the terminal that runs `npm start`.

2. Start the server with the bridge URL:

   ```bash
   LOUPE_BRIDGE_URL=http://127.0.0.1:9800 npm start
   ```

   You should see the same two start-up lines as in Step 3.

3. Open the demo page with the same bridge, in two tabs:

   ```text
   http://localhost:8787/demo/?bridge=http://127.0.0.1:9800
   ```

4. In both tabs, open the replies of the same comment.

5. In one tab, add a reply.

   You should see the reply appear in the other tab without a reload.

Each relay call times out after 1 s, and a failed call is ignored, so the API works the same when the bridge is not running.

## Verify

1. Call the health endpoint:

   ```bash
   curl http://localhost:8787/v1/health
   ```

   You should see:

   ```json
   {"ok":true}
   ```

2. Open `http://localhost:8787/dashboard/?key=<PROJECT_SECRET>`.

   You should see the five columns Queue, To Do, In Progress, In Review and Resolved.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The dashboard shows "Not authorized. Open this page with ?key=<project secret> (from `npm run seed`)." | The API answered 401 or 404: the key is missing or wrong, or the project does not exist. | Open the dashboard with `?key=<PROJECT_SECRET>`. If you changed the secret, use the new value; the old one is still saved in `localStorage`. If you opened another project with `?project=`, check that the key exists. If you have not seeded, run `npm run seed`. |
| The dashboard shows "Can't reach the API at <URL>. Is the backend running? (<ERROR>)" | The server is not running, the dashboard was opened with an `?api=` value that points elsewhere, or the API returned an error other than 401 or 404. `<ERROR>` gives the reason, for example `API 500` for a status code. | If `<ERROR>` names a status, read the server's terminal output for that request. Otherwise start the server with `npm start` and check `curl http://localhost:8787/v1/health`. Remove a wrong `?api=` parameter. |
| `/dashboard/` or `/demo/` loads, but the board or widget never appears. | The packages were not built, so `dashboard/dist/app.js` or `sdk/dist/index.global.js` is missing. | Run `npm run build`, then reload. |
| The Integrations page shows "Credentials cannot be stored: `LOUPE_CREDENTIAL_KEY` is missing or not a 32-byte key on the server. Generate one with … and restart. Loupe will not store tokens unencrypted." and **Connect** is disabled. | The server started without `LOUPE_CREDENTIAL_KEY`, or with a base64 value that does not decode to 32 bytes. | Generate a key with the `randomBytes(32)` command in [Send notifications to Slack or Telegram](#send-notifications-to-slack-or-telegram), then restart the server with it. |
| A card says "needs attention" with "Stored credentials could not be decrypted — reconnect the integration." | The server is running with a different `LOUPE_CREDENTIAL_KEY` from the one that stored the token. | Restart with the original key, or paste the token again and click **Reconnect**. |
| A card says "needs attention" with an error such as `token_revoked`, `invalid_auth`, `account_inactive` or `Unauthorized`, and messages stopped. | A delivery failed with an authentication error, so the server marked the integration as errored. It skips errored integrations until they are fixed. | Create a new token, paste it into the card, and click **Reconnect**. **Test connection** alone uses the stored token and fails again. |
| The Telegram destination list is empty. | Telegram lists only chats the bot has seen. | Send the bot a message, or add it to the group, then click **Test connection**. |
| The **Map** button is disabled. | No destinations are loaded, for example after a page reload. | Click **Test connection** to load them. |

## Known limitations

- **The delivery log is not scoped to a project.** `GET /v1/integrations/deliveries` lists deliveries for every project on the server, so any project's admin key can read them.
- **Notification links do not focus the card.** The "Open in Loupe" link points to `/dashboard/?comment=<ID>`, but the dashboard does not read the `comment` parameter. It opens the board without highlighting the thread.
- **The GitHub and Linear icons on the dashboard are not integrations.** The sidebar shows GitHub, Slack, Telegram and Linear icons, but only Slack and Telegram can be connected.
- **The server has no TLS and no project management UI.** It listens on all network interfaces on `PORT` and accepts requests from any origin. For a shared setup, put it behind a TLS reverse proxy.

## Next steps

- [Local server reference](../reference/server.md): every endpoint and environment variable.
- [Leave your first comment locally](../tutorials/first-comment-local.md): a guided first run with the demo page.
- [Connect MCP clients](connect-mcp-clients.md): let an AI agent read and update comments.
