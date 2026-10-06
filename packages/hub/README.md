# Loupe Hub (`@loupekit/hub`)

Loupe Hub is a small Node service that routes feedback tickets between apps that run Loupe.
It verifies each signed ticket, checks that the reporter belongs to the organization, and
forwards the ticket to another project or to a webhook. A *signed ticket* is a request whose
body the sending app signs with its project secret (HMAC-SHA256), so Hub can tell which project
sent it and that nobody changed it on the way.

This package is private. It is not published to npm, so you run it from a clone of the
[Loupe repository](https://github.com/mohamed-ashraf-elsaed/loupe).

## Contents

- [What Hub does](#what-hub-does)
- [Run locally](#run-locally)
  - [Prerequisites](#prerequisites)
  - [Steps](#steps)
  - [Verify](#verify)
  - [Optional: Sign in to the dashboard](#optional-sign-in-to-the-dashboard)
  - [Troubleshooting](#troubleshooting)
  - [Next steps](#next-steps)
- [Documentation](#documentation)
- [Tests](#tests)

## What Hub does

- **Dashboard.** You sign in with Google and create *organizations* (a team and its allowed
  members). Each organization holds *projects*, one per app. A project has a Project ID
  (`prj_…`) and a Project Secret (`psk_…`) that the app uses to sign requests.
- **Ingest API.** `POST /v1/issues` accepts a ticket from an app. Hub sends it to the
  destination project's *inbound URL* (the address where a project receives tickets from other
  projects, ending in `/v1/hub/inbound`) if one is set. Otherwise it sends it to the project's
  *webhook* (an external URL that Hub posts each ticket to, signed with the project's webhook
  secret, `whs_…`). Otherwise it sends it nowhere.
- **Updates API.** `POST /v1/issues/{id}/updates` relays status changes and replies between
  the two projects that share a ticket.
- **Projects API.** `GET /v1/projects` tells an app its organization and the other projects
  in it.

For every route, header, request and response, see the
[endpoints in the Hub reference](../../docs/reference/hub.md#endpoints). For why routing works
this way, see [How Hub works](../../docs/explanation/hub.md).

Hub runs `.ts` files directly with Node's built-in TypeScript support (`node index.ts`), using
`node:http` and Postgres. CI and the deploy script use Node 24; `package.json` declares no
`engines` field, so nothing enforces that version locally. With no `DATABASE_URL`, Hub uses an
embedded PGlite database: PGlite is Postgres compiled to WebAssembly, running inside the Node
process and storing its files on disk.

## Run locally

This quick start runs Hub, a demo organization and project, and a reference webhook receiver
on your machine, then sends one signed ticket through them.

### Prerequisites

- Node.js 24 or later. Check with `node -v`.
- npm, which ships with Node.js.
- git.
- `curl` and `openssl`, for the [Verify](#verify) step.

### Steps

Use a separate terminal for each long-running process. Run every command from the root folder
of your clone.

1. Clone the repository and move into it:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   cd loupe
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   You should see npm finish with an `added <N> packages` summary and no `ERR!` lines. The root
   `package.json` lists `packages/hub` as a workspace, so this one install covers Hub too.

3. Create a demo organization and project:

   ```bash
   node packages/hub/seed.ts <OWNER_EMAIL> http://127.0.0.1:8791/webhook <ALLOWED_DOMAIN>
   ```

   The script takes three optional arguments, in this order:

   | Argument | Meaning | Default |
   |---|---|---|
   | `<OWNER_EMAIL>` | The organization's owner. Use the Google account you will [sign in](#optional-sign-in-to-the-dashboard) with, or the dashboard shows you no organization. | `owner@example.com` |
   | `<WEBHOOK_URL>` | Where Hub posts this project's tickets. Keep `http://127.0.0.1:8791/webhook`, where the receiver in step 4 listens. | `http://127.0.0.1:8791/webhook` |
   | `<ALLOWED_DOMAIN>` | An email domain, such as `acme.com`. Anyone whose email ends in `@<ALLOWED_DOMAIN>` may submit tickets without being a listed member. | `example.com` |

   You should see output like this, with your own IDs and secrets:

   ```text
   [hub] embedded Postgres (PGlite) at <REPO>/packages/hub/data/pg
   organization   org_…  (owner owner@acme.com, allowed domain @acme.com)
   project        prj_…  → http://127.0.0.1:8791/webhook

   LOUPE_PROJECT_ID=prj_…
   LOUPE_PROJECT_SECRET=psk_…
   WEBHOOK_SECRET=whs_…
   ```

   Save the last three lines. Step 4 uses `WEBHOOK_SECRET`, and [Verify](#verify) uses
   `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET`. The data is stored in
   `packages/hub/data/pg`, unless you set `DATABASE_URL` or `HUB_PG_DIR`. Each run of the
   script creates another organization and project; it does not reuse the first.

4. Start the reference webhook receiver:

   ```bash
   WEBHOOK_SECRET=<WEBHOOK_SECRET> node packages/hub/tools/webhook-receiver.ts
   ```

   Replace `<WEBHOOK_SECRET>` with the `whs_…` value from step 3. The receiver verifies the
   signature of each delivery and logs the payload.

   You should see `[receiver] listening on http://127.0.0.1:8791`. To use another port, set
   `PORT`, and pass the matching webhook URL to the seed script in step 3.

5. In a new terminal, start Hub:

   ```bash
   HUB_ALLOW_PRIVATE_URLS=1 node packages/hub/index.ts
   ```

   You should see `[hub] Loupe Hub on http://127.0.0.1:8790`.

   Hub normally refuses to deliver to private, loopback and link-local addresses (its
   *private-address guard*), and the receiver in step 4 is on `127.0.0.1`.
   `HUB_ALLOW_PRIVATE_URLS=1` turns that guard off. Use it for local development only, and
   never set it in production.

   Hub also reads `PORT` (default `8790`) and `HOST` (default `127.0.0.1`). With
   `NODE_ENV=production`, it refuses to start without `HUB_SESSION_SECRET`. For every
   variable, see [Environment variables](../../docs/reference/hub.md#environment-variables).

### Verify

1. In a new terminal, check that Hub answers:

   ```bash
   curl http://127.0.0.1:8790/v1/health
   ```

   You should see `{"ok":true}`.

2. Sign a test ticket with the project secret and send it to Hub:

   ```bash
   PROJECT_ID=<LOUPE_PROJECT_ID>
   PROJECT_SECRET=<LOUPE_PROJECT_SECRET>
   TS=$(date +%s)
   BODY='{"user":{"email":"sara@<ALLOWED_DOMAIN>","name":"Sara"},"issue":{"id":"TCK-42","title":"Checkout button overlaps footer"}}'
   SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$PROJECT_SECRET" -hex | sed 's/^.* //')
   curl -sS -X POST http://127.0.0.1:8790/v1/issues \
     -H "X-Loupe-Project: $PROJECT_ID" \
     -H "X-Loupe-Timestamp: $TS" \
     -H "X-Loupe-Signature: $SIG" \
     --data "$BODY"
   ```

   - `<LOUPE_PROJECT_ID>` and `<LOUPE_PROJECT_SECRET>`: the `prj_…` and `psk_…` values from
     step 3.
   - `<ALLOWED_DOMAIN>`: the domain you passed to the seed script, so that Hub accepts the
     reporter.

   You should see `{"id":"dlv_…","delivery":"ok"}`. The receiver's terminal shows
   `POST /webhook signature OK (delivery dlv_…)`, followed by the ticket as JSON.

### Optional: Sign in to the dashboard

The dashboard needs a Google OAuth client of type **Web application**. To create one, follow
[Create the Google OAuth client](../../docs/how-to/hub-self-host.md#create-the-google-oauth-client),
with the local origins below.

1. In the Google client, under **Authorized JavaScript origins**, add both `http://localhost`
   and `http://localhost:8790`.

2. Stop Hub with `Ctrl+C`, and start it again with the client ID:

   ```bash
   GOOGLE_CLIENT_ID=<GOOGLE_CLIENT_ID> HUB_ALLOW_PRIVATE_URLS=1 node packages/hub/index.ts
   ```

   Replace `<GOOGLE_CLIENT_ID>` with the client ID, which ends in
   `.apps.googleusercontent.com`.

3. Open `http://localhost:8790` in a Chromium-based browser. Use `localhost`, not the
   `127.0.0.1` address that Hub prints: the Google client accepts only the origins you added.
   Hub's session cookie is marked `Secure`, and Chromium accepts it on `http://localhost`.

   You should see the **Sign in** page with a **Sign in with Google** button.

4. Sign in with the account whose email you passed to the seed script.

   You should see the demo organization.

For a full walkthrough of the dashboard and project-to-project routing, see the tutorial
[Route tickets between two projects with Loupe Hub](../../docs/tutorials/hub-two-projects-local.md).

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The receiver logs `REJECTED: invalid signature`, Hub logs `failed: HTTP 401`, and `curl` shows `"delivery":"failed"`. | The receiver's `WEBHOOK_SECRET` is not the `whs_…` value printed for this project, for example because you ran the seed script again. | Restart the receiver with the `WEBHOOK_SECRET` from the seed run that created the project you are testing. |
| The receiver prints `WEBHOOK_SECRET not set: every delivery will fail verification`. | You started the receiver without `WEBHOOK_SECRET`. | Stop it with `Ctrl+C` and run step 4 again with the secret. |
| Hub answers `{"id":"dlv_…","delivery":"failed"}` and logs `refused: 127.0.0.1 resolves to a private address (127.0.0.1)`. | Hub started without `HUB_ALLOW_PRIVATE_URLS=1`, so its private-address guard refused the receiver on `127.0.0.1`. | Stop Hub and start it with `HUB_ALLOW_PRIVATE_URLS=1`, as in step 5. |
| `curl` answers `{"error":"timestamp out of range"}`. | More than 300 seconds passed between computing `TS` and sending. | Run the `TS=` and `SIG=` lines again, then send. |
| `curl` answers `{"error":"user not in organization"}`. | The reporter's email domain is not the allowed domain you passed to the seed script. | Use an email that ends in `@<ALLOWED_DOMAIN>` in `BODY`. |
| The sign-in page says `GOOGLE_CLIENT_ID is not configured on this server.` | Hub started without `GOOGLE_CLIENT_ID`. | Stop Hub and start it as in [Optional: Sign in to the dashboard](#optional-sign-in-to-the-dashboard), step 2. |
| The **Sign in with Google** button shows an error such as `origin_mismatch`. | You opened `http://127.0.0.1:8790`, or the Google client does not list the origin you opened. | Add `http://localhost` and `http://localhost:8790` to the client, and open `http://localhost:8790`. |
| Hub or the receiver exits with `EADDRINUSE`. | Another process already uses port `8790` or `8791`. | Stop that process, or start Hub or the receiver with a different `PORT`. If you move the receiver, pass the matching webhook URL to the seed script. |

### Next steps

- [Connect apps to Hub](../../docs/how-to/hub-connect-apps.md): configure your apps with a
  `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET` like the ones printed in step 3.
- [Self-host Loupe Hub](../../docs/how-to/hub-self-host.md): run Hub on a server with Postgres,
  HTTPS and a Google client.

## Documentation

- [Self-host Loupe Hub](../../docs/how-to/hub-self-host.md)
- [Manage organizations and projects](../../docs/how-to/hub-manage-projects.md)
- [Connect apps to Hub](../../docs/how-to/hub-connect-apps.md)
- [Verify Hub webhooks](../../docs/how-to/verify-hub-webhooks.md)
- [Hub reference](../../docs/reference/hub.md): environment variables, routes, request and
  response shapes, errors and limits
- [How Hub works](../../docs/explanation/hub.md): routing, signing, two-way sync and the
  private-address guard

## Tests

The Hub suites live in `test/`: `api`, `crypto`, `google` and `webhook`. They run against
PGlite in memory, so they need no database server. They cover ingest and routing between
projects, ticket updates in both directions, the projects API, dashboard permissions and
CSRF (cross-site request forgery) protection, request and session signing, Google token
checks, delivery retries, and the private-address guard.

Run them from the root folder of your clone:

```bash
npx vitest run packages/hub
```

You should see `Test Files  4 passed (4)`. To run the tests of every package instead, run
`npm test`.
