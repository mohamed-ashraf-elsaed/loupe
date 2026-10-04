# ◎ Loupe Hub (`@loupekit/hub`, private)

A minimal hosted service that sits between Loupe installs and your team's tools:

1. **Dashboard** (Google sign-in). Create **organizations**, add **allowed members** (Google
   emails and/or one email domain such as `acme.com`), and create one **project** per app.
   Each project gets a **Project ID** (`prj_…`) and a **Project Secret** (`psk_…`). It can
   also have an **Inbound URL** (where it receives tickets), a **Send tickets to** project
   in the same organization, and an optional **webhook URL** with its signing secret
   (`whs_…`). The project page shows the three `.env` names the app needs.
2. **Ingest API.** `POST /v1/issues` accepts an issue from a Loupe install, checks the
   request signature, checks that the submitting user belongs to the organization, and
   sends the issue on: to the destination project's Inbound URL if one is set, else to the
   project's webhook, else nowhere.
3. **Projects API.** `GET /v1/projects` tells an install its organization and the
   organization's other projects, so the widget can show them.

Node 24 native TypeScript (`node index.ts`), `node:http`, Postgres (PGlite locally and in
tests, `DATABASE_URL` in production). Server-rendered HTML, no framework.

## Run locally

```bash
npm install
node packages/hub/seed.ts owner@acme.com http://127.0.0.1:8791/webhook acme.com
# → prints LOUPE_PROJECT_ID, LOUPE_PROJECT_SECRET and WEBHOOK_SECRET

WEBHOOK_SECRET=whs_… node packages/hub/tools/webhook-receiver.ts   # :8791, verifies + logs
HUB_ALLOW_PRIVATE_URLS=1 node packages/hub/index.ts                 # :8790
```

`HUB_ALLOW_PRIVATE_URLS=1` is only for local runs, where the receiver is on 127.0.0.1. Without
it, Hub refuses to post to any private address.

The dashboard needs `GOOGLE_CLIENT_ID` (a Google OAuth **web** client with
`http://localhost:8790` as an authorized JavaScript origin). `seed.ts` creates an org and
project without signing in.

| Env | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string. Unset: embedded PGlite at `HUB_PG_DIR`. |
| `HUB_PG_DIR` | `./data/pg` | PGlite directory (`memory://` in tests). |
| `HUB_SESSION_SECRET` | random per process (dev) | Signs the session cookie. **Required** when `NODE_ENV=production`. |
| `GOOGLE_CLIENT_ID` | — | OAuth web client ID. ID tokens must have this `aud`. |
| `PORT` / `HOST` | `8790` / `127.0.0.1` | Listen address. |
| `HUB_ALLOW_PRIVATE_URLS` | unset | `1` lets Hub post to private, loopback and link-local addresses. Local development only: without it, every delivery to such an address fails with `refused: … private address`. Never set it in production. |

## Dashboard rules

- Sign in with Google Identity Services. The ID token is verified server side (Google's
  signature, issuer, expiry, `aud` = `GOOGLE_CLIENT_ID`, `email_verified` = true).
- Session cookie `hub_session`: HttpOnly, Secure, SameSite=Lax, HMAC-signed, 7 days. Every
  form POST must also carry an `Origin` that matches the host (CSRF defense).
- You see only organizations you are a member of. The creator of an org is its **owner**.
  Only owners add or remove members, set the allowed domain, create projects, change webhook
  URLs and rotate secrets. An org always keeps at least one owner.
- The Project Secret and webhook secret are shown **once**, on create or rotate.
- Each project page lists its last 20 deliveries with status, HTTP code, attempts and error.
- Domain-allowed users may **submit issues** but do not see the dashboard unless added as members.

## Ingest API

```
POST /v1/issues
X-Loupe-Project:   prj_…
X-Loupe-Timestamp: <unix seconds>
X-Loupe-Signature: hex(HMAC-SHA256(timestamp + "." + rawBody, project_secret))

{ "user": { "email": "sara@acme.com", "name": "Sara" }, "issue": <Comment from @loupekit/shared> }
```

