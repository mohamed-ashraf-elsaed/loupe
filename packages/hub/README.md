# ◎ Loupe Hub (`@loupekit/hub`, private)

A minimal hosted service that sits between Loupe installs and your team's tools:

1. **Dashboard** (Google sign-in). Create **organizations**, add **allowed members** (Google
   emails and/or one email domain such as `acme.com`), and create **projects**. Each project
   gets a **Project ID** (`prj_…`), a **Project Secret** (`psk_…`), a **webhook URL** and a
   **webhook signing secret** (`whs_…`).
2. **Ingest API.** `POST /v1/issues` accepts an issue from a Loupe install, checks the
   request signature, checks that the submitting user belongs to the organization, and
   forwards the issue to the project's webhook, signed.

Node 24 native TypeScript (`node index.ts`), `node:http`, Postgres (PGlite locally and in
tests, `DATABASE_URL` in production). Server-rendered HTML, no framework.

## Run locally

```bash
npm install
node packages/hub/seed.ts owner@acme.com http://127.0.0.1:8791/webhook acme.com
# → prints LOUPE_PROJECT_ID, LOUPE_PROJECT_SECRET and WEBHOOK_SECRET

WEBHOOK_SECRET=whs_… node packages/hub/tools/webhook-receiver.ts   # :8791, verifies + logs
node packages/hub/index.ts                                          # :8790
```

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
| `202` | `{ id, delivery: "ok" \| "failed" }` | Accepted. `id` is the delivery id. |
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

## Webhook delivery

Hub POSTs this JSON to the project's webhook URL:

```json
{ "project_id": "prj_…", "organization_id": "org_…", "user": { "email": "…", "name": "…" },
  "issue": { … }, "received_at": "2026-09-23T13:58:37.240Z" }
```

Headers: `X-Loupe-Hub-Timestamp`, `X-Loupe-Hub-Signature =
hex(HMAC-SHA256(timestamp + "." + rawBody, webhook_secret))` and `X-Loupe-Hub-Delivery`.
Verify the signature over the **raw** body and reject timestamps more than 5 minutes old.
`tools/webhook-receiver.ts` is a working reference.

Any 2xx is success. A non-2xx reply, a network error or the 10 s timeout is retried after
1 s and then 4 s (3 attempts in total). Redirects are not followed. Every issue produces one
`deliveries` row. The ingest call answers only after delivery finishes (up to ~35 s).

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
