# Receive and verify Loupe Hub webhooks

This guide shows you how to accept ticket deliveries from Loupe Hub in your own service, in any language, and how to prove that each request really came from your Hub.

Terms used in this guide:

- **Loupe Hub** (Hub) is the service that holds your organizations and projects and delivers tickets between them. A **project** in Hub stands for one app.
- A **ticket** is a comment that a user pinned in an app connected to a Hub project. The app sends it to Hub, and Hub forwards it.
- A **delivery** is Hub's attempt to send one ticket to one URL. Each delivery has a **delivery id** that starts with `dlv_`.
- The **project secret** (`psk_…`) is what your app uses to sign the requests it sends **to** Hub. The **webhook signing secret** (`whs_…`) is what Hub uses to sign the deliveries it sends **to your webhook**. This guide uses only the webhook signing secret.

When a project has a **Webhook URL**, Hub sends every new ticket for that project to the URL as an HTTP `POST` with a JSON body. Hub signs each request with the webhook signing secret, which only Hub and your service know. Your service recomputes the signature and rejects any request where it does not match.

This guide is for services that are **not** the Loupe Laravel package. The Laravel package receives tickets from Hub on its own inbound route; see [Connect apps to Hub](hub-connect-apps.md).

## Contents

- [Prerequisites](#prerequisites)
- [How a delivery is signed](#how-a-delivery-is-signed)
- [Steps](#steps)
  - [1. Read the raw body before parsing it](#1-read-the-raw-body-before-parsing-it)
  - [2. Read the signature headers](#2-read-the-signature-headers)
  - [3. Reject a stale or malformed timestamp](#3-reject-a-stale-or-malformed-timestamp)
  - [4. Recompute the signature and compare it in constant time](#4-recompute-the-signature-and-compare-it-in-constant-time)
  - [5. De-duplicate on the delivery id](#5-de-duplicate-on-the-delivery-id)
  - [6. Answer 2xx within 10 seconds](#6-answer-2xx-within-10-seconds)
- [Complete receivers](#complete-receivers)
  - [PHP](#php)
  - [Node.js](#nodejs)
  - [Python](#python)
- [Connect the receiver to the project](#connect-the-receiver-to-the-project)
- [The payload](#the-payload)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Prerequisites

- A Loupe Hub project in an organization where you are an **owner**. Hub has no per-project owner: the routing forms, the webhook URL form and the rotate buttons appear only for an owner of the project's organization. To create a project, see [Manage Hub organizations and projects](hub-manage-projects.md).
- The project's **webhook signing secret** (`whs_…`). Hub shows it once, on the card that appears right after you create the project. If you did not copy it, click **Rotate webhook secret** on the project page. The page then shows a **New webhook signing secret** card: copy the value now, because Hub does not show it again. The old value stops working immediately.

  ![The one-time secrets card after creating a project, showing the Project Secret and the Webhook signing secret](../images/hub-project-secrets.png)

- A place to deploy your receiver at a **public** `http://` or `https://` URL. Hub refuses to deliver to a host that resolves to a loopback, private, link-local or reserved address, so `127.0.0.1` and `localhost` do not work for real deliveries.
- An app connected to this project, to send a real ticket in [Verify](#verify). See [Connect apps to Hub](hub-connect-apps.md#step-2-configure-each-app).
- For the local check in [Verify](#verify): a clone of the Loupe repository, Node.js 24 (the version the repository's CI uses), and `openssl` and `curl` on your `PATH`. Check the Node.js version:

  ```bash
  node --version
  ```

  You should see `v24` or later.

You connect the receiver to the project in [Connect the receiver to the project](#connect-the-receiver-to-the-project), after it is deployed.

<!-- Sources: owner-only forms packages/hub/views.ts:152 and index.ts:449-450 (requireOwner); rotate card index.ts:474-479; private-address guard packages/hub/webhook.ts:49-52,95; CI node-version .github/workflows/ci.yml:15. -->


## How a delivery is signed

Every delivery carries these request headers:

<!-- Source: packages/hub/webhook.ts:183-190 -->

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `LoupeHub/1` |
| `X-Loupe-Hub-Delivery` | The delivery id, such as `dlv_3f9a…`. The same on every retry of one delivery. |
| `X-Loupe-Hub-Timestamp` | The time Hub sent this attempt, in Unix seconds. |
| `X-Loupe-Hub-Signature` | Lowercase hex HMAC-SHA256 of `<timestamp>.<raw body>`, keyed with the webhook signing secret. |

In other words, the signed string is the timestamp, one dot, and the request body byte for byte:

```text
HMAC-SHA256(key = <WEBHOOK_SECRET>, message = <X-Loupe-Hub-Timestamp> + "." + <RAW_BODY>)  →  lowercase hex
```

Hub computes a fresh timestamp and signature for every attempt.

<!-- Source: packages/hub/webhook.ts:179,188 -->

## Steps

Steps 3 and 4 are the same checks Hub applies to signed requests it receives. Steps 1, 2, 5 and 6 are what your receiver adds on top, and they follow from how Hub delivers. The [complete receivers](#complete-receivers) implement all six.

<!-- Sources: steps 3-4 packages/hub/crypto.ts:24-35 (verifySignature); steps 5-6 packages/hub/webhook.ts:166-209 (deliver). -->

### 1. Read the raw body before parsing it

Read the request body as bytes, exactly as it arrived. Do not decode the JSON first and re-encode it: a re-encoded body can differ in key order, spacing or Unicode escapes, and then the signature does not match.

| Language | Raw body |
|---|---|
| PHP | `file_get_contents('php://input')` |
| Node.js | `Buffer.concat(chunks)` from the request's `data` events |
| Python | `self.rfile.read(int(self.headers.get("Content-Length", "0")))` |

### 2. Read the signature headers

Read `X-Loupe-Hub-Timestamp` and `X-Loupe-Hub-Signature`. Header names are case-insensitive. Treat a missing header as an empty string, so that the checks below reject the request.

### 3. Reject a stale or malformed timestamp

Reject the request when either is true:

- The timestamp is not 1 to 12 decimal digits (the pattern `^\d{1,12}$`).
- The timestamp differs from your server's current Unix time by more than **300 seconds**, in either direction.

These are the same limits Hub applies to requests it receives. The window limits how long a captured request can be replayed.

<!-- Source: packages/hub/crypto.ts:19,31-32 -->

### 4. Recompute the signature and compare it in constant time

1. Compute HMAC-SHA256 over the timestamp, a dot, and the raw body, with the webhook signing secret as the key.
2. Encode the result as lowercase hex.
3. Lowercase the received `X-Loupe-Hub-Signature`.
4. Compare the two with a constant-time function: `hash_equals` in PHP, `crypto.timingSafeEqual` in Node.js, `hmac.compare_digest` in Python. A plain `==` leaks timing information.

If they differ, answer `401` and stop.

### 5. De-duplicate on the delivery id

Hub retries a delivery that fails, and it sends the **same** `X-Loupe-Hub-Delivery` value on every attempt. A retry can arrive even after your service processed the first attempt, for example when your `200` reached Hub after its 10-second timeout.

Store each delivery id you accept, ideally in a database column with a unique index. When an id arrives a second time, answer `200` without processing the ticket again.

<!-- Source: packages/hub/webhook.ts:186 -->

### 6. Answer 2xx within 10 seconds

Hub's rules for a delivery attempt:

<!-- Source: packages/hub/webhook.ts:7-9,166-209 -->

| Rule | Value |
|---|---|
| Success | Any `2xx` status. |
| Timeout per attempt | 10 seconds. |
| Redirects | Never followed. A `3xx` counts as a failure. |
| Attempts | 3 in total. |
| Waits between attempts | 1 second before attempt 2, 4 seconds before attempt 3. |

After the third failure Hub records the delivery as `failed` and does not try again. On the Hub project page, the **Last 20 deliveries** table shows `failed` in the **Status** column, the last HTTP status code in the **HTTP** column, and the reason, such as `HTTP 500` or `timeout after 10000ms`, in the **Error** column. To stay inside the timeout, verify, store the ticket, answer `200`, and do any slow work in a background job.

## Complete receivers

Each receiver below listens on `127.0.0.1:8791`, reads the secret from the `WEBHOOK_SECRET` environment variable, and implements all six steps. Each keeps the seen delivery ids in memory or in a temporary file to stay short; replace that with a database table in production.

In the commands, replace `<WEBHOOK_SECRET>` with your project's webhook signing secret (`whs_…`).

### PHP

Plain PHP with no framework. Save it as `receiver.php`:

```php
<?php
// Loupe Hub webhook receiver. Run: WEBHOOK_SECRET=whs_... php -S 127.0.0.1:8791 receiver.php

$secret = getenv('WEBHOOK_SECRET') ?: '';

function reply(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['error' => 'method not allowed']);
}

// 1. Read the raw body before you parse anything.
$raw = file_get_contents('php://input');

// 2. Read the signature headers.
$timestamp = $_SERVER['HTTP_X_LOUPE_HUB_TIMESTAMP'] ?? '';
$signature = strtolower($_SERVER['HTTP_X_LOUPE_HUB_SIGNATURE'] ?? '');
$delivery  = $_SERVER['HTTP_X_LOUPE_HUB_DELIVERY'] ?? '';

// 3. Reject a malformed or stale timestamp.
if (!preg_match('/^\d{1,12}$/', $timestamp) || abs(time() - (int) $timestamp) > 300) {
    reply(401, ['error' => 'timestamp out of range']);
}

// 4. Recompute the signature over "<timestamp>.<raw body>" and compare in constant time.
$expected = hash_hmac('sha256', $timestamp . '.' . $raw, $secret);
if ($secret === '' || !hash_equals($expected, $signature)) {
    reply(401, ['error' => 'invalid signature']);
}

// 5. De-duplicate on the delivery id. Hub reuses it on every retry.
//    This file-based list is for the example only; use a unique database column in production.
$seenFile = sys_get_temp_dir() . '/loupe-hub-deliveries.txt';
$seen = is_file($seenFile) ? file($seenFile, FILE_IGNORE_NEW_LINES) : [];
if ($delivery !== '') {
    if (in_array($delivery, $seen, true)) {
        reply(200, ['ok' => true, 'duplicate' => true]);
    }
    file_put_contents($seenFile, $delivery . "\n", FILE_APPEND | LOCK_EX);
}

// Only now parse the JSON.
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    reply(400, ['error' => 'invalid JSON']);
}

error_log(sprintf('ticket %s from %s (%s)',
    $payload['issue']['id'] ?? '?',
    $payload['source']['project_name'] ?? '?',
    $payload['user']['email'] ?? '?'));

// 6. Answer 2xx quickly. Queue slow work instead of doing it here.
reply(200, ['ok' => true]);
```

Run it:

```bash
WEBHOOK_SECRET=<WEBHOOK_SECRET> php -S 127.0.0.1:8791 receiver.php
```

You should see a line ending in `Development Server (http://127.0.0.1:8791) started`.

This receiver keeps seen delivery ids in `loupe-hub-deliveries.txt` in the system temporary folder (`sys_get_temp_dir()`), so they survive a restart.

### Node.js

Only built-in modules (`node:http` and `node:crypto`). Save it as `receiver.mjs`:

```javascript
// Loupe Hub webhook receiver. Run: WEBHOOK_SECRET=whs_... node receiver.mjs
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.WEBHOOK_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8791);
const MAX_SKEW_SECONDS = 300;
const seen = new Set(); // Example only: use a unique database column in production.

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function validSignature(timestamp, raw, signature) {
  // Sign the raw bytes: "<timestamp>." followed by the body exactly as received.
  const expected = createHmac("sha256", SECRET)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), raw]))
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.toLowerCase());
  return SECRET !== "" && a.length === b.length && timingSafeEqual(a, b);
}

createServer((req, res) => {
  if (req.method !== "POST") return reply(res, 405, { error: "method not allowed" });

  // 1. Collect the raw body as bytes. Do not parse it yet.
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);

    // 2. Read the signature headers.
    const timestamp = String(req.headers["x-loupe-hub-timestamp"] ?? "");
    const signature = String(req.headers["x-loupe-hub-signature"] ?? "");
    const delivery = String(req.headers["x-loupe-hub-delivery"] ?? "");

    // 3. Reject a malformed or stale timestamp.
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) {
      return reply(res, 401, { error: "timestamp out of range" });
    }

    // 4. Compare the signature in constant time.
    if (!validSignature(timestamp, raw, signature)) {
      return reply(res, 401, { error: "invalid signature" });
    }

    // 5. De-duplicate on the delivery id. Hub reuses it on every retry.
    if (delivery) {
      if (seen.has(delivery)) return reply(res, 200, { ok: true, duplicate: true });
      seen.add(delivery);
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return reply(res, 400, { error: "invalid JSON" });
    }
    console.log(`ticket ${payload.issue?.id} from ${payload.source?.project_name} (${payload.user?.email})`);

    // 6. Answer 2xx quickly. Queue slow work instead of doing it here.
    reply(res, 200, { ok: true });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`listening on http://127.0.0.1:${PORT}`));
```

Run it:

```bash
WEBHOOK_SECRET=<WEBHOOK_SECRET> node receiver.mjs
```

You should see `listening on http://127.0.0.1:8791`.

### Python

Only the standard library (`http.server`, `hmac`, `hashlib`). Save it as `receiver.py`:

```python
# Loupe Hub webhook receiver. Run: WEBHOOK_SECRET=whs_... python3 receiver.py
import hashlib
import hmac
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("WEBHOOK_SECRET", "").encode()
PORT = int(os.environ.get("PORT", "8791"))
MAX_SKEW_SECONDS = 300
seen = set()  # Example only: use a unique database column in production.


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        # 1. Read the raw body as bytes. Do not parse it yet.
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)

        # 2. Read the signature headers.
        timestamp = self.headers.get("X-Loupe-Hub-Timestamp", "")
        signature = self.headers.get("X-Loupe-Hub-Signature", "").lower()
        delivery = self.headers.get("X-Loupe-Hub-Delivery", "")

        # 3. Reject a malformed or stale timestamp.
        if not re.fullmatch(r"\d{1,12}", timestamp) or abs(int(time.time()) - int(timestamp)) > MAX_SKEW_SECONDS:
            return self.reply(401, {"error": "timestamp out of range"})

        # 4. Recompute the signature over b"<timestamp>." + raw and compare in constant time.
        expected = hmac.new(SECRET, timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
        if not SECRET or not hmac.compare_digest(expected, signature):
            return self.reply(401, {"error": "invalid signature"})

        # 5. De-duplicate on the delivery id. Hub reuses it on every retry.
        if delivery:
            if delivery in seen:
                return self.reply(200, {"ok": True, "duplicate": True})
            seen.add(delivery)

        try:
            payload = json.loads(raw)
        except ValueError:
            return self.reply(400, {"error": "invalid JSON"})
        print("ticket", payload.get("issue", {}).get("id"), "from", payload.get("source", {}).get("project_name"))

        # 6. Answer 2xx quickly. Queue slow work instead of doing it here.
        self.reply(200, {"ok": True})


HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
```

Run it:

```bash
WEBHOOK_SECRET=<WEBHOOK_SECRET> python3 receiver.py
```

The Python receiver prints nothing until the first request arrives. Each request then prints one access-log line.

## Connect the receiver to the project

Do this after your receiver is deployed at its public URL. You must be an owner of the project's organization.

1. In Hub, open the project page.
2. In the **Routing** section, in the text box next to **Save webhook URL**, enter your receiver's public URL, for example `https://tracker.example.com/webhook`. Click **Save webhook URL**.

   You should see `Webhook URL https://tracker.example.com/webhook` near the top of the page.

   You can also set the URL when you create the project: the create-project form has the same optional webhook URL field.

3. In the **Send tickets to** list, select **No project (use the external webhook)**. Click **Save route**.

   You should see `Tickets go to the external webhook` near the top of the page.

If the project routes tickets to another project that has an inbound URL, Hub sends them there instead, and the webhook receives nothing. If the selected project has no inbound URL, Hub falls back to the webhook.

<!-- Sources: forms packages/hub/views.ts:152-166; create form views.ts:104-107 and index.ts:426-428; status lines views.ts:174,176; routing order index.ts:233-240. -->

## The payload

The body is one JSON object:

<!-- Source: packages/hub/index.ts:220-227 -->

| Field | Type | Description |
|---|---|---|
| `project_id` | string | The Hub project that sent the ticket (`prj_…`). |
| `organization_id` | string | The organization that owns the project (`org_…`). |
| `source.project_id` | string | Same as `project_id`. |
| `source.project_name` | string | The project's name in Hub. |
| `source.organization_id` | string | Same as `organization_id`. |
| `source.organization_name` | string | The organization's name in Hub. |
| `user.email` | string | The reporter's email, lowercased. Hub has already checked that this person belongs to the organization. |
| `user.name` | string, optional | Present only when the sending app supplied a non-empty name. |
| `issue` | object | The comment exactly as the sending app sent it. Hub guarantees only that `issue.id` is a non-empty string; every other field is passed through unchanged. |
| `received_at` | string | When Hub accepted the ticket, as an ISO 8601 UTC timestamp. |

An example body:

```json
{
  "project_id": "prj_000000000000000000000001",
  "organization_id": "org_000000000000000000000001",
  "source": {
    "project_id": "prj_000000000000000000000001",
    "project_name": "Shop",
    "organization_id": "org_000000000000000000000001",
    "organization_name": "Acme"
  },
  "user": { "email": "sara@acme.com", "name": "Sara" },
  "issue": {
    "id": "TCK-42",
    "title": "Checkout button overlaps footer",
    "body": "The Pay now button sits on top of the footer.",
    "url": "/checkout"
  },
  "received_at": "2026-10-05T10:00:00.000Z"
}
```

A webhook receives new tickets only. Status changes and replies are relayed only between two Hub projects, never to a webhook. For every endpoint and field, see the [Loupe Hub reference](../reference/hub.md).

## Verify

The repository includes a reference receiver, `packages/hub/tools/webhook-receiver.ts`. It checks only the timestamp and the signature, with the same code Hub uses for requests it receives. It answers `200 {"ok":true}` to a valid request, answers `401` with the reason as plain text to an invalid one, and logs the payload. It does not check the HTTP method and does not de-duplicate: a repeated delivery id is accepted again. Use it to check a signing recipe, then point the same recipe at your own receiver, which implements all six steps.

<!-- Source: packages/hub/tools/webhook-receiver.ts:12-28; crypto.ts:24-35 -->

1. In the root folder of your clone, start the reference receiver:

   ```bash
   WEBHOOK_SECRET=<WEBHOOK_SECRET> node packages/hub/tools/webhook-receiver.ts
   ```

   You should see `[receiver] listening on http://127.0.0.1:8791`. To use another port, set `PORT`.

2. In a second terminal, sign and send a test delivery, the same way Hub does:

   ```bash
   WEBHOOK_SECRET=<WEBHOOK_SECRET>
   BODY='{"project_id":"prj_000000000000000000000001","organization_id":"org_000000000000000000000001","source":{"project_id":"prj_000000000000000000000001","project_name":"Shop","organization_id":"org_000000000000000000000001","organization_name":"Acme"},"user":{"email":"sara@acme.com","name":"Sara"},"issue":{"id":"TCK-42","title":"Checkout button overlaps footer"},"received_at":"2026-10-05T10:00:00.000Z"}'
   TS=$(date +%s)
   SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
   curl -sS -i http://127.0.0.1:8791/webhook \
     -H 'Content-Type: application/json' \
     -H 'X-Loupe-Hub-Delivery: dlv_000000000000000000000001' \
     -H "X-Loupe-Hub-Timestamp: $TS" \
     -H "X-Loupe-Hub-Signature: $SIG" \
     --data "$BODY"
   ```

   You should see `HTTP/1.1 200 OK` and the body `{"ok":true}`. The receiver's terminal shows a line ending in `signature OK (delivery dlv_000000000000000000000001)`, followed by the payload.

3. Send the same request with a timestamp 400 seconds in the past, by replacing `"X-Loupe-Hub-Timestamp: $TS"` with `"X-Loupe-Hub-Timestamp: $((TS-400))"`.

   You should see `HTTP/1.1 401 Unauthorized` and the body `timestamp out of range`. The reference receiver does not de-duplicate, so it rejects this request only because of the timestamp, not because the delivery id repeats.

4. Stop the reference receiver with `Ctrl+C`. Start your own receiver on port 8791 with its run command:

   - PHP: `WEBHOOK_SECRET=<WEBHOOK_SECRET> php -S 127.0.0.1:8791 receiver.php`
   - Node.js: `WEBHOOK_SECRET=<WEBHOOK_SECRET> node receiver.mjs`
   - Python: `WEBHOOK_SECRET=<WEBHOOK_SECRET> python3 receiver.py`

   The PHP receiver remembers delivery ids across restarts. If you ran it before, delete `loupe-hub-deliveries.txt` from the system temporary folder (`php -r 'echo sys_get_temp_dir();'` prints it), or change the delivery id in step 2.

5. Run the whole block from step 2 again, not only the `curl` line, so that `TS` gets a fresh timestamp.

   You should see a `200` status. The body is `{"ok":true}` from the PHP and Node.js receivers, and `{"ok": true}`, with a space, from the Python receiver. The Python receiver answers with `HTTP/1.0`.

6. Run the whole block from step 2 a third time, without changing the delivery id.

   You should see a `200` status and the body `{"ok":true,"duplicate":true}` from the PHP and Node.js receivers, or `{"ok": true, "duplicate": true}` from the Python receiver. Your receiver did not process the ticket again.

7. Deploy your receiver at its public URL and [connect it to the project](#connect-the-receiver-to-the-project).
8. Send a real ticket from the app connected to the project: pin a comment in it, as in [Connect apps to Hub, step 7](hub-connect-apps.md#step-7-pin-a-comment-in-shop).

   On the Hub project page, you should see a row in the **Last 20 deliveries** table with **To** `webhook`, **Status** `ok` and **HTTP** `200`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Your receiver answers `401 invalid signature` to every Hub delivery, while the curl test in [Verify](#verify) passes. | Your framework parsed the JSON body and you signed a re-serialized copy. Key order, spacing or escaping changed, so the bytes differ. | Compute the HMAC over the raw request bytes (step 1). In a framework, read the raw body before any JSON middleware runs. |
| `401 invalid signature` on every request, including the curl test. | The secret is wrong: the project secret (`psk_…`) instead of the webhook signing secret (`whs_…`), a secret that was rotated, or stray whitespace. | Use the `whs_…` value. If you no longer have it, click **Rotate webhook secret** on the project page and update your service with the new value. |
| `401 timestamp out of range`. | Your server's clock differs from Hub's by more than 300 seconds. | Sync the clock with NTP. Do not widen the window: it is your replay protection. |
| The deliveries table shows **Status** `failed`, and **Error** `HTTP 301`, `HTTP 302` or another `3xx`. | Hub does not follow redirects, for example from `http://` to `https://` or from a missing trailing slash. | Save the final URL, the one that answers `2xx` directly, in the webhook URL field. |
| The deliveries table shows **Status** `failed` and **Error** `timeout after 10000ms`. | Your receiver took longer than 10 seconds to answer. | Answer `200` as soon as the ticket is verified and stored, and move slow work to a background job. |
| The same ticket is processed twice. | Hub retried after a timeout or an error, and your receiver does not de-duplicate. | Store `X-Loupe-Hub-Delivery` with a unique index and skip ids you have already seen (step 5). |
| The deliveries table shows **Status** `failed` and **Error** `refused: <host> resolves to a private address (<ip>)`. | The webhook URL points to a loopback, private, link-local or reserved address. Hub refuses those to protect its own network. This guard was added in 0.14.1. | Use a publicly reachable host. For local development only, start Hub with `HUB_ALLOW_PRIVATE_URLS=1`. |
| The deliveries table has rows, but **To** shows another project's name instead of `webhook`. | The project routes tickets to another project that has an inbound URL. | Set **Send tickets to** to **No project (use the external webhook)** and click **Save route**. See [Connect the receiver to the project](#connect-the-receiver-to-the-project). |
| The deliveries table shows no rows at all. | Either the project has no webhook URL and no route, so Hub answers the sending app with `"delivery": "none"` and records nothing, or Hub rejected the ticket before routing it. Hub rejects a ticket with `401` (bad signature), `404` (`unknown project`), `400` (`invalid JSON`, `user.email required` or `issue.id required`) or `403` (`user not in organization`). | Save a webhook URL and the route as in [Connect the receiver to the project](#connect-the-receiver-to-the-project). If both are set, check the response the sending app received from Hub. |

For problems on the sending side, see [Troubleshooting: Hub](../troubleshooting.md#hub).

## Next steps

- [Loupe Hub reference](../reference/hub.md): every endpoint, header and status code.
- [Connect apps to Hub](hub-connect-apps.md): send tickets from your apps to Hub.
- [Route tickets between two projects with Loupe Hub](../tutorials/hub-two-projects-local.md): try project-to-project routing locally.
- [How Loupe Hub works](../explanation/hub.md): organizations, routing and two-way sync.
- [Self-host Loupe Hub](hub-self-host.md): run your own Hub.