| Status | Body | When |
| --- | --- | --- |
| `202` | `{ id, delivery: "ok" \| "failed" \| "none", destination?: { id, name } }` | Accepted. `id` is the delivery id. `none` means the project has no destination and no webhook. `destination` is set when Hub sent the issue to another project. |
| `400` | `{ error }` | Invalid JSON, missing `user.email` or `issue.id`. |
| `401` | `{ error }` | Missing headers, bad signature, timestamp more than 5 minutes off. |
| `403` | `{ error: "user not in organization" }` | Email is not a member and not on the allowed domain. |
| `404` | `{ error: "unknown project" }` | No such Project ID. |
| `413` | `{ error: "payload too large" }` | Body over 5 MB. |

Membership: the email (case-insensitive) is in the org's members, **or** its domain equals
the org's `allowed_domain` exactly (`x@acme.com.evil.io` does not match `acme.com`).

Test it with `curl`:

```bash
PROJECT_ID=prj_… PROJECT_SECRET=psk_… HUB=https://hub.example.com
BODY='{"user":{"email":"sara@acme.com"},"issue":{"id":"test-1","body":"Hello from curl","url":"/"}}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$PROJECT_SECRET" -hex | sed 's/^.* //')
curl -sS "$HUB/v1/issues" -H 'Content-Type: application/json' \
  -H "X-Loupe-Project: $PROJECT_ID" -H "X-Loupe-Timestamp: $TS" -H "X-Loupe-Signature: $SIG" \
  --data "$BODY"
```

## Projects API

```
GET /v1/projects
X-Loupe-Project:   prj_…
X-Loupe-Timestamp: <unix seconds>
X-Loupe-Signature: hex(HMAC-SHA256(timestamp + ".", project_secret))   # empty body
```

```json
{ "organization": { "id": "org_…", "name": "Acme" },
  "project": { "id": "prj_…", "name": "Shop", "destination": { "id": "prj_…", "name": "Support" }, "receives": false },
  "projects": [ { "id": "prj_…", "name": "Support", "receives": true, "isDestination": true } ] }
```

`projects` lists the organization's other projects. `receives` is true when a project has an
Inbound URL. The answer never carries secrets or URLs. Auth failures answer `401`, an unknown
project `404`.

## Delivery

Hub sends the same JSON to a destination project or to a webhook:

```json
{ "project_id": "prj_…", "organization_id": "org_…",
  "source": { "project_id": "prj_…", "project_name": "Shop", "organization_id": "org_…", "organization_name": "Acme" },
  "user": { "email": "…", "name": "…" }, "issue": { … }, "received_at": "2026-09-23T13:58:37.240Z" }
```

Routing, in order:

1. **Destination project.** When the project has a **Send tickets to** project and that
   project has an Inbound URL, Hub POSTs to that URL. It signs with the **destination's own
   Project Secret**, the `psk_…` its app already holds, and adds
   `X-Loupe-Hub-Project: <destination id>`. The Laravel package's
   `POST {path}/v1/hub/inbound` verifies this out of the box.
2. **Webhook.** Otherwise, when the project has a webhook URL, Hub POSTs there signed with
   the webhook secret.
3. **Nowhere.** Otherwise ingest answers `delivery: "none"`.

A destination must be in the same organization, must not be the project itself, and must
have an Inbound URL. The dashboard refuses anything else.

Headers: `X-Loupe-Hub-Timestamp`, `X-Loupe-Hub-Signature =
hex(HMAC-SHA256(timestamp + "." + rawBody, secret))` and `X-Loupe-Hub-Delivery`. Verify the
signature over the **raw** body and reject timestamps more than 5 minutes old.
`tools/webhook-receiver.ts` is a working reference.

Any 2xx is success. A non-2xx reply, a network error or the 10 s timeout is retried after
1 s and then 4 s (3 attempts in total). Redirects are not followed. Every issue produces one
`deliveries` row. The ingest call answers only after delivery finishes (up to ~35 s).

## Updates

After a project-to-project delivery, either project can send an update about the ticket:

```
POST /v1/issues/{issue id}/updates     signed like ingest (X-Loupe-Project, -Timestamp, -Signature)
{ "kind": "status", "status": "in_review", "label": "Ready for testing", "reference": "CT-1405", "url": "https://…" }
{ "kind": "message", "message": { "id": "…", "author": { "name": "…", "email": "…" }, "body": "…", "createdAt": "…" } }
```

