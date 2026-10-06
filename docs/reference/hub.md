# Loupe Hub reference

This page lists the wire contract, settings, limits and storage of Loupe Hub, version 0.14.0.
Loupe Hub is the server that holds organizations and projects, verifies signed tickets from
Loupe installs, and forwards them to another project or to an external webhook. This page is
the canonical home of these facts; other pages link here.

Each table has a **Source** column. It gives the file and line in the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe) that defines the fact. All
paths are relative to `packages/hub/` unless they start with `packages/` or another top-level
folder.

Hub is not published to npm (`"private": true`, `package.json:4`). You run it from a checkout of
the repository with Node 24, which runs the TypeScript files directly.

**Prerequisites.** Node 24. From the repository root, run `npm install` once: the root
`package.json` lists `packages/hub` as a workspace (`package.json:11-19` at the root), and Hub
needs its dependencies `@electric-sql/pglite`, `google-auth-library` and `pg`
(`package.json:12-16`). Run every command on this page from the repository root.

> **Unreleased.** Two behaviours on this page are in the `[Unreleased]` section of
> `CHANGELOG.md:10-26`, not in 0.14.0: the [private-address refusal](#private-address-refusal)
> and the same-origin pinning and update-time re-check of [`reply_url`](#reply_url-rules). Each
> is marked **Unreleased** where it appears.

## Contents

1. [Terms](#terms)
2. [Commands](#commands)
3. [Environment variables](#environment-variables)
4. [Identifiers and secrets](#identifiers-and-secrets)
5. [Signing](#signing)
6. [Request headers](#request-headers)
7. [Routing order](#routing-order)
8. [Endpoints](#endpoints)
9. [Outbound delivery](#outbound-delivery)
10. [Payloads](#payloads)
11. [reply_url rules](#reply_url-rules)
12. [Private-address refusal](#private-address-refusal)
13. [Body caps](#body-caps)
14. [Dashboard routes and permissions](#dashboard-routes-and-permissions)
15. [Session cookie](#session-cookie)
16. [Database schema](#database-schema)
17. [Limits](#limits)
18. [Related pages](#related-pages)

## Terms

| Term | Meaning | Source |
|---|---|---|
| Ticket | A comment that a Loupe install sends to Hub with `POST /v1/issues`. | `index.ts:196-227` |
| Owner, member | The two roles a person can hold in an organization. Only an owner can change the organization or its projects; a member can view them. | `store.ts:4`, `index.ts:358-360` |
| Allowed domain | An optional email domain of an organization. A person whose email domain equals it may submit tickets without an explicit membership. | `store.ts:147-155` |
| Inbound URL | The endpoint where a project's app receives tickets and updates from other projects. For the Laravel package it is `POST /<LOUPE_PATH>/v1/hub/inbound`. | `store.ts:28-29`, `packages/laravel/routes/loupe.php:22` |
| Destination project | The project, in the same organization, that receives this project's tickets. It must have an inbound URL. | `store.ts:30-31`, `store.ts:202-213` |
| Update | A status change or a reply that one project sends about a ticket it shares with another project, through `POST /v1/issues/{id}/updates`. This is Hub's two-way sync. | `index.ts:278-314` |
| `<LOUPE_PATH>` | The Laravel package's route prefix: config key `loupe.path`, env `LOUPE_PATH`, default `loupe`. | `packages/laravel/config/loupe.php:24` |
| PGlite | An embedded Postgres that runs inside the Node process and stores its data in a directory. Hub uses it when `DATABASE_URL` is unset. | `db.ts:25-34` |
| Caddy | The web server the deploy scripts install in front of Hub. It serves HTTPS and proxies to `127.0.0.1:8790`. | `deploy/Caddyfile:1-9` |
| gcloud configuration | A named set of Google Cloud CLI settings. The deploy scripts select one with `CLOUDSDK_ACTIVE_CONFIG_NAME`, so they do not change your default configuration. | `deploy/provision.sh:20` |

For how these fit together, see [How Loupe Hub works](../explanation/hub.md#concepts).

## Commands

| Command | Arguments | Defaults | Output | Source |
|---|---|---|---|---|
| `node packages/hub/index.ts` | none; configure with [environment variables](#server) | — | `[hub] embedded Postgres (PGlite) at <DIR>` (or `[hub] Postgres via DATABASE_URL`), then `[hub] Loupe Hub on http://<HOST>:<PORT>` | `db.ts:22`, `db.ts:34`, `index.ts:532-535` |
| `npm run start:hub` | none | — | the same as `node packages/hub/index.ts` | root `package.json:31`, `package.json:8` |
| `node packages/hub/seed.ts [<OWNER_EMAIL>] [<WEBHOOK_URL>] [<ALLOWED_DOMAIN>]` | positional, all optional | `owner@example.com`, `http://127.0.0.1:8791/webhook`, `example.com` | one organization and one project, then `LOUPE_PROJECT_ID=prj_…`, `LOUPE_PROJECT_SECRET=psk_…` and `WEBHOOK_SECRET=whs_…` | `seed.ts:2`, `seed.ts:8`, `seed.ts:13-15` |
| `npm run seed -w @loupekit/hub -- [<OWNER_EMAIL>] [<WEBHOOK_URL>] [<ALLOWED_DOMAIN>]` | as for `seed.ts` | as for `seed.ts` | as for `seed.ts` | `package.json:9` |
| `WEBHOOK_SECRET=<WEBHOOK_SECRET> node packages/hub/tools/webhook-receiver.ts` | none; see [Webhook receiver tool](#webhook-receiver-tool) | port `8791` | `[receiver] listening on http://127.0.0.1:8791` | `tools/webhook-receiver.ts:2`, `:29` |
| `npm run receiver -w @loupekit/hub` | none | as above | as above | `package.json:10` |

- `<OWNER_EMAIL>`: the organization's first owner. Use the Google account you sign in with, or
  the dashboard shows you no organization.
- `<WEBHOOK_URL>`: where Hub sends this project's tickets.
- `<ALLOWED_DOMAIN>`: the organization's [allowed domain](#terms).
- `<WEBHOOK_SECRET>`: the `whs_…` value that `seed.ts` prints.

`seed.ts` is the only way to get a `<PROJECT_ID>` and `<PROJECT_SECRET>` without signing in to
the dashboard. It uses the same database as the server: `DATABASE_URL`, else PGlite at
`HUB_PG_DIR` (`seed.ts:3-4`). Each run creates a new organization and project.

The root `npm run seed` seeds the local Loupe server, not Hub (root `package.json:26`).

## Environment variables

### Server

The Hub server (`node packages/hub/index.ts`) reads these variables.

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `PORT` | integer | `8790` | Port the server listens on. | `index.ts:13` |
| `HOST` | string | `127.0.0.1` | Address the server listens on. | `index.ts:523`, `index.ts:533` |
| `HUB_SESSION_SECRET` | string | A random 32-byte hex value per process, outside production | HMAC key for the [session cookie](#session-cookie). With the default, every restart signs everyone out. | `index.ts:21-28` |
| `NODE_ENV` | string | unset | Only the value `production` has an effect: `HUB_SESSION_SECRET` becomes required. Startup then fails with `HUB_SESSION_SECRET is required in production`. | `index.ts:25`, `index.ts:524` |
| `GOOGLE_CLIENT_ID` | string | unset | Google OAuth web client ID used to verify sign-ins. Without it, `POST /auth/google` answers `503` and the sign-in page shows `GOOGLE_CLIENT_ID is not configured on this server.` | `index.ts:320-321`, `index.ts:383`, `views.ts:37-39` |
| `DATABASE_URL` | string | unset | Postgres connection string. When set, Hub uses node-postgres and logs `[hub] Postgres via DATABASE_URL`. | `db.ts:18-24` |
| `HUB_PG_DIR` | path | `packages/hub/data/pg` | Directory of the embedded PGlite database, used when `DATABASE_URL` is unset. The default is resolved relative to `db.ts`, not to the working directory. A value that starts with `memory` gives an in-memory database. Hub creates the directory if it is missing and logs `[hub] embedded Postgres (PGlite) at <DIR>`, where `<DIR>` is the resolved directory. | `db.ts:26-34` |
| `HUB_ALLOW_PRIVATE_URLS` | string | unset | Exactly `1` turns off the [private-address refusal](#private-address-refusal) and delivers with the global `fetch()`. Use it for local development only. **Unreleased.** | `webhook.ts:52`, `webhook.ts:119` |

Example for a local run:

```bash
HUB_PG_DIR=<DATA_DIR> \
HUB_SESSION_SECRET=<SESSION_SECRET> \
GOOGLE_CLIENT_ID=<CLIENT_ID> \
HUB_ALLOW_PRIVATE_URLS=1 \
node packages/hub/index.ts
```

- `<DATA_DIR>`: a directory for the embedded database, for example `/tmp/hub-pg`.
- `<SESSION_SECRET>`: any long random string, for example the output of `openssl rand -hex 32`.
- `<CLIENT_ID>`: your Google OAuth web client ID, for example `000000000000-example.apps.googleusercontent.com`.

You should see these two lines (`db.ts:34`, `index.ts:535`):

```text
[hub] embedded Postgres (PGlite) at <DATA_DIR>
[hub] Loupe Hub on http://127.0.0.1:8790
```

With `DATABASE_URL` set, the first line is `[hub] Postgres via DATABASE_URL` instead
(`db.ts:22`).

To sign in, open `http://localhost:8790` in a Chromium-based browser. You should see the
**Sign in** page with a **Sign in with Google** button (`views.ts:40-42`,
`packages/hub/README.md:194-198`). Two conditions apply:

- The Google OAuth client must list `http://localhost` and `http://localhost:8790` as authorized
  JavaScript origins (`packages/hub/README.md:182-183`). To create the client, see
  [Create the Google OAuth client](../how-to/hub-self-host.md#create-the-google-oauth-client).
- Open `localhost`, not the `127.0.0.1` address that Hub logs. The Google client accepts only the
  origins it lists, and every dashboard `POST` needs an `Origin` whose host equals the `Host`
  header (`index.ts:110-118`).

### Deploy scripts

The scripts in `packages/hub/deploy/` read these variables. The server does not read them.

| Name | Read by | Default | Description | Source |
|---|---|---|---|---|
| `GCP_PROJECT` | `provision.sh`, `deploy.sh` | required | Google Cloud project ID. The scripts stop with `set GCP_PROJECT` when it is missing. | `deploy/provision.sh:21`, `deploy/deploy.sh:8` |
| `BILLING_ACCOUNT` | `provision.sh` | required only when billing is not enabled | Billing account to link to the project. | `deploy/provision.sh:34-37` |
| `REGION` | `provision.sh` | `us-central1` | Compute region. | `deploy/provision.sh:22` |
| `ZONE` | `provision.sh`, `deploy.sh` | `us-central1-a` | Compute zone. | `deploy/provision.sh:23`, `deploy/deploy.sh:9` |
| `VM` | `provision.sh`, `deploy.sh` | `loupe-hub` | VM name. | `deploy/provision.sh:24`, `deploy/deploy.sh:10` |
| `NET` | `provision.sh` | `loupe-hub-net` | VPC network name. | `deploy/provision.sh:25` |
| `IP_NAME` | `provision.sh` | `loupe-hub-ip` | Name of the reserved static IP. | `deploy/provision.sh:26` |
| `HUB_DOMAIN` | `provision.sh`, `setup-vm.sh` | `<STATIC_IP_WITH_DASHES>.sslip.io`, where `<STATIC_IP_WITH_DASHES>` is the reserved static IP with its dots replaced by dashes | Public host name that [Caddy](#terms) serves. `setup-vm.sh` requires it. | `deploy/provision.sh:98`, `deploy/setup-vm.sh:7` |
| `GOOGLE_CLIENT_ID` | `provision.sh`, `setup-vm.sh` | empty | Written into `/etc/loupe-hub.env`. A later run updates it only when a value is passed. | `deploy/provision.sh:103`, `deploy/setup-vm.sh:64-69` |
| `CLOUDSDK_ACTIVE_CONFIG_NAME` | `provision.sh`, `deploy.sh` | `loupe-hub` | gcloud configuration the scripts use. | `deploy/provision.sh:20`, `deploy/deploy.sh:7` |

`setup-vm.sh` writes `/etc/loupe-hub.env` once, mode `0600`, with `NODE_ENV=production`,
`HOST=127.0.0.1`, `PORT=8790`, a Unix-socket `DATABASE_URL`, a generated `HUB_SESSION_SECRET` and
`GOOGLE_CLIENT_ID` (`deploy/setup-vm.sh:54-71`). Later runs never rotate the session secret.

### Webhook receiver tool

`tools/webhook-receiver.ts` is a test receiver for deliveries. It listens on `127.0.0.1` only
(`tools/webhook-receiver.ts:29`). Start it with:

```bash
WEBHOOK_SECRET=<WEBHOOK_SECRET> node packages/hub/tools/webhook-receiver.ts
```

- `<WEBHOOK_SECRET>`: the project's webhook signing secret, `whs_…`, for example the
  `WEBHOOK_SECRET` line that [`seed.ts`](#commands) prints.

You should see `[receiver] listening on http://127.0.0.1:8791` (`tools/webhook-receiver.ts:2`,
`:29`).

Hub refuses to deliver to this receiver unless Hub runs with `HUB_ALLOW_PRIVATE_URLS=1`, because
`127.0.0.0/8` is a blocked range (`webhook.ts:52`, `webhook.ts:59`, `webhook.ts:119`). Without
it, the delivery fails with `refused: 127.0.0.1 resolves to a private address (127.0.0.1)` in
`lastError` (`webhook.ts:130`). See [Private-address refusal](#private-address-refusal).

| Name | Type | Default | Description | Source |
|---|---|---|---|---|
| `WEBHOOK_SECRET` | string | empty | Secret used to verify `X-Loupe-Hub-Signature`. When it is empty the tool warns that every delivery will fail verification. | `tools/webhook-receiver.ts:9-10` |
| `PORT` | integer | `8791` | Port the tool listens on. | `tools/webhook-receiver.ts:8` |

A valid delivery gets `200 {"ok":true}`; an invalid one gets `401` with the reason as the body
(`tools/webhook-receiver.ts:22`, `:27`).

## Identifiers and secrets

| Kind | Prefix | Format | Example (fake) | Source |
|---|---|---|---|---|
| Organization ID | `org_` | 12 random bytes as lowercase hex (24 characters) | `org_000000000000000000000000` | `crypto.ts:4`, `store.ts:73` |
| Project ID | `prj_` | 24 hex characters | `prj_000000000000000000000000` | `crypto.ts:4`, `store.ts:164` |
| Delivery ID | `dlv_` | 24 hex characters | `dlv_000000000000000000000000` | `crypto.ts:4`, `index.ts:219`, `index.ts:304` |
| Project secret | `psk_` | 24 random bytes as base64url (32 characters) | `psk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | `crypto.ts:5`, `store.ts:164` |
| Webhook signing secret | `whs_` | 32 base64url characters | `whs_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | `crypto.ts:5`, `store.ts:164` |

- A project's app holds its project secret as `LOUPE_PROJECT_SECRET` and its ID as
  `LOUPE_PROJECT_ID` (`views.ts:179-181`).
- Every project has a webhook signing secret, even when it has no webhook URL (`store.ts:159-167`).
- Hub stores both secrets in plain text, because it needs them to sign (`db.ts:65-73`). The
  dashboard shows a secret once, when it is created or rotated (`views.ts:124-129`).
- Rotation replaces the value at once. The old value stops working immediately; there is no
  overlap (`store.ts:226-232`).

## Signing

One scheme covers requests **to** Hub and deliveries **from** Hub.

| Property | Value | Source |
|---|---|---|
| Signed string | `<TIMESTAMP>.<BODY>`: the Unix timestamp in seconds, a dot, and the raw request body | `crypto.ts:7-10` |
| Algorithm | HMAC-SHA256 | `crypto.ts:9` |
| Encoding | lowercase hex | `crypto.ts:9` |
| Body of a GET | the empty string, so the signed string is `<TIMESTAMP>.` | `index.ts:176` |
| Timestamp format | 1 to 12 digits, else `invalid timestamp` | `crypto.ts:31` |
| Allowed skew | 300 seconds, in the past **and** in the future, else `timestamp out of range` | `crypto.ts:19`, `crypto.ts:32` |
| Comparison | the received signature is lowercased, then compared in constant time; a mismatch gives `invalid signature` | `crypto.ts:12-16`, `crypto.ts:33` |
| Replay cache | none. A signed request can be replayed inside the 300-second window. | `crypto.ts:24-35` |

The curl examples on this page take `$TS`, `$SIG` and `$BODY` from this block:

```bash
TS=$(date +%s)
BODY='{"user":{"email":"sara@acme.com"},"issue":{"id":"TCK-42"}}'
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "<PROJECT_SECRET>" -hex | sed 's/^.* //')
echo "$SIG"
```

- `<PROJECT_SECRET>`: the project secret, `psk_…`, of the project that sends the request.

You should see 64 lowercase hex characters.

To verify a delivery from Hub in your own receiver, see
[Receive and verify Loupe Hub webhooks](../how-to/verify-hub-webhooks.md). Always verify over the
raw body bytes, before you parse the JSON.

## Request headers

### Headers on requests to Hub

Every call to `/v1/projects`, `/v1/issues` and `/v1/issues/{id}/updates` carries all three.

| Header | Value | Source |
|---|---|---|
| `X-Loupe-Project` | the calling project's ID, `prj_…` | `index.ts:160` |
| `X-Loupe-Timestamp` | Unix seconds | `index.ts:161` |
| `X-Loupe-Signature` | hex HMAC-SHA256 of `<TIMESTAMP>.<BODY>` with the calling project's secret, `psk_…` | `index.ts:162`, `index.ts:168` |

Hub does not check `Content-Type` on requests.

### Headers on deliveries from Hub

Every delivery attempt carries these headers (`webhook.ts:183-190`).

| Header | Value | Source |
|---|---|---|
| `Content-Type` | `application/json` | `webhook.ts:184` |
| `User-Agent` | `LoupeHub/1` | `webhook.ts:185` |
| `X-Loupe-Hub-Delivery` | the delivery ID, `dlv_…`. The same ID is sent on every retry, so receivers can drop duplicates on it. | `webhook.ts:186` |
| `X-Loupe-Hub-Timestamp` | Unix seconds, fresh on each attempt | `webhook.ts:179`, `webhook.ts:187` |
| `X-Loupe-Hub-Signature` | hex HMAC-SHA256 of `<TIMESTAMP>.<BODY>`, recomputed on each attempt. The key depends on the route; see [Routing order](#routing-order). | `webhook.ts:188` |
| `X-Loupe-Hub-Project` | the receiving project's ID. Sent on project-to-project deliveries and on every update; not sent to an external webhook. | `index.ts:236`, `index.ts:311` |

## Routing order

### Request routing

Hub matches the path only; it ignores the query string (`index.ts:487`). It checks in this order.

| # | Path | Method | Result | Source |
|---|---|---|---|---|
| 1 | `/v1/health` | any | `200 {"ok":true}` | `index.ts:490` |
| 2 | `/v1/projects` | `GET` | [GET /v1/projects](#get-v1projects). Any other method: `405 {"error":"method not allowed"}`. | `index.ts:491-494` |
| 3 | `/v1/issues` | `POST` | [POST /v1/issues](#post-v1issues). Any other method: `405`. | `index.ts:495-498` |
| 4 | `/v1/issues/{id}/updates` | `POST` | [POST /v1/issues/{id}/updates](#post-v1issuesidupdates). Any other method: `405`. `{id}` is the URL-encoded issue ID, 1 to 191 characters after encoding; Hub decodes it only after the match. A `/` in the ID must be sent as `%2F`. A longer `{id}` answers `404 {"error":"not found"}`. | `index.ts:487`, `index.ts:499-510` |
| 5 | any other `/v1/…` | any | `404 {"error":"not found"}` | `index.ts:510` |
| 6 | anything else | any | the [dashboard](#dashboard-routes-and-permissions) | `index.ts:511` |

Errors on `/v1/…` paths and on `/auth/google` are JSON `{"error":"<MESSAGE>"}`, where `<MESSAGE>` is the error text listed for each endpoint. Errors on other
paths are HTML pages. An unexpected exception answers `500` with `Internal error` and is logged
as `[hub] <ERROR>`, where `<ERROR>` is the exception (`index.ts:512-519`).

### Ticket routing

For `POST /v1/issues`, Hub picks one target (`index.ts:229-241`).

| # | Condition | Target URL | Signed with | `X-Loupe-Hub-Project` |
|---|---|---|---|---|
| 1 | The project has a destination project, and that project has an inbound URL | the destination's inbound URL | the destination's project secret (`psk_`) | the destination's ID |
| 2 | Otherwise, the project has a webhook URL | the webhook URL | the sending project's webhook secret (`whs_`) | not sent |
| 3 | Otherwise | none | — | — |

Case 3 answers `202 {"id":"dlv_…","delivery":"none"}` and writes no delivery row
(`index.ts:240`).

## Endpoints

All four endpoints return JSON with only a `Content-Type: application/json` header
(`index.ts:61-64`). Hub has no CORS handling.

### GET /v1/health

| Property | Value |
|---|---|
| Auth | none |
| Response | `200 {"ok":true}` |
| Source | `index.ts:490` |

```bash
curl -s http://127.0.0.1:8790/v1/health
```

You should see `{"ok":true}`.

### GET /v1/projects

Returns the calling project, its organization and the organization's other projects
(`index.ts:175-192`). The request has no body; sign the empty string (`index.ts:176`).

```bash
TS=$(date +%s)
SIG=$(printf '%s' "$TS." | openssl dgst -sha256 -hmac "<PROJECT_SECRET>" -hex | sed 's/^.* //')
curl -s http://127.0.0.1:8790/v1/projects \
  -H "X-Loupe-Project: <PROJECT_ID>" \
  -H "X-Loupe-Timestamp: $TS" \
  -H "X-Loupe-Signature: $SIG"
```

- `<PROJECT_ID>`: the calling project's ID, `prj_…`.
- `<PROJECT_SECRET>`: the project secret, `psk_…`, of that same project.

You should see a JSON object like the response below.

Response `200`:

```json
{
  "organization": { "id": "org_000000000000000000000000", "name": "Acme" },
  "project": {
    "id": "prj_000000000000000000000000",
    "name": "Shop",
    "destination": { "id": "prj_000000000000000000000001", "name": "Tracker" },
    "receives": false
  },
  "projects": [
    { "id": "prj_000000000000000000000001", "name": "Tracker", "receives": true, "isDestination": true }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `organization.id`, `organization.name` | string | The project's organization. |
| `project.destination` | object or `null` | The project its tickets go to. |
| `project.receives` | boolean | `true` when the project has an inbound URL. |
| `projects[]` | array | The organization's other projects, oldest first. The caller is excluded. No secrets or URLs. |
| `projects[].isDestination` | boolean | `true` for the caller's destination. |

Errors, in check order:

| Status | Body | Cause |
|---|---|---|
| `405` | `{"error":"method not allowed"}` | Method is not `GET`. |
| `401` | `{"error":"missing X-Loupe-Project, X-Loupe-Timestamp or X-Loupe-Signature"}` | A header is missing. |
| `404` | `{"error":"unknown project"}` | No project has that ID. |
| `401` | `{"error":"invalid timestamp"}`, `{"error":"timestamp out of range"}` or `{"error":"invalid signature"}` | The [signature check](#signing) failed. |

### POST /v1/issues

Sends a ticket to the project's target (`index.ts:196-261`).

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `user.email` | string | yes | Reporter's email. It must look like an email (no spaces, one `@`, a dot in the domain, at most 320 characters). Hub lowercases it. |
| `user.name` | string | no | Reporter's name. Forwarded only when it is a non-empty string. |
| `issue` | object | yes | The comment. `issue.id` must be a non-empty string. Hub forwards the whole object unchanged. |
| `reply_url` | string | no | Where updates for this ticket go back to. See [reply_url rules](#reply_url-rules). |

```bash
curl -s -X POST http://127.0.0.1:8790/v1/issues \
  -H "X-Loupe-Project: <PROJECT_ID>" \
  -H "X-Loupe-Timestamp: $TS" \
  -H "X-Loupe-Signature: $SIG" \
  --data "$BODY"
```

- `<PROJECT_ID>`: the sending project's ID, `prj_…`. The `<PROJECT_SECRET>` you signed with must
  belong to this project.
- `$TS`, `$SIG` and `$BODY`: the values from the [signing example](#signing). Run this command
  within 300 seconds of computing `$TS` (`crypto.ts:19`, `crypto.ts:32`).

The reporter, `sara@acme.com`, must be an explicit member of the project's organization, or the
organization's [allowed domain](#terms) must be `acme.com`. Otherwise Hub answers
`403 {"error":"user not in organization"}` (`index.ts:214`, `store.ts:151-155`).

For a project that sends to an external webhook, you should see
`{"id":"dlv_…","delivery":"ok"}` (`index.ts:256-260`). The other answers are listed below.

Responses:

| Status | Body | When |
|---|---|---|
| `202` | `{"id":"dlv_…","delivery":"ok","destination":{"id":"prj_…","name":"Tracker"}}` | Delivered to a destination project. |
| `202` | `{"id":"dlv_…","delivery":"ok"}` | Delivered to the external webhook. |
| `202` | `{"id":"dlv_…","delivery":"failed"}` (plus `destination` on a project route) | All attempts failed. The status is still `202`. |
| `202` | `{"id":"dlv_…","delivery":"none"}` | The project has no destination and no webhook. Nothing is sent or recorded. |

`destination` is present only on a project-to-project delivery (`index.ts:256-260`).

Errors, in check order. Hub reads the body and checks auth **before** it parses JSON
(`index.ts:197-198`):

| Status | Body | Cause | Source |
|---|---|---|---|
| `405` | `{"error":"method not allowed"}` | Method is not `POST`. | `index.ts:496` |
| `413` | `{"error":"payload too large"}` | Body over 5,000,000 bytes. | `index.ts:15`, `index.ts:50` |
| `401` | `{"error":"missing X-Loupe-Project, X-Loupe-Timestamp or X-Loupe-Signature"}` | A header is missing. | `index.ts:163-165` |
| `404` | `{"error":"unknown project"}` | No project has that ID. | `index.ts:167` |
| `401` | `{"error":"invalid timestamp"}`, `{"error":"timestamp out of range"}` or `{"error":"invalid signature"}` | The signature check failed. | `index.ts:169`, `index.ts:517` |
| `400` | `{"error":"invalid JSON"}` | The body is not JSON. | `index.ts:204` |
| `400` | `{"error":"user.email required"}` | `user.email` is missing or not an email. | `index.ts:207` |
| `400` | `{"error":"issue.id required"}` | `issue` is not an object, or `issue.id` is not a non-empty string. | `index.ts:209-211` |
| `403` | `{"error":"user not in organization"}` | The email is not an explicit member and its domain is not the organization's allowed domain. Nothing is forwarded. | `index.ts:214`, `store.ts:151-155` |

The submitter rule compares the text after the last `@` with the allowed domain exactly, so
`sara@acme.com.example.net` does not match `acme.com` (`store.ts:153`).

**Timing.** Delivery is synchronous: Hub answers only after the last attempt. The worst case is
about 35 seconds: three 10-second attempts plus waits of 1 and 4 seconds (`webhook.ts:7-9`).
Set your client timeout above that.

### POST /v1/issues/{id}/updates

Sends a status change or a reply on a ticket that two projects share (`index.ts:278-314`).
`{id}` is the ticket's `issue.id`, URL-encoded. For example, `TCK-42` is sent as
`/v1/issues/TCK-42/updates`, and an ID that contains `/` sends it as `%2F`. The 191-character
limit applies to the encoded form (`index.ts:499`, `index.ts:504`).

Request body: a JSON object whose `kind` is `"status"` or `"message"`. Hub checks only `kind`
and forwards the whole object unchanged (`index.ts:288-310`). The Laravel package builds the
status shape at `packages/laravel/src/Support/Relay.php:71`, with `label`, `reference` and `url`
present only when set (`Relay.php:52-58`), and the message shape at `Relay.php:84-94`:

```json
{ "kind": "status", "status": "in_review", "label": "Ready for testing", "reference": "TCK-42", "url": "https://tracker.example.com/tickets/TCK-42" }
```

```json
{ "kind": "message", "message": { "id": "01J00000000000000000000000", "author": { "name": "Sara", "email": "sara@acme.com" }, "body": "Fixed on staging.", "createdAt": "2026-10-05T10:00:00Z" } }
```

`message.attachments` is optional. The package adds it only when the message has attachments
(`Relay.php:90-92`). `message.author.email` is also sent only when it is a non-empty string
(`Relay.php:85-88`).

Hub finds the newest successful project-to-project delivery of that issue ID. Deliveries in
which the caller took part sort first (`store.ts:250-265`). Then it picks the direction:

| Caller is | Hub sends to | Signed with | Source |
|---|---|---|---|
| the source of the delivery | the destination's current inbound URL | the destination's project secret | `index.ts:297-301` |
| the destination of the delivery | the delivery's stored `reply_url`, if it still passes the [reply_url rules](#reply_url-rules) | the source's project secret | `index.ts:301` |

Both directions add `X-Loupe-Hub-Project: <receiver ID>` (`index.ts:311`).

Responses:

| Status | Body | When |
|---|---|---|
| `202` | `{"id":"dlv_…","delivery":"ok"}` | Delivered. |
| `202` | `{"id":"dlv_…","delivery":"failed"}` | All attempts failed. |
| `202` | `{"delivery":"none"}` | The other side has no URL to receive it, or the other project no longer exists. This answer has **no** `id`. |

Errors, in check order:

| Status | Body | Cause | Source |
|---|---|---|---|
| `405` | `{"error":"method not allowed"}` | Method is not `POST`. | `index.ts:501` |
| `400` | `{"error":"bad issue id"}` | `{id}` is not valid URL encoding. | `index.ts:503-507` |
| `413` | `{"error":"payload too large"}` | Body over 1,000,000 bytes. | `index.ts:17`, `index.ts:279` |
| `401` / `404` | as for `POST /v1/issues` | Missing header, unknown project, or bad signature. | `index.ts:280` |
| `400` | `{"error":"invalid JSON"}` | The body is not JSON. | `index.ts:286` |
| `400` | `{"error":"kind must be status or message"}` | Not an object, an array, or another `kind`. | `index.ts:288-290` |
| `404` | `{"error":"unknown ticket"}` | No successful project-to-project delivery has this issue ID. | `index.ts:293` |
| `403` | `{"error":"this project does not hold the ticket"}` | The caller is neither the source nor the destination. | `index.ts:294` |

**Timing.** The same retry schedule as tickets applies, so the worst case is about 35 seconds.
Updates are not written to the `deliveries` table (`index.ts:304-313`). A ticket sent again
follows its newest successful delivery.

## Outbound delivery

`deliver()` sends every ticket and update (`webhook.ts:166-209`).

| Property | Value | Source |
|---|---|---|
| Method | `POST` | `webhook.ts:182` |
| Attempts | 3 | `webhook.ts:175` |
| Waits before attempts 2 and 3 | 1,000 ms, then 4,000 ms | `webhook.ts:9` |
| Timeout per attempt | 10,000 ms | `webhook.ts:7`, `webhook.ts:193` |
| Success | any `2xx` status | `webhook.ts:198` |
| Redirects | never followed (`redirect: "manual"`), so a `3xx` counts as a failure | `webhook.ts:192` |
| Response body | read and discarded | `webhook.ts:197` |

Result fields:

| Field | Type | Description | Source |
|---|---|---|---|
| `status` | `"ok"` or `"failed"` | Outcome. | `webhook.ts:11-16` |
| `httpStatus` | integer or `null` | Status of the last attempt; `null` after a network error. | `webhook.ts:195`, `webhook.ts:203` |
| `attempts` | integer | Attempt that succeeded, or `3` on failure. | `webhook.ts:199`, `webhook.ts:208` |
| `lastError` | string or `null` | `HTTP <HTTP_STATUS>` (the receiver's status code), `timeout after 10000ms`, or the network error message. | `webhook.ts:201`, `webhook.ts:205` |

For tickets, these fields are stored in the [`deliveries`](#deliveries) table and shown on the
project page. A failure is logged as `[hub] delivery <DELIVERY_ID> from <PROJECT_ID> failed: <ERROR>`, or
`[hub] update <DELIVERY_ID> for <ISSUE_ID> from <PROJECT_ID> failed: <ERROR>` for an update
(`index.ts:255`, `index.ts:312`). `<DELIVERY_ID>` is the `dlv_…` ID, `<PROJECT_ID>` the sending
project, `<ISSUE_ID>` the decoded issue ID, and `<ERROR>` the `lastError` value.

## Payloads

### Ticket (outbound from `POST /v1/issues`)

Built at `index.ts:220-227`:

```json
{
  "project_id": "prj_000000000000000000000000",
  "organization_id": "org_000000000000000000000000",
  "source": {
    "project_id": "prj_000000000000000000000000",
    "project_name": "Shop",
    "organization_id": "org_000000000000000000000000",
    "organization_name": "Acme"
  },
  "user": { "email": "sara@acme.com", "name": "Sara" },
  "issue": { "id": "TCK-42", "title": "Checkout button overlaps footer" },
  "received_at": "2026-10-05T10:00:00.000Z"
}
```

| Field | Description |
|---|---|
| `project_id`, `organization_id` | The sending project and its organization. |
| `source` | The same IDs plus their names. |
| `user` | The reporter, email lowercased; `name` only when it was a non-empty string. |
| `issue` | The request's `issue` object, unchanged. |
| `received_at` | When Hub received the ticket, ISO 8601. |

The Laravel package's receiver, `POST /<LOUPE_PATH>/v1/hub/inbound`, reads this shape. Here
`<LOUPE_PATH>` is the Laravel package's `LOUPE_PATH`, default `loupe`
(`packages/laravel/config/loupe.php:24`, `packages/laravel/routes/loupe.php:22`). See
[Laravel package](../LARAVEL.md).

### Update (outbound from `POST /v1/issues/{id}/updates`)

Built at `index.ts:305-310`:

```json
{
  "type": "update",
  "issue_id": "TCK-42",
  "from": { "project_id": "prj_000000000000000000000001", "project_name": "Tracker" },
  "update": { "kind": "status", "status": "in_review", "label": "Ready for testing", "reference": "TCK-42" }
}
```

| Field | Description |
|---|---|
| `type` | Always `"update"`. A receiver uses it to tell an update from a ticket. |
| `issue_id` | The decoded `{id}` from the request path. |
| `from` | The project that sent the update. |
| `update` | The request body, unchanged. |

## reply_url rules

A `reply_url` is the source app's receiver for updates on a ticket. Hub checks it in
`validReplyUrl` (`index.ts:145-150`).

| Rule | Status | Source |
|---|---|---|
| A string, `http` or `https`, at most 2,000 characters | 0.14.0 | `index.ts:128-136`, `index.ts:146` |
| Stored only for a project-to-project delivery; otherwise `null` is stored | 0.14.0 | `index.ts:243` |
| No user name or password in the URL | **Unreleased** | `index.ts:148`, `CHANGELOG.md:22-26` |
| The path ends with `/v1/hub/inbound` | **Unreleased** | `index.ts:148`, `CHANGELOG.md:22-26` |
| When the source project has an inbound URL, the `reply_url` has the same origin. When it has none, any origin passes this rule. | **Unreleased** | `index.ts:149`, `CHANGELOG.md:22-26` |
| Re-checked against the source's current inbound URL before each update | **Unreleased** | `index.ts:299-301`, `CHANGELOG.md:22-26` |

An invalid `reply_url` does not fail the ticket. Hub stores `null`, and updates from the
destination then answer `202 {"delivery":"none"}`.

## Private-address refusal

**Unreleased** (`CHANGELOG.md:12-21`). Every delivery resolves the target host and refuses a
non-public address, unless `HUB_ALLOW_PRIVATE_URLS=1` (`webhook.ts:38-157`). The check applies to
webhook URLs, inbound URLs and reply URLs. It runs inside the connection's own DNS lookup, so the
address checked is the address dialled (`webhook.ts:100-112`). If any resolved address is
blocked, the delivery fails.

Blocked IPv4 ranges (`webhook.ts:54-68`):

| Range | Purpose |
|---|---|
| `0.0.0.0/8` | "this" network |
| `10.0.0.0/8` | private |
| `127.0.0.0/8` | loopback |
| `100.64.0.0/10` | carrier-grade NAT |
| `169.254.0.0/16` | link-local, cloud metadata |
| `172.16.0.0/12` | private |
| `192.0.0.0/16` | protocol assignments and TEST-NET-1 (the code blocks every `192.0.x.x`) |
| `192.168.0.0/16` | private |
| `198.18.0.0/15` | benchmarking |
| `224.0.0.0` and above | multicast, reserved, broadcast |

Blocked IPv6 addresses (`webhook.ts:71-91`):

| Address | Purpose |
|---|---|
| `::` | unspecified |
| `::1` | loopback |
| `fc00::/7` | unique local |
| `fe80::/10` | link-local |
| `ff00::/8` | multicast |
| `::ffff:a.b.c.d`, `64:ff9b::a.b.c.d`, and the hex forms `::ffff:XXXX:XXXX`, `64:ff9b::XXXX:XXXX` (for example `::ffff:7f00:1`) | IPv4-mapped and NAT64 forms of a blocked IPv4 address (`webhook.ts:77-83`) |
| anything unparseable | blocked |

Error strings, as stored in `lastError`:

| String | Cause | Source |
|---|---|---|
| `invalid URL: <URL>` | The URL cannot be parsed. | `webhook.ts:125` |
| `refused: <PROTOCOL> URL` | The protocol is not `http:` or `https:`, for example `refused: ftp: URL`. | `webhook.ts:127` |
| `refused: <HOST> resolves to a private address (<IP>)` | The host, or an IP literal, is in a blocked range. `<HOST>` is the URL's host and `<IP>` the blocked address. | `webhook.ts:95`, `webhook.ts:130` |

The dashboard does not check addresses when you save a URL; the refusal happens at send time.

## Body caps

| Request | Cap | Over the cap | Source |
|---|---|---|---|
| `POST /v1/issues` | 5,000,000 bytes | `413 {"error":"payload too large"}` | `index.ts:15` |
| `POST /v1/issues/{id}/updates` | 1,000,000 bytes | `413` | `index.ts:17` |
| Dashboard forms and `POST /auth/google` | 64,000 bytes | `413` | `index.ts:16` |
| Any request through the shipped Caddy proxy | 6 MB | rejected by Caddy | `deploy/Caddyfile:5-7` |
| Laravel receiver `POST /<LOUPE_PATH>/v1/hub/inbound` | 6,000,000 bytes | `413 {"error":"payload too large"}` | `packages/laravel/src/Http/Middleware/VerifyHubSignature.php:29`, `:39` |

## Dashboard routes and permissions

The dashboard is server-rendered HTML. Sign-in uses Google Identity Services.

**Same-origin check.** Every dashboard `POST` needs an `Origin` header whose host equals the
`Host` header. A missing `Origin` fails. The answer is `403 Bad origin`, or
`403 {"error":"bad origin"}` on `/auth/google` (`index.ts:110-118`, `index.ts:319`,
`index.ts:378`). The check runs before the sign-in check, so a signed-out `POST` with a missing or
wrong `Origin` gets `403 Bad origin`, not `401 Sign in first` (`index.ts:378`, `index.ts:382-386`).

| Method and path | Who | Fields | Success | Errors | Source |
|---|---|---|---|---|---|
| `POST /auth/google` | anyone | JSON `{"credential": "<GOOGLE_ID_TOKEN>"}`, where `<GOOGLE_ID_TOKEN>` is the ID token that Google Identity Services returns | `200 {"ok":true,"email":"<EMAIL>"}`, where `<EMAIL>` is the account's email, lowercased, and the session cookie | `403 bad origin`, `503 GOOGLE_CLIENT_ID not configured`, `400 invalid JSON`, `400 credential required`, `401 sign-in rejected: <REASON>` | `index.ts:318-339` |
| `POST /logout` | anyone | — | `303` to `/`, cookie cleared | `403 Bad origin` | `index.ts:380` |
| `GET /` | signed out | — | sign-in page | — | `index.ts:383` |
| other `GET` | signed out | — | `303` to `/` | — | `index.ts:384` |
| other `POST` | signed out | — | — | `401 Sign in first` | `index.ts:385` |
| `GET /` | signed in | — | your organizations, newest first, with your role | — | `index.ts:388`, `store.ts:90-98` |
| `POST /orgs` | signed in | `name` (cut to 100), `allowed_domain` (cut to 253, optional) | `303` to `/orgs/<ORG_ID>`; you become owner | `400 Name is required`, `400 Allowed domain is not a valid domain` | `index.ts:390-398`, `store.ts:71-81` |
| `GET /orgs/{id}` | member | — | organization page | `404 Organization not found` | `index.ts:404`, `index.ts:342-347` |
| `POST /orgs/{id}/members` | owner | `email` (cut to 320), `role` (`owner`; anything else is `member`) | `303` to the organization. Adding an existing email changes its role. | `400 Enter a valid email` | `index.ts:411-415`, `store.ts:123-130` |
| `POST /orgs/{id}/members/remove` | owner | `email` | `303` to the organization | `400 An organization needs at least one owner` | `index.ts:416-419` |
| `POST /orgs/{id}/domain` | owner | `allowed_domain`; empty clears it | `303` to the organization | `400 Allowed domain is not a valid domain` | `index.ts:420-423` |
| `POST /orgs/{id}/projects` | owner | `name` (cut to 100), `webhook_url` (optional) | `201` project page with a one-time secrets card | `400 Project name is required`, `400 Webhook URL must be an http(s) URL` | `index.ts:424-436` |
| `GET /projects/{id}` | member | — | project page with the last 20 outgoing deliveries | `404 Project not found` | `index.ts:445`, `index.ts:349-356` |
| `POST /projects/{id}/destination` | owner | `destination_project_id`; empty clears the route | `303` to the project | `400` with `That project does not exist`, `Tickets can only go to a project in the same organization`, `A project cannot send tickets to itself` or `That project has no inbound URL, so it cannot receive tickets` | `index.ts:460-473` |
| `POST /projects/{id}/inbound` | owner | `inbound_url`; empty clears it and clears every route that points at this project | `303` to the project | `400 Inbound URL must be an http(s) URL` | `index.ts:452-458`, `store.ts:186-193` |
| `POST /projects/{id}/webhook` | owner | `webhook_url`; empty clears it | `303` to the project | `400 Webhook URL must be an http(s) URL` | `index.ts:452-458` |
| `POST /projects/{id}/rotate` | owner | `which=webhook_secret` rotates the webhook secret; any other value rotates the project secret | `200` project page with a one-time card | — | `index.ts:474-480` |

- A member who is not an owner gets `403 Only an organization owner can do that` on every
  owner-only `POST` (`index.ts:358-360`).
- A non-member gets `404`, so the response does not reveal that the organization or project
  exists (`index.ts:341-356`).
- A `GET` on an action path, or any other method, gets `404 Not found` (`index.ts:405`,
  `index.ts:446`).
- URL fields are cut to 4,000 characters and must be `http` or `https` and at most 2,000
  characters (`index.ts:128-136`, `index.ts:453`).
- Any Google account with a verified email can sign in and create an organization. Membership is
  not needed (`google.ts:18-22`, `index.ts:390-398`).
- An email allowed only through the allowed domain can submit tickets but has no dashboard
  access, because dashboard access needs an explicit membership row (`index.ts:342-347`).

HTML responses carry `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: same-origin` and `Cache-Control: no-store` (`index.ts:66-86`).

## Session cookie

| Attribute | Value | Source |
|---|---|---|
| Name | `hub_session` | `index.ts:14` |
| `Path` | `/` | `index.ts:94` |
| `HttpOnly` | set | `index.ts:94` |
| `Secure` | always set. Serve Hub over HTTPS. For a local run, the Hub README uses `http://localhost:8790` in a Chromium-based browser, which accepts the cookie there (`packages/hub/README.md:194-196`); other browsers may refuse it over plain HTTP. | `index.ts:94` |
| `SameSite` | `Lax` | `index.ts:94` |
| `Max-Age` | `604800` (7 days) | `crypto.ts:46`, `index.ts:337` |
| Value | `base64url(JSON {email, name?, exp})` + `.` + `base64url(HMAC-SHA256(payload, HUB_SESSION_SECRET))` | `crypto.ts:39-52` |
| Rejected when | the MAC does not match, `email` is not a string, `exp` is not a number, or `exp` has passed | `crypto.ts:54-66` |

## Database schema

Hub creates and updates its schema on every start, idempotently (`db.ts:44-101`,
`index.ts:525`). A redeploy therefore applies new columns.

### organizations

| Column | Type | Notes | Source |
|---|---|---|---|
| `id` | `TEXT` | primary key, `org_…` | `db.ts:48` |
| `name` | `TEXT NOT NULL` | | `db.ts:49` |
| `allowed_domain` | `TEXT` | lowercase, no leading `@`; `NULL` when unset | `db.ts:50`, `store.ts:58-61` |
| `created_by_email` | `TEXT NOT NULL` | | `db.ts:51` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | default `now()` | `db.ts:52` |

### org_members

| Column | Type | Notes | Source |
|---|---|---|---|
| `org_id` | `TEXT NOT NULL` | references `organizations(id)`, `ON DELETE CASCADE` | `db.ts:57` |
| `email` | `TEXT NOT NULL` | lowercased | `db.ts:58`, `store.ts:55` |
| `role` | `TEXT NOT NULL` | `owner` or `member` | `db.ts:59` |

Primary key `(org_id, email)`; index `org_members_email (email)` (`db.ts:60-63`).

### projects

| Column | Type | Notes | Source |
|---|---|---|---|
| `id` | `TEXT` | primary key, `prj_…` | `db.ts:67` |
| `org_id` | `TEXT NOT NULL` | references `organizations(id)`, `ON DELETE CASCADE` | `db.ts:68` |
| `name` | `TEXT NOT NULL` | | `db.ts:69` |
| `secret` | `TEXT NOT NULL` | project secret, `psk_…`, plain text | `db.ts:70` |
| `webhook_url` | `TEXT` | nullable since 0.12.0 | `db.ts:71`, `db.ts:96` |
| `webhook_secret` | `TEXT NOT NULL` | `whs_…`, plain text | `db.ts:72` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | default `now()` | `db.ts:73` |
| `inbound_url` | `TEXT` | added in 0.12.0 | `db.ts:92` |
| `destination_project_id` | `TEXT` | added in 0.12.0; references `projects(id)`, `ON DELETE SET NULL` | `db.ts:93-95` |

### deliveries

One row per routed ticket. Updates are not recorded.

| Column | Type | Notes | Source |
|---|---|---|---|
| `id` | `TEXT` | primary key, `dlv_…` | `db.ts:78` |
| `project_id` | `TEXT NOT NULL` | the sending project; references `projects(id)`, `ON DELETE CASCADE` | `db.ts:79` |
| `issue_id` | `TEXT NOT NULL` | the ticket's `issue.id` | `db.ts:80` |
| `status` | `TEXT NOT NULL` | `ok` or `failed` | `db.ts:81` |
| `http_status` | `INT` | | `db.ts:82` |
| `attempts` | `INT NOT NULL` | | `db.ts:83` |
| `last_error` | `TEXT` | | `db.ts:84` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | default `now()` | `db.ts:85` |
| `destination_project_id` | `TEXT` | added in 0.12.0; no foreign key; `NULL` for webhook deliveries | `db.ts:97` |
| `reply_url` | `TEXT` | added in 0.13.0 | `db.ts:100` |

Indexes: `deliveries_project_created (project_id, created_at DESC)` and
`deliveries_issue (issue_id, created_at DESC)` (`db.ts:87`, `db.ts:101`).

## Limits

| Limit | Value | Source |
|---|---|---|
| Signature window | ±300 seconds, no replay cache | `crypto.ts:19` |
| Delivery attempts | 3, with waits of 1 s and 4 s | `webhook.ts:7-9` |
| Worst-case response time for tickets and updates | about 35 seconds; there is no queue | `webhook.ts:166-209` |
| Issue ID in the update path | 1 to 191 characters after URL-encoding (each `%XX` counts as 3); longer answers `404 {"error":"not found"}` | `index.ts:499`, `index.ts:504`, `index.ts:510` |
| Email length | 320 characters | `store.ts:64` |
| Organization and project names | 100 characters | `index.ts:392`, `index.ts:425` |
| Webhook, inbound and reply URL length | 2,000 characters | `index.ts:129` |
| Deliveries shown on a project page | 20, outgoing only | `store.ts:267-274` |
| Rate limiting | none | `index.ts:486-520` |
| Deleting organizations or projects | not supported; no route or store function exists | `index.ts:373-484`, `store.ts` |
| Updates on webhook deliveries | not supported; updates need a project-to-project delivery | `store.ts:257` |
| Audit log | none | — |

## Related pages

- [How Loupe Hub works](../explanation/hub.md): organizations, routing and two-way sync.
- [Route tickets between two projects with Loupe Hub](../tutorials/hub-two-projects-local.md)
- [Connect apps to Hub](../how-to/hub-connect-apps.md)
- [Verify Hub webhook signatures](../how-to/verify-hub-webhooks.md)
- [Self-host Loupe Hub](../how-to/hub-self-host.md)
- [Manage Hub organizations and projects](../how-to/hub-manage-projects.md)
- [Laravel package](../LARAVEL.md): the inbound receiver and the Hub sender.
