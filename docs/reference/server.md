# Local server reference

This page lists the environment variables, authentication rules, limits, endpoints, tables and
integration behavior of `@loupekit/server`, version 0.14.1. Use it when you run the local server,
or when you write a backend that replaces it.

> **Note:** `@loupekit/server` is not published to npm. You run it from a clone of the
> [Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe).

The server is a single Node.js process built on `node:http`. It serves the JSON API under `/v1`
and the dashboard, demo and SDK bundle as static files.

Each table has a **Source** column. It gives the file and line that defines the fact. All paths
are relative to `packages/server/` unless they start with `packages/`. The line numbers match the
`v0.14.1` tag, so you can open any cited file at
[that tag on GitHub](https://github.com/mohamed-ashraf-elsaed/loupe/tree/v0.14.1/packages/server).

## Contents

1. [Run the server](#run-the-server)
2. [Environment variables](#environment-variables)
3. [Authentication](#authentication)
4. [CORS](#cors)
5. [Body limits and error responses](#body-limits-and-error-responses)
6. [Static routes](#static-routes)
7. [Endpoints](#endpoints)
8. [Tables](#tables)
9. [Blob types](#blob-types)
10. [Integrations](#integrations)
11. [Preview resolution order](#preview-resolution-order)
12. [Differences from the Laravel API](#differences-from-the-laravel-api)
13. [Known limitations](#known-limitations)
14. [Related pages](#related-pages)

## Run the server

This section is a summary. For the full procedure, with troubleshooting, see
[Run the local server and dashboard](../how-to/run-local-server.md).

Prerequisites:

- **Node.js 24.** The server runs its `.ts` files directly with `node index.ts`
  (`package.json:7`), so it needs a Node version that runs TypeScript files without flags. CI
  uses Node 24 (`.github/workflows/ci.yml:15`).
- **A clone of the repository**, with dependencies installed. Run `npm install` from the
  repository root. The server needs `@electric-sql/pglite` and `pg` (`package.json:10-14`).
- **Built packages.** Run `npm run build` from the repository root. The dashboard loads
  `./dist/app.js` (`packages/dashboard/index.html:393`) and `/sdk/` serves `packages/sdk/dist`
  (`index.ts:34`). `dist/` is not in git (`.gitignore:2`), so on a fresh clone without a build
  `/dashboard/` is a blank page and `/sdk/` returns `404`.

Run these commands from the repository root.

```bash
npm run seed
npm start
```

| Command | What it runs | Source |
|---|---|---|
| `npm run seed` | `node seed.ts` in `@loupekit/server` | `package.json:8`, root `package.json:26` |
| `npm start` | `node index.ts` in `@loupekit/server` | `package.json:7`, root `package.json:25` |

`npm run seed` creates the demo project. The project key and name are fixed in the script
(`seed.ts:7`, `seed.ts:12`), so the seed script creates only `pk_demo_acme`. The server has no
HTTP endpoint that creates a project. To add another project, follow
[Create another project](../how-to/run-local-server.md#create-another-project), which calls the
same `upsertProject` function the seed script uses.

| Seeded value | Value | Source |
|---|---|---|
| Project key | `pk_demo_acme` | `seed.ts:7` |
| Project name | `Acme Analytics (demo)` | `seed.ts:12` |
| Project secret | `LOUPE_DEMO_SECRET`, or `sk_demo_acme_0f3b9c` | `seed.ts:8` |
| Allowed origins | `["*"]` | `seed.ts:12` |
| Demo user id | `u_92` | `seed.ts:9` |

The seed script prints the admin key and the HMAC for the demo user (`seed.ts:14-16`). With the
default PGlite database, you should see:

```text
[loupe] embedded Postgres (PGlite) at <PG_DIR>
Seeded project: pk_demo_acme
  admin key   (dashboard ?key= / X-Loupe-Admin): sk_demo_acme_0f3b9c
  demo HMAC    (host-app-injected for u_92): <USER_HMAC>
```

- `<PG_DIR>`: the PGlite data directory. See `LOUPE_PG_DIR` below.
- `<USER_HMAC>`: a 64-character hex string, the HMAC of `u_92`.

With `DATABASE_URL` set, the first line is `[loupe] Postgres via DATABASE_URL` instead
(`db.ts:22`, `db.ts:35`). With `LOUPE_DEMO_SECRET` set, the admin key line shows that value.

The seed is an upsert (`seed.ts:12`). Run it again after you change `LOUPE_DEMO_SECRET` and it
updates the stored secret of `pk_demo_acme`.

`npm start` runs the schema migration, then listens (`index.ts:577-582`). You should see the
database line first, then the ready line:

```text
[loupe] embedded Postgres (PGlite) at <PG_DIR>
[loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)
```

Source: `db.ts:35`, `index.ts:585-588`.

To check that the server answers, call the health endpoint:

```bash
curl http://localhost:8787/v1/health
```

You should see:

```json
{"ok":true}
```

Source: `index.ts:123`.

## Environment variables

| Variable | Type | Default | What it does | Source |
|---|---|---|---|---|
| `PORT` | number | `8787` | The port the server listens on. | `index.ts:28` |
| `DATABASE_URL` | Postgres connection string | unset | When set, the server uses a `pg` connection pool and logs `[loupe] Postgres via DATABASE_URL`. When unset, it uses embedded PGlite. | `db.ts:18-24` |
| `LOUPE_PG_DIR` | path | `packages/server/data/pg` | The PGlite data directory. Used only when `DATABASE_URL` is unset. A value that starts with `memory` runs an in-memory database. The server logs `[loupe] embedded Postgres (PGlite) at <dir>`. | `db.ts:26-35` |
| `LOUPE_BLOB_DIR` | path | `packages/server/data/blobs` | Where uploaded screenshots and recordings are written. | `blobs.ts:11` |
| `LOUPE_PUBLIC_URL` | URL | `http://localhost:8787` for blob URLs; unset for deep links | The base of every blob URL the server returns. Also the base of the integration deep link. A trailing slash is removed. | `blobs.ts:12`, `delivery.ts:175` |
| `LOUPE_API_URL` | URL | unset | The deep-link base when `LOUPE_PUBLIC_URL` is unset. | `delivery.ts:175` |
| `LOUPE_BRIDGE_URL` | URL | unset | The agent bridge base URL. When set, the server POSTs thread events to `<LOUPE_BRIDGE_URL>/thread-updates`. When unset, it sends nothing. | `index.ts:94-107` |
| `LOUPE_CREDENTIAL_KEY` | base64 or passphrase | unset | The key that encrypts integration credentials. When unset, you cannot connect or disconnect an integration. | `integrations.ts:223-234`, `credentials.ts:42-63` |
| `LOUPE_DEMO_SECRET` | string | `sk_demo_acme_0f3b9c` | The secret `npm run seed` gives the demo project. Read by the seed script only. | `seed.ts:8` |

### `LOUPE_CREDENTIAL_KEY` formats

The server accepts the key in two forms (`credentials.ts:42-63`):

| Input | Result |
|---|---|
| Base64 that decodes to exactly 32 bytes | Used as the AES-256 key. |
| Base64-shaped text that decodes to another size, with a length divisible by 4 | Rejected: `LOUPE_CREDENTIAL_KEY decodes to <N> bytes; AES-256 needs 32.` |
| Any other text | Treated as a passphrase. The key is its SHA-256 digest. |

Generate a 32-byte key with the command the error message suggests (`credentials.ts:57`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Example:

```bash
LOUPE_CREDENTIAL_KEY="<BASE64_KEY>" LOUPE_PUBLIC_URL="http://localhost:8787" npm start
```

- `<BASE64_KEY>`: the output of the command above.

## Authentication

Every authenticated route resolves a project, then checks the request headers against that
project's secret (`auth.ts:29-43`). A request is accepted in one of two modes:

| Mode | Headers | Accepted when | Source |
|---|---|---|---|
| Admin | `X-Loupe-Admin` | The header equals the project secret. The compare is timing-safe. | `auth.ts:34-35`, `auth.ts:9-13` |
| User | `X-Loupe-User`, `X-Loupe-Hmac` | `X-Loupe-Hmac` equals the hex HMAC-SHA256 of the user id, keyed with the project secret. | `auth.ts:5-7`, `auth.ts:37-41` |

The server checks the admin header first. Some routes accept admin mode only; the
[Endpoints](#endpoints) table marks them.

| Status | Body `error` | When | Source |
|---|---|---|---|
| 400 | `missing projectKey` | The request names no project. | `auth.ts:30` |
| 404 | `unknown project` | No project has that key. | `auth.ts:32` |
| 401 | `invalid or missing credentials` | Neither mode matched. | `auth.ts:42` |
| 403 | `administrators only` | A user-mode request reached an admin-only route. | `index.ts:276`, `index.ts:284`, `index.ts:303` |

Routes under `/v1/comments/<COMMENT_ID>/…` take the project from the stored comment, not from
the request (`index.ts:176-178`, `index.ts:535-537`).

To compute a user HMAC:

```bash
node -e "console.log(require('crypto').createHmac('sha256', process.argv[1]).update(process.argv[2]).digest('hex'))" "<PROJECT_SECRET>" "<USER_ID>"
```

- `<PROJECT_SECRET>`: the project secret, for example `sk_demo_acme_0f3b9c`.
- `<USER_ID>`: the id your host app gives the signed-in person, for example `u_92`.

Example request in user mode:

```bash
curl "http://localhost:8787/v1/comments?projectKey=pk_demo_acme" \
  -H "X-Loupe-User: u_92" \
  -H "X-Loupe-Hmac: <USER_HMAC>"
```

- `<USER_HMAC>`: the output of the HMAC command above.

On a freshly seeded project, you should see an empty array:

```json
[]
```

## CORS

The server sets these headers on every response (`index.ts:41-46`):

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | The request's `Origin` header, or `*` when there is none |
| `Vary` | `Origin` |
| `Access-Control-Allow-Methods` | `GET,POST,PATCH,DELETE,OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, X-Loupe-User, X-Loupe-Hmac, X-Loupe-Admin, X-Loupe-Project` |

An `OPTIONS` request returns `204` with no body (`index.ts:111`). The `allowed_origins` column
of a project is stored but not read by the CORS code, so every origin is reflected.

## Body limits and error responses

| Limit | Value | Applies to | Source |
|---|---|---|---|
| JSON body cap | 12,000,000 characters (12 MB) | Every route that reads a body, except blob upload | `index.ts:54`, `index.ts:56-63` |
| Blob body cap | 60,000,000 characters (60 MB) | `POST /v1/blobs` | `index.ts:55`, `index.ts:486` |

An empty body is read as `{}` (`index.ts:60`). Every API response is JSON with
`Content-Type: application/json`, except a blob download (`index.ts:47-50`).

Any error thrown inside a route returns `500` with `{ "error": "<MESSAGE>" }`
(`index.ts:571-572`). This includes a body over the cap (`payload too large`) and a body that
is not valid JSON. The server does not return `413` or a `400` for these cases.

An unmatched `/v1` route returns `404` with `{ "error": "not found" }` (`index.ts:570`).

## Static routes

A `GET` to a path outside `/v1` is served from disk (`index.ts:117-119`).

| Path | Serves | Source |
|---|---|---|
| `/` | `302` redirect to `/dashboard/` | `index.ts:66` |
| `/dashboard/…` | `packages/dashboard` | `index.ts:32` |
| `/demo/…` | `packages/sdk/demo` | `index.ts:33` |
| `/sdk/…` | `packages/sdk/dist` | `index.ts:34` |

A directory serves its `index.html` (`index.ts:72`). A path that escapes the directory returns
`403` (`index.ts:71`). A missing file returns `404` (`index.ts:73`). Any other non-API `GET`
returns `404` with `{ "error": "not found" }` (`index.ts:119`).

## Endpoints

Auth column values:

- **None**: no headers needed.
- **Any**: admin or user mode.
- **Admin**: admin mode only.

### Health

| Method | Path | Auth | Request | Response | Source |
|---|---|---|---|---|---|
| any | `/v1/health` | None | — | `200 {"ok":true}` | `index.ts:123` |

### Comments

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| GET | `/v1/comments` | Any | Query: `projectKey`, and optional filters `url`, `repo`, `branch`, `status`, `priority`, `changeType`, `kind`, `q` | `200` array of comments, newest first | `index.ts:495-511`, `store.ts:82-106` |
| POST | `/v1/comments` | Any | Body: a comment. See [Comment body fields](#comment-body-fields). | Create or replace. `201` the stored comment. `400 id required`. In user mode, `403 cannot post as another user` when `author.id` is not `X-Loupe-User`. `500` with a database error when a required field is missing. Dispatches `thread_created`, also on a replace. | `index.ts:514-529`, `store.ts:115-147` |
| GET | `/v1/comments/<COMMENT_ID>` | Any | — | `200` the comment. `404 not found`. | `index.ts:532-540` |
| PATCH | `/v1/comments/<COMMENT_ID>` | Any | Body: any of `status`, `priority`, `changeType`, `body`, `title`, `proposal`, `pr` | `200` the updated comment. May dispatch a lifecycle event. | `index.ts:541-563`, `store.ts:149` |
| DELETE | `/v1/comments/<COMMENT_ID>` | Any | — | `204` | `index.ts:564-567` |

Filter behavior in `GET /v1/comments` (`store.ts:88-102`):

- `url` is normalized before the compare.
- `status` also matches the legacy aliases of that status.
- `q` is a case-insensitive substring match on the title and the body.

A PATCH dispatches at most one lifecycle event. The server checks these rules in this order
(`index.ts:548-552`):

1. `pr_created`: the patch sets `pr` and the comment had none.
2. `thread_resolved`: the status becomes `resolved`.
3. `agent_working`: the status becomes `in_progress`.

#### Comment body fields

`POST /v1/comments` takes one comment as JSON. The field names are those of the `Comment` type in
[the shared package reference](./shared.md#index-comment). The server writes these fields
(`store.ts:115-147`):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | string | Yes | — | The comment id. A missing `id` returns `400 id required`. |
| `projectKey` | string | Yes | — | The project. Also used for authentication (`index.ts:516`). |
| `url` | string | Yes | — | The page URL. Stored normalized (`store.ts:117`). A missing `url` is stored as `/undefined`. |
| `body` | string | Yes | — | The reporter's text. Column is `NOT NULL` (`db.ts:66`). |
| `author` | object | Yes | — | `id`, `name`, optional `email`. Column is `NOT NULL` (`db.ts:67`). |
| `anchor` | object | Yes | — | Column is `NOT NULL` (`db.ts:68`). |
| `context` | object | Yes | — | Column is `NOT NULL` (`db.ts:69`). |
| `offset` | object | Yes | — | `{"x":<NUMBER>,"y":<NUMBER>}`. Column is `NOT NULL` (`db.ts:70`). |
| `title` | string | No | none | One-line summary. |
| `status` | string | No | `queue` | See [Field values](#field-values). |
| `priority` | string | No | `medium` | See [Field values](#field-values). |
| `changeType` | string | No | `other` | See [Field values](#field-values). |
| `kind` | string | No | `element` | `element`, `region` or `free` (`packages/shared/src/index.ts:229`, `store.ts:136`). |
| `repo`, `branch` | string | No | none | |
| `region`, `viewport` | object | No | none | |
| `screenshot` | string | No | none | The screenshot URL. Stored in `screenshot_url` (`store.ts:140`). Not `screenshotUrl`. |
| `recording` | string | No | none | The recording URL. Stored in `recording_url` (`store.ts:140`). |
| `attachments` | array | No | none | |
| `proposal` | object | No | none | |
| `pr` | object | No | none | |
| `createdAt` | ISO 8601 string | No | now | Used on insert only. |

A missing required field returns `500` with the database error, for example
`{"error":"null value in column \"body\" of relation \"comments\" violates not-null constraint"}`.

A POST with an `id` that already exists replaces that comment's fields, except `project_key` and
`created_at` (`store.ts:121-130`). It also dispatches `thread_created` again (`index.ts:522`).

#### Field values

| Field | Allowed values | Default | Unknown value | Source |
|---|---|---|---|---|
| `status` | `queue`, `todo`, `in_progress`, `in_review`, `resolved`. Legacy aliases: `open` becomes `queue`, `done` becomes `resolved`. | `queue` | Becomes `queue` | `packages/shared/src/index.ts:33`, `packages/shared/src/index.ts:49-66` |
| `priority` | `critical`, `high`, `medium`, `low` | `medium` | Becomes `medium` | `packages/shared/src/index.ts:93`, `packages/shared/src/index.ts:129-138` |
| `changeType` | `frontend`, `backend`, `api`, `other` | `other` | Becomes `other` | `packages/shared/src/index.ts:118`, `packages/shared/src/index.ts:130`, `packages/shared/src/index.ts:141-146` |
| `kind` | `element`, `region`, `free` | `element` | Stored as sent | `packages/shared/src/index.ts:229`, `db.ts:77`, `store.ts:136` |

The same rules apply to `PATCH` (`store.ts:154-156`) and to the `GET` filters (`store.ts:92-94`).

### Thread messages, participants and reactions

`<COMMENT_ID>` is the thread id. All routes return `404` when the comment does not exist.

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| GET | `/v1/comments/<COMMENT_ID>/messages` | Any | Query: `includeDeleted=1` to include soft-deleted replies | `200` array of replies, oldest first. The comment body is not in the array. | `index.ts:181-185`, `messages.ts:33-44` |
| POST | `/v1/comments/<COMMENT_ID>/messages` | Any | Body: `body`, `author` (`id`, `name`, `email`, `type`), optional `attachments` | `201` the message plus `mentions` (user ids) and `unknownMentions`. `400 body is required`. `400 author.id is required`. | `index.ts:187-242` |
| DELETE | `/v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>` | Any | — | `200 {"ok":true,"message":…}`. `404 {"ok":false}` when the message is unknown or already deleted. Soft delete. | `index.ts:256-268`, `messages.ts:122-131` |
| GET | `/v1/comments/<COMMENT_ID>/participants` | Any | — | `200` array. The comment author is included. | `index.ts:244-254` |
| GET | `/v1/comments/<COMMENT_ID>/reactions` | Any | Query: optional `viewer`, accepted and ignored (`reactions.ts:76-78`) | `200 {"reactions":[…]}`, oldest first. `404 comment not found`. | `index.ts:389-397`, `reactions.ts:69-80` |
| GET | `/v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>/reactions` | Any | Query: optional `viewer`, accepted and ignored | `200 {"reactions":[…]}` for the whole thread | `index.ts:413-416` |
| POST | `/v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>/reactions` | Any | Body: `emoji`, optional `userId`, `userName` | `200 {"on":<BOOLEAN>,"reactions":[…]}`. `400 emoji is required`. `400 emoji is not an emoji` (over 4 code points). `400 userId is required`. | `index.ts:417-428` |
| other | `/v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>/reactions` | Any | — | `405 method not allowed`, only after the message check passes | `index.ts:429` |

Message details:

- `author.type` is `agent`, `guest` or `user`. Any other value becomes `user`, and a missing
  name becomes `Unknown` (`index.ts:191-198`).
- Each `@mention` that matches a known person creates a `mention` notification for that person.
  The author is never notified about their own reply (`index.ts:208-219`).
- When `LOUPE_BRIDGE_URL` is set, a new message and a deleted message are relayed to the bridge.
  See [Bridge events](#bridge-events).
- A message from an author with `type: "agent"` dispatches `agent_replied` (`index.ts:230-235`).
  The agent's name does not reach the integration message. See
  [Lifecycle events](#lifecycle-events).

#### Bridge events

When `LOUPE_BRIDGE_URL` is set, the server sends one request per event (`index.ts:94-107`):

```http
POST <LOUPE_BRIDGE_URL>/thread-updates
Content-Type: application/json

{"threadId":"<COMMENT_ID>","eventType":"<EVENT_TYPE>","data":{…}}
```

| Trigger | `eventType` | `data` | Source |
|---|---|---|---|
| A reply is posted | `message_added` | `{"messageId":"<MESSAGE_ID>","author":"<AUTHOR_NAME>"}` | `index.ts:223-226`, `packages/shared/src/thread.ts:135` |
| A reply is deleted | `message_deleted` | `{"messageId":"<MESSAGE_ID>"}` | `index.ts:264`, `packages/shared/src/thread.ts:137` |

A trailing slash on `LOUPE_BRIDGE_URL` is removed. The request times out after 1 second. The
server ignores every error and every response, and it does not retry.

Reaction details:

- A message reaction route returns `404 message not found` unless `<MESSAGE_ID>` is a stored
  reply that has not been deleted. The check lists replies without soft-deleted ones
  (`index.ts:410-411`, `messages.ts:43-46`).
- The checks run in this order: `404 comment not found`, then authentication, then
  `404 message not found`, then the method (`405`) (`index.ts:403-429`).
- The emoji is not checked against `/v1/reactions/allowed`. The only check is a length of at most
  4 code points (`index.ts:421`).
- `userId` falls back to the `X-Loupe-User` header (`index.ts:422`).
- A POST toggles the reaction: it removes an existing row, or adds one (`reactions.ts:40-66`).

### Notifications, people and reactions list

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| GET | `/v1/notifications` | Any | Query: `projectKey`, `recipient` (falls back to `X-Loupe-User`), optional `unread=1` | `200 {"notifications":[…],"unread":<COUNT>}`. At most 100, newest first. `400 recipient is required`. | `index.ts:433-443`, `notifications.ts:88-100` |
| POST | `/v1/notifications/read` | Any | Body: `projectKey`, optional `recipient` and `id` | `200 {"marked":<COUNT>}`. Without `id`, marks all. `400 recipient is required`. | `index.ts:444-451`, `notifications.ts:116` |
| GET | `/v1/people` | Any | Query: `projectKey` | `200` array of people who wrote a comment or a reply | `index.ts:457-461`, `notifications.ts:47-62` |
| GET | `/v1/reactions/allowed` | None | — | `200 {"choices":["👍","🎉","👀","🙏","❤️","🚀"]}` | `index.ts:453-455`, `packages/shared/src/reactions.ts:20` |

### Blobs

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| POST | `/v1/blobs` | Any | Body: `projectKey` (or the `X-Loupe-Project` header) and `data`, a `data:` URL | `201 {"url":"<LOUPE_PUBLIC_URL>/v1/blobs/<UUID>.<EXT>"}`. `400 data (data URL) required`. | `index.ts:485-492`, `blobs.ts:46-51` |
| GET | `/v1/blobs/<BLOB_ID>` | None | — | `200` the file, with `Cache-Control: public, max-age=31536000, immutable`. `404 not found`. | `index.ts:475-482` |

### Working branches and repo URLs

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| POST | `/v1/working-branches` | Any | Body: `projectKey`, `repo`, `branch`, and other branch fields | `201` the upserted branch. `400 repo and branch are required`. | `index.ts:126-132` |
| GET | `/v1/working-branches` | Any | Query: `projectKey`, optional `repo` | `200` array | `index.ts:133-137` |
| DELETE | `/v1/working-branches` | Any | Query: `projectKey`, `repo`, `branch` | `200 {"ok":<BOOLEAN>}`. `400 repo and branch are required`. | `index.ts:138-145` |
| POST | `/v1/repo-urls` | Any | Body: `projectKey`, `repo`, `pattern`, optional `environment` (default `staging`) | `201` the stored pattern. `400 repo and pattern are required`. | `index.ts:148-157` |
| GET | `/v1/repo-urls` | Any | Query: `projectKey`, optional `repo` | `200` array | `index.ts:158-162` |
| DELETE | `/v1/repo-urls/<REPO_URL_ID>` | Any | Query: `projectKey` | `200 {"ok":<BOOLEAN>}` | `index.ts:163-168` |
| GET | `/v1/preview` | Any | Query: `projectKey`, `repo`, `branch`, optional `pr` | `200` a preview lookup. `400 repo and branch are required`. | `index.ts:464-472` |

### Integrations

All integration routes take `projectKey` from the query string, including on POST
(`index.ts:298-301`).

| Method | Path | Auth | Request | Response and errors | Source |
|---|---|---|---|---|---|
| GET | `/v1/integrations` | Admin | Query: `projectKey` | `200 {"integrations":[…]}`, one summary per provider. See [Integration summary fields](#integration-summary-fields). | `index.ts:273-278`, `integrations.ts:320-332` |
| GET | `/v1/integrations/deliveries` | Admin | Query: `projectKey`, optional `provider`, `limit` (default 50) | `200 {"deliveries":[…]}`, newest first. See [Delivery fields](#delivery-fields). | `index.ts:281-289`, `integrations.ts:403-423` |
| POST | `/v1/integrations/<PROVIDER>/config` | Admin | Body: `{"credentials":{…}}` | `201 {"ok":true,"identity","targets","hint","credentials":{"set":true,"fields":[…]}}`. See errors below. | `index.ts:307-336` |
| POST | `/v1/integrations/<PROVIDER>/test` | Admin | Body: optional `{"credentials":{…}}` | `200` or `400` with the connection test result. `400 nothing to test — connect first`. | `index.ts:338-355` |
| DELETE | `/v1/integrations/<PROVIDER>` | Admin | — | `200 {"ok":<BOOLEAN>}`. `400 no credential key configured`. | `index.ts:357-360` |
| GET | `/v1/integrations/<PROVIDER>/mappings` | Admin | — | `200 {"mappings":[…]}` | `index.ts:363-365` |
| POST | `/v1/integrations/<PROVIDER>/mappings` | Admin | Body: `repo`, `targetId`, optional `targetName` | `201` the mapping. `400 repo and targetId are required`. `400 connect the integration before mapping it`. | `index.ts:367-376` |
| DELETE | `/v1/integrations/<PROVIDER>/mappings/<REPO>` | Admin | — | `200 {"ok":<BOOLEAN>}` | `index.ts:378-381` |

`<PROVIDER>` is `slack` or `telegram`. An unknown provider returns
`404 unknown integration provider <PROVIDER>` (`index.ts:296`). Any other method or path under a
known provider returns `404 no route for <METHOD> <PATH>` (`index.ts:383`).

`POST …/config` errors, in the order the server checks them (`index.ts:310-326`):

1. `400 <FIELD> is required`, for a required credential field that is missing or blank.
2. `400 No credential key is configured. Set LOUPE_CREDENTIAL_KEY before connecting an integration — credentials are not stored unencrypted.`
3. `400 {"ok":false,"error":…,"hint":…}`, when the provider rejects the credentials.

The server tests credentials before it stores them. The response never contains a credential
value (`index.ts:321-335`, `credentials.ts:132-134`).

Example: connect Slack.

```bash
curl -X POST "http://localhost:8787/v1/integrations/slack/config?projectKey=pk_demo_acme" \
  -H "Content-Type: application/json" \
  -H "X-Loupe-Admin: <PROJECT_SECRET>" \
  -d '{"credentials":{"botToken":"<SLACK_BOT_TOKEN>"}}'
```

- `<PROJECT_SECRET>`: the project secret.
- `<SLACK_BOT_TOKEN>`: a Slack Bot User OAuth token that starts with `xoxb-`.

When Slack accepts the token, you should see `201` and a body like this (`index.ts:328-335`):

```json
{"ok":true,"identity":"<TEAM> · <USER>","targets":[{"id":"<CHANNEL_ID>","name":"#<CHANNEL_NAME>"}],"credentials":{"set":true,"fields":["botToken"]}}
```

The body also carries `hint` when the channel list failed. See [Slack](#slack).

#### Integration summary fields

Each item of `GET /v1/integrations` has these fields (`integrations.ts:320-332`):

| Field | Type | Meaning |
|---|---|---|
| `provider` | string | The provider id, `slack` or `telegram`. |
| `label` | string | The display name. |
| `blurb` | string | One line for the settings card. |
| `fields` | array | The credential inputs. See [Adapter contract](#adapter-contract). |
| `connected` | boolean | Whether a stored integration exists for this project. |
| `credential` | object | `set`, `fields` (the credential field names, never their values) and `updatedAt` (`credentials.ts:132-134`). Absent when not connected, or when `LOUPE_CREDENTIAL_KEY` is unset. |
| `identity` | string | The account the credentials belong to, for example `<TEAM> · <USER>`. |
| `status` | string | `not_connected`, `connected` or `error`. |
| `lastError` | string | The last stored error, when there is one. |
| `storable` | boolean | Whether `LOUPE_CREDENTIAL_KEY` is set, so credentials can be saved. |
| `mappings` | array | The mappings for this provider. Each has `id`, `provider`, `repo`, `targetId`, `targetName` (`integrations.ts:371-373`). |

#### Delivery fields

Each item of `GET /v1/integrations/deliveries` has these fields (`integrations.ts:411-422`):

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The delivery id, prefixed `dl_`. |
| `provider` | string | `slack` or `telegram`. |
| `event` | string | Always `lifecycle`. The event name is not stored (`delivery.ts:153`). |
| `target` | string | The target name, for example `#<CHANNEL_NAME>`. |
| `threadId` | string | The comment id. |
| `status` | string | `ok` or `failed`. The type also allows `skipped`, but skipped outcomes are not written. |
| `httpStatus` | number or null | The provider's HTTP status from the last try. |
| `attempts` | number | How many sends were tried, 1 to 3. |
| `lastError` | string | The error, with secrets removed, cut to 500 characters. |
| `createdAt` | ISO 8601 string | When the row was written. |

## Tables

The server creates these tables on startup. The migration is idempotent (`db.ts:44-234`).

| Table | Holds | Key | Source |
|---|---|---|---|
| `projects` | Project key, name, secret, `allowed_origins` | `project_key` | `db.ts:48-54` |
| `comments` | Threads: page URL, status, priority, change type, repo, branch, body, author, anchor, context, offset, screenshot URL. Added later: `kind`, `region`, `viewport`, `recording_url`, `proposal`, `title`, `attachments`, `pr`, `parent_thread_id`, `iteration_type`, `iteration_number`. | `id` | `db.ts:57-97`, `db.ts:129-131` |
| `working_branches` | The branch that collects a repo's fixes, its PR and preview URL, fix count | `id` | `db.ts:99-116` |
| `repo_urls` | URL patterns per repo and environment | `id` | `db.ts:118-127` |
| `thread_messages` | Replies, with `deleted_at` for soft delete | `id` | `db.ts:134-147` |
| `thread_participants` | Who took part in each thread | `(thread_id, author_id)` | `db.ts:150-161` |
| `integrations` | One row per project and provider. Credentials are in `sealed` only; `credentials` stays `{}`. | `id`, unique `(project_key, provider)` | `db.ts:164-176` |
| `integration_mappings` | Which target receives which repo | `id`, unique `(project_key, provider, repo)` | `db.ts:177-186` |
| `integration_deliveries` | One row per target per event, written after retries, with the number of attempts. Skipped deliveries are not written. | `id` | `db.ts:189-202` |
| `notifications` | In-app notifications and read state | `id` | `db.ts:204-215` |
| `reactions` | One row per message, emoji and person | `(thread_id, message_id, emoji, user_id)` | `db.ts:218-227` |

On every start, the migration rewrites status `open` to `queue` and `done` to `resolved`
(`db.ts:232-233`).

## Blob types

The server picks the file extension from the MIME type of the uploaded `data:` URL
(`blobs.ts:18-32`). It picks the `Content-Type` of a download from the extension in the id
(`blobs.ts:36-39`).

| Extension | Content-Type |
|---|---|
| `png` | `image/png` |
| `jpg`, `jpeg` | `image/jpeg` |
| `webp` | `image/webp` |
| `gif` | `image/gif` |
| `webm` | `video/webm` |
| `mp4` | `video/mp4` |
| `mov` | `video/quicktime` |
| `heic` | `image/heic` |
| `heif` | `image/heif` |

An unknown MIME type is stored as `png` (`blobs.ts:32`). A blob id with no extension is read as
`.png` (`blobs.ts:55`).

## Integrations

An integration sends thread lifecycle events to a chat tool. The server ships two providers,
Slack and Telegram, and registers them in one registry per process
(`providers/index.ts:14-20`).

### Adapter contract

A provider implements `IntegrationProvider` (`integrations.ts:96-111`):

| Member | Type | What it does |
|---|---|---|
| `id` | string | The provider id used in routes. Registration fails without one (`integrations.ts:145`). |
| `label` | string | The display name. |
| `blurb` | string | One line for the settings card. |
| `fields` | `CredentialField[]` | The credential inputs: `key`, `label`, optional `hint`, optional `required` (`integrations.ts:21-27`). |
| `test(credentials, transport)` | `Promise<ConnectionTest>` | Checks the credentials. Returns `ok`, and optional `identity`, `targets`, `error`, `hint` (`integrations.ts:37-51`). |
| `render(event, payload, target)` | `IntegrationMessage \| null` | Builds the message for one event, or `null` to send nothing. A message has `text`, and optional `deepLink`, `imageUrl`, `threadId` (`integrations.ts:62-71`). |
| `send(credentials, target, message, transport)` | `Promise<SendResult>` | Sends the message. Returns `ok`, and optional `httpStatus`, `error` (`integrations.ts:73-77`). |

A target is a place a message can go. It has `id`, `name` and an optional `note`
(`integrations.ts:30-35`). The registry lists providers sorted by id (`integrations.ts:154-156`).

### Lifecycle events

| Event | When the server dispatches it | Source |
|---|---|---|
| `thread_created` | `POST /v1/comments` succeeds. | `index.ts:522` |
| `pr_created` | A PATCH sets `pr` on a comment that had none. | `index.ts:549` |
| `thread_resolved` | A PATCH changes the status to `resolved`. | `index.ts:550` |
| `agent_working` | A PATCH changes the status to `in_progress`. | `index.ts:551` |
| `agent_replied` | A reply is posted with `author.type` `agent`. | `index.ts:230-235` |

The server builds the payload with `lifecyclePayload` (`delivery.ts:171-188`). It copies only
these fields from the comment: `threadId`, `title`, `body`, `status`, `priority`, `pageUrl`,
`screenshotUrl` and `pr`, and adds `deepLink`. Which of them have a value depends on the event:

| Event | Fields sent | Source |
|---|---|---|
| `thread_created` | `threadId`, `title`, `body`, `status`, `priority`, `pageUrl`, `screenshotUrl`, `deepLink` | `index.ts:522-527` |
| `pr_created`, `thread_resolved`, `agent_working` | The same, plus `pr` | `index.ts:554-559` |
| `agent_replied` | `threadId`, `title`, `body` (the reply text), `status`, `pageUrl`, `deepLink` | `index.ts:231-234` |

`pageUrl` is the page URL as stored on the comment, which is normalized (`store.ts:117`).

> **Note:** The `LifecyclePayload` type also declares `agent`, `author` and `repo`
> (`integrations.ts:117-133`). In 0.14.1 none of them is populated. Every call site passes `agent`
> and `repo` inside the first argument of `lifecyclePayload`, which copies only the fields listed
> above, and nothing sets `author` (`index.ts:233`, `index.ts:526`, `index.ts:558`). As a result:
>
> - Slack and Telegram messages always say `The agent replied` and `An agent is working on`,
>   never the agent's name (`providers/slack.ts:149`, `providers/slack.ts:167`,
>   `providers/telegram.ts:121`, `providers/telegram.ts:131`).
> - Repo-based routing has no effect. See [Routing rules](#routing-rules).

The deep link is `<BASE>/dashboard/?comment=<COMMENT_ID>`, where `<BASE>` is `LOUPE_PUBLIC_URL`,
else `LOUPE_API_URL`. With neither set, the payload has no deep link (`delivery.ts:175-185`).

### Routing rules

A mapping connects a repo to a target for one provider. `targetsFor` picks the mappings for a
thread (`integrations.ts:393-399`):

| Thread | Receives |
|---|---|
| Has no repo | Every mapping for the provider |
| Has a repo with an exact mapping | The exact mappings only |
| Has a repo with no exact mapping | The mappings whose repo is `*` |

> **Warning:** In 0.14.1 the payload never carries `repo` (see
> [Lifecycle events](#lifecycle-events)), so `dispatch` always calls `targetsFor` with no repo
> (`delivery.ts:104`). Every event therefore goes to every mapping for the provider. Only the
> first row of the table applies. The exact-mapping and `*` rows never apply on this server.

### Delivery semantics

- Dispatch is fire and forget. A request does not wait for delivery
  (`delivery.ts:197-204`).
- The server skips a provider that has no stored integration (`delivery.ts:94-95`).
- An integration in the `error` state is skipped, with its last error as the reason
  (`delivery.ts:97-101`).
- A provider with no mappings is skipped with `no mapping for this repo`
  (`delivery.ts:103-107`). Because every event reaches every mapping (see
  [Routing rules](#routing-rules)), this happens only when the provider has zero mappings.
- A `render` that returns `null` is skipped (`delivery.ts:112-116`).
- A send is tried up to 3 times. The waits between tries are 1,000 ms and 4,000 ms. A non-2xx
  result and a thrown error are both retried (`delivery.ts:27`, `delivery.ts:46-68`).
- A timed-out send is recorded as `timeout after 10000ms` (`delivery.ts:28`, `delivery.ts:64`).
  Each provider call has a 10-second timeout (`providers/slack.ts:61`,
  `providers/telegram.ts:47`).
- An error that matches `invalid_auth`, `token_revoked`, `Unauthorized` or `account_inactive`
  puts the integration in the `error` state (`delivery.ts:135-137`). The stored error is cut to
  500 characters (`integrations.ts:337-341`).
- A successful `POST …/test` without new credentials clears the error (`index.ts:350-353`).
- Each send writes one row to `integration_deliveries`, per target per event, after all its
  retries. The row holds the number of attempts, and its `event` is always `lifecycle`. Secrets
  are removed from the error, and the error is cut to 500 characters (`delivery.ts:118-138`,
  `delivery.ts:144-162`, `credentials.ts:143-156`).
- Skipped deliveries are not written: no stored integration, the `error` state, no mapping, and a
  `render` that returns `null` all stop before the record step (`delivery.ts:93-116`). If a
  message did not arrive and `GET /v1/integrations/deliveries` has no row for it, it was
  skipped.
- If stored credentials cannot be decrypted, the integration reports
  `Stored credentials could not be decrypted — reconnect the integration.`
  (`integrations.ts:276`).

### Slack

| Property | Value | Source |
|---|---|---|
| Provider id | `slack` | `providers/slack.ts:82` |
| Field `botToken` | Required. Label: `Bot User OAuth token`. Hint: `Starts with xoxb-. Needs chat:write, channels:read (and groups:read for private channels).` | `providers/slack.ts:85-92` |
| Test | Calls `auth.test`, then `conversations.list` for public and private channels, limit 200, archived excluded. Channels become targets named `#<name>`. | `providers/slack.ts:94-131` |
| Identity | `<team> · <user>`. When Slack returns no `team`, `workspace` is used instead. When it returns no `user`, the ` · <user>` part is left out. | `providers/slack.ts:127` |
| Send | `chat.postMessage` with `text`, `unfurl_links: false`. A screenshot is attached as `attachments[].image_url`. | `providers/slack.ts:176-196` |

If the channel list fails, the connection still succeeds and the hint explains the failure
(`providers/slack.ts:118-123`).

Slack error hints (`providers/slack.ts:23-44`):

| Slack error | Hint |
|---|---|
| `not_in_channel` | The bot is not in that channel. In Slack, open the channel → Integrations → Add apps, and add your Loupe bot. |
| `missing_scope` | When a message send or `auth.test` fails: `The bot token is missing a required scope. Add it in the app's OAuth settings and reinstall the app.` When the channel list fails during the test: `The bot token is missing a scope. Add channels:read to the app's OAuth scopes and reinstall it.` (`providers/slack.ts:27-30`, `providers/slack.ts:122`) |
| `invalid_auth`, `token_revoked`, `account_inactive` | Slack rejected the token. Reinstall the app, or check you copied the Bot User OAuth token (it starts with xoxb-). |
| `channel_not_found` | That channel no longer exists, or the bot cannot see it. Re-run Test connection and pick a channel from the list. |
| `is_archived` | That channel is archived. Pick a live one. |
| `msg_too_long` | The message was too long for Slack. |

With no `error` in the body, HTTP `401` maps to `invalid_auth`, `403` to `missing_scope` and
`429` to `rate_limited` (`providers/slack.ts:73-79`).

### Telegram

| Property | Value | Source |
|---|---|---|
| Provider id | `telegram` | `providers/telegram.ts:66` |
| Field `botToken` | Required. Label: `Bot token`. Hint: `From @BotFather, in the form 123456789:AA…` | `providers/telegram.ts:69-76` |
| Test | Calls `getMe`, then `getUpdates`. Chats the bot has seen become targets. | `providers/telegram.ts:78-108` |
| Identity | `@<username>`, else the bot's first name | `providers/telegram.ts:102` |
| Send | `sendMessage` with `chat_id` and `text`, as plain text with no parse mode | `providers/telegram.ts:145-167` |

Telegram lists a chat only after the bot has seen a message in it. If no chat appears, send the
bot a message or add it to a group, then run the test again (`providers/telegram.ts:104-106`).
A Telegram message puts the page URL, screenshot URL and deep link on their own lines
(`providers/telegram.ts:138-140`).

Telegram error hints (`providers/telegram.ts:26-44`):

| Telegram error | Hint |
|---|---|
| `Unauthorized`, `Not Found` | Telegram rejected the bot token. Check you copied the whole token from @BotFather, including the digits, colon and letters. |
| `chat not found` | Telegram cannot see that chat. Send the bot a message first, or add it to the group, then run Test connection again. |
| `bot was blocked by the user` | The person blocked the bot. Unblock it in Telegram, or pick a different chat. |
| `bot is not a member of the chat` | The bot needs to be added to that group before it can post there. |
| `message is too long` | The message was too long for Telegram. |
| `Too Many Requests` | Telegram is rate-limiting this bot. Try again in a moment. |

With no `description` in the body, HTTP `401` maps to `Unauthorized` and `429` to
`Too Many Requests` (`providers/telegram.ts:58-63`).

## Preview resolution order

`GET /v1/preview` answers whether a deployed preview exists for a branch
(`branches.ts:207-259`). The server builds a list of candidate URLs in this order:

1. The preview URL stored on the working branch.
2. Each repo URL pattern, expanded with `{owner}`, `{name}`, `{repo}`, `{branch}` and `{pr}`.
   Patterns are sorted by environment name: `preview` or `pr-` first, then `stag`, then `dev`
   or `test`, then the rest (`branches.ts:262-268`). A pattern with a placeholder that has no
   value is skipped (`packages/shared/src/preview.ts:77-99`).
3. The GitHub Pages preview, when a PR number is known
   (`packages/shared/src/preview.ts:109-117`). `<OWNER>` is lowercased in the host:
   - For a repo named `<OWNER>.github.io` (compared case-insensitively):
     `https://<OWNER>.github.io/pr-preview/pr-<PR>/`, with no `<NAME>` segment.
   - For any other repo: `https://<OWNER>.github.io/<NAME>/pr-preview/pr-<PR>/`.

The PR number comes from the `pr` query parameter, else from the working branch
(`branches.ts:215`). Duplicate URLs are dropped.

The server probes each candidate in order with `HEAD`, and with `GET` when the host answers
`405` or `501`. It follows redirects and waits up to 5 seconds (`branches.ts:181-198`). The
first URL that answers 2xx wins.

| Field | Type | Meaning |
|---|---|---|
| `status` | `ready` or `not_ready` | Whether a candidate answered |
| `url` | string | The live URL, when `ready` |
| `candidates` | string array | Every URL tried, in order |
| `reason` | string | A sentence for a person or an agent |

Source: `branches.ts:170-176`.

Example: register a staging pattern, then look up a preview.

```bash
curl -X POST "http://localhost:8787/v1/repo-urls" \
  -H "Content-Type: application/json" \
  -H "X-Loupe-Admin: <PROJECT_SECRET>" \
  -d '{"projectKey":"pk_demo_acme","repo":"acme/shop","environment":"staging","pattern":"https://{branch}.shop.example.com/"}'

curl "http://localhost:8787/v1/preview?projectKey=pk_demo_acme&repo=acme/shop&branch=<BRANCH>" \
  -H "X-Loupe-Admin: <PROJECT_SECRET>"
```

- `<PROJECT_SECRET>`: the project secret.
- `<BRANCH>`: the branch name to look up.

The first request returns `201` and the stored pattern:

```json
{"id":"pk_demo_acme:acme/shop:staging","projectKey":"pk_demo_acme","repo":"acme/shop","environment":"staging","pattern":"https://{branch}.shop.example.com/"}
```

When no candidate answers, the second request returns `200` with `not_ready`
(`branches.ts:251-258`):

```json
{"status":"not_ready","candidates":["https://<BRANCH>.shop.example.com/"],"reason":"A preview for `acme/shop`@`<BRANCH>` is not up yet. Tried 1 URL: https://<BRANCH>.shop.example.com/.\n\nDeployments take a while — try again shortly rather than guessing a different URL."}
```

## Differences from the Laravel API

The Laravel package serves the same widget API from your own app. The two route sets overlap but
are not the same.

### Laravel only

These routes exist only in Laravel (`packages/laravel/routes/loupe.php`):

| Route | Laravel | Local server | Effect on the SDK |
|---|---|---|---|
| `GET v1/org` | Yes (`loupe.php:34`) | No | `getOrg()` gets `404` and returns `null` (`packages/sdk/src/http-adapter.ts:166-169`). |
| `GET v1/activity` | Yes (`loupe.php:35`) | No | `listActivity()` gets `404` and returns `null` (`packages/sdk/src/http-adapter.ts:179-184`). |
| `POST v1/hub/inbound` | Yes (`loupe.php:22-24`) | No | Not used by the SDK. |

### Local server only

These routes exist only on the local server. The Laravel routes file has no route for them
(`packages/laravel/routes/loupe.php:18-42`):

| Route | Local server source |
|---|---|
| `/v1/health` | `index.ts:123` |
| `GET v1/comments/<COMMENT_ID>` | `index.ts:540` |
| `DELETE v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>` | `index.ts:256-268` |
| `GET v1/comments/<COMMENT_ID>/participants` | `index.ts:244-254` |
| `GET v1/comments/<COMMENT_ID>/messages/<MESSAGE_ID>/reactions` | `index.ts:413-416` |
| `GET v1/reactions/allowed` | `index.ts:453-455` |
| `POST`, `GET`, `DELETE v1/working-branches` | `index.ts:126-145` |
| `POST`, `GET v1/repo-urls`, `DELETE v1/repo-urls/<REPO_URL_ID>` | `index.ts:148-168` |
| `GET v1/preview` | `index.ts:464-472` |
| Every route under `v1/integrations` | `index.ts:273-384` |

Laravel authenticates through your app's middleware, not through `X-Loupe-Admin` or
`X-Loupe-Hmac` (`loupe.php:27`, `loupe.php:46`). See [Laravel install](../how-to/laravel-install.md)
and [Laravel authorization](../how-to/laravel-authorize.md).

## Known limitations

These are behaviors of version 0.14.1, stated so you do not depend on them.

- `GET /v1/integrations/deliveries` is not filtered by project. It returns rows for every
  project, and rows are written with an empty `project_key` (`integrations.ts:403-410`,
  `delivery.ts:146-149`, `db.ts:192`).
- You cannot react to the comment body itself, or to a deleted reply. The reaction route accepts
  stored replies that have not been deleted (`index.ts:410-411`, `messages.ts:43-46`).
- Repo-based routing has no effect: every lifecycle event goes to every mapping for the provider.
  The payload never carries `repo`, `agent` or `author`, so messages never name the agent
  (`delivery.ts:171-188`, `index.ts:231-234`, `integrations.ts:393-399`).
- `POST /v1/comments` is create or replace. It does not check the project or the author of an
  existing comment with that `id`, so any caller with access to a project can overwrite any
  comment by its id (`store.ts:121-130`, `index.ts:514-520`).
- The reaction emoji is not checked against `/v1/reactions/allowed`, only for a length of at most
  4 code points (`index.ts:421`).
- The `viewer` query parameter of the reaction routes is accepted and ignored
  (`reactions.ts:76-78`).
- The `not_ready` reason for a repo with no patterns mentions `add_repo_url`. On this server,
  register a pattern with `POST /v1/repo-urls` (`branches.ts:239-241`).
- An oversized body or invalid JSON returns `500`, not `413` or `400` (`index.ts:59-60`,
  `index.ts:571-572`).
- `POST /v1/comments/<COMMENT_ID>/messages` does not check `author.id` against `X-Loupe-User`
  (`index.ts:187-198`). `POST /v1/comments` does (`index.ts:519`).
- The reaction toggle does not check `userId` against `X-Loupe-User` in user mode, so a user can
  toggle another person's reaction (`index.ts:422`).
- `allowed_origins` is stored but not enforced (`db.ts:52`, `index.ts:41-46`).

## Related pages

- [Run the local server and dashboard](../how-to/run-local-server.md)
- [@loupekit/shared reference](./shared.md), for the `Comment`, `ThreadMessage` and status types
- [SDK reference](./sdk.md)
- [Browser extension reference](./extension.md)
- [Run your first comment locally](../tutorials/first-comment-local.md)