Hub finds the newest successful delivery of that ticket that the caller took part in, and
sends the update to the other project:

| Caller | Sent to | Signed with |
| --- | --- | --- |
| the source | the destination's Inbound URL | the destination's secret |
| the destination | the `reply_url` the source sent with the ticket | the source's secret |

The receiver gets `{ "type": "update", "issue_id", "from": { "project_id", "project_name" },
"update" }` with the usual `X-Loupe-Hub-*` headers. Answers: `202 { delivery: "ok" |
"failed" | "none" }`, `400` for a bad body, `401` for a bad signature, `403` when the caller
is not part of the delivery, `404` for an unknown ticket. `none` means the other side has no
URL, for example a ticket sent by a package older than 0.13.0. Delivery retries like ingest.
Updates do not add rows to `deliveries`.

## Laravel

`loupekit/laravel` forwards every new comment when `LOUPE_HUB_URL`, `LOUPE_PROJECT_ID` and
`LOUPE_PROJECT_SECRET` are set. See the
[Laravel README](../laravel/README.md#send-new-comments-to-loupe-hub-optional).

## Deploy (Google Cloud)

`deploy/` holds idempotent scripts. They use only the `loupe-hub` gcloud configuration.

```bash
# once: gcloud config configurations create loupe-hub --no-activate
#       CLOUDSDK_ACTIVE_CONFIG_NAME=loupe-hub gcloud config set account you@gmail.com
GCP_PROJECT=loupe-hub BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX bash packages/hub/deploy/provision.sh
GCP_PROJECT=loupe-hub bash packages/hub/deploy/deploy.sh      # every later code change
```

- `provision.sh`: project + billing link, a dedicated VPC `loupe-hub-net`, firewall (80/443
  open, 22 from Google IAP only), a static IPv4, a least-privilege `loupe-hub-vm` service
  account, and an **e2-micro** Debian 12 VM (30 GB
  pd-standard, free-tier shape). Then it runs `setup-vm.sh` and `deploy.sh`.
- `setup-vm.sh` (on the VM, as root): 1 GB swap, Node 24, Postgres 16 bound to localhost
  (peer auth for the `loupehub` user), Caddy, the `loupe-hub` systemd unit (runs as
  `loupehub`, hardened), `/etc/loupe-hub.env` (0600: `DATABASE_URL`, `HUB_SESSION_SECRET`,
  `GOOGLE_CLIENT_ID`).
- `deploy.sh`: ships the runtime files, runs `npm install --omit=dev`, swaps the release and
  restarts, then checks `/v1/health`.
- Domain: `HUB_DOMAIN=hub.example.com`, or by default `<ip-with-dashes>.sslip.io` (resolves
  to the VM IP, so HTTPS works with no DNS setup). Caddy gets and renews the certificate.

Set or change the OAuth client later:

```bash
gcloud compute ssh loupe-hub --tunnel-through-iap --command \
  "sudo sed -i 's|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=<id>|' /etc/loupe-hub.env && sudo systemctl restart loupe-hub"
```

### Google OAuth client (Console only)

1. Console → **Google Auth Platform → Branding**: app name "Loupe Hub", support email.
   Audience **External**. Add yourself as a test user (or publish the app).
2. **Clients → Create client** → *Web application*. **Authorized JavaScript origins:**
   `https://<your hub domain>`. No redirect URI is needed.
3. Put the client ID in `/etc/loupe-hub.env` as above.

## Tests

`npm test` covers HMAC valid/invalid/expired, membership by email and by domain, the 403
path, webhook signing, retries and timeouts, the delivery log, owner/member/non-member
permissions, CSRF, one-time secrets and rotation.

## Known limits

- **No backups** (MVP). The database lives only on the VM disk.

- Ingest delivery is synchronous (no background queue). A slow webhook holds the request
  for up to ~35 s.
- No replay cache: a captured request can be replayed within the 5-minute window.
- Webhook URLs may point anywhere the VM can reach (owners are trusted). Use `https://` in
  production.
