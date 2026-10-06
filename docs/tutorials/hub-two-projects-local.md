# Tutorial: route a ticket between two projects with a local Loupe Hub

In this tutorial you run Loupe Hub on your own machine and watch a ticket travel from one project to another. You create two projects, **Shop** and **Tracker**, send a signed ticket from Shop, see it arrive at Tracker, and then send status updates in both directions.

You don't need a server, a domain, or a Laravel app. A small receiver script stands in for the Tracker app, and `curl` stands in for the Shop app.

The tutorial takes about 30 minutes, most of it spent creating a Google OAuth client. It follows one path from start to finish. Do every step in order. Each step tells you what you should see before you move on.

**Loupe Hub** is the service that connects Loupe installs. It holds organizations and projects, checks that every ticket is signed by a known project, and forwards the ticket to the project it is routed to. An **organization** is a group of people and projects; its members manage its projects in the Hub dashboard. A **project** stands for one app that sends or receives tickets; each project has its own ID and secret. A **ticket** is a Loupe comment sent through Hub.

> **Development only.** This tutorial starts Hub with `HUB_ALLOW_PRIVATE_URLS=1` so it can deliver to receivers on `127.0.0.1`. Never set this variable on a Hub that other people use. Without it, Hub refuses to deliver to private, loopback, and link-local addresses.

## Contents

- [What you build](#what-you-build)
- [Before you begin](#before-you-begin)
- [Get the code](#get-the-code)
- [Create a Google OAuth client](#create-a-google-oauth-client)
- [Step 1: Seed an organization and the Shop project](#step-1-seed-an-organization-and-the-shop-project)
- [Step 2: Start Hub](#step-2-start-hub)
- [Step 3: Sign in to the dashboard](#step-3-sign-in-to-the-dashboard)
- [Step 4: Create the Tracker project](#step-4-create-the-tracker-project)
- [Step 5: Start a receiver for Tracker](#step-5-start-a-receiver-for-tracker)
- [Step 6: Route Shop's tickets to Tracker](#step-6-route-shops-tickets-to-tracker)
- [Step 7: Send a ticket from Shop](#step-7-send-a-ticket-from-shop)
- [Step 8: Check the delivery log](#step-8-check-the-delivery-log)
- [Step 9: Send updates in both directions](#step-9-send-updates-in-both-directions)
- [What you learned](#what-you-learned)
- [Clean up](#clean-up)
- [If something goes wrong](#if-something-goes-wrong)
- [Next steps](#next-steps)

## What you build

```text
curl (as Shop) ──signed POST /v1/issues──▶ Loupe Hub :8790 ──signed POST──▶ receiver :8792 (as Tracker)
```

By the end, you have:

- One organization, **Demo Org**, with two projects.
- **Demo Project**, created by the seed script, which plays the role of **Shop**: it sends tickets.
- **Tracker**, created in the dashboard: it receives tickets on an inbound URL.
- A route that sends every Shop ticket to Tracker.

## Before you begin

You need:

- **Node.js 24 or later.** Hub runs its TypeScript source directly, with no build step, which needs Node 24. Check your version:

  ```bash
  node --version
  ```

  You should see `v24` followed by a minor and patch version, for example `v24.1.0`.
- **git**, to clone the repository.
- **`openssl` and `curl`** on your `PATH`.
- **A Google account and access to the Google Cloud console.** The Hub dashboard signs you in with Google, so you create a Google OAuth client in [Create a Google OAuth client](#create-a-google-oauth-client).
- **The email address of your Google account.** You become the owner of the organization under this address.
- **A Chromium-based browser**, such as Chrome. Hub's session cookie is marked `Secure`, and Chromium accepts `Secure` cookies on `http://localhost`.
- **Three terminal windows**: one for Hub, one for the receiver, and one for `curl`.

## Get the code

1. Clone the repository:

   ```bash
   git clone https://github.com/mohamed-ashraf-elsaed/loupe.git
   ```

   You should see git finish with `done.` and a new `loupe` directory.

2. Move into the clone:

   ```bash
   cd loupe
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

   You should see npm finish with an `added ... packages` summary and no `npm ERR!` lines.

Run every command in this tutorial from this repository root.

## Create a Google OAuth client

The Hub sign-in page uses Google Identity Services, Google's sign-in button library. It needs an OAuth client ID of type *Web application*. Google's console changes its labels from time to time; if a screen differs from these steps, follow Google's guide, [Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

1. In the Google Cloud console, open **Google Auth Platform**. If it asks you to configure the app first, fill in **Branding** (an app name and a support email), and under **Audience** choose **External**.
2. Under **Audience**, in **Test users**, add the email of your Google account. While the app's publishing status is **Testing**, only test users can sign in.
3. Go to **Clients > Create client** and choose **Web application**.
4. Under **Authorized JavaScript origins**, add both of these origins. Google requires both for local testing:

   ```text
   http://localhost
   http://localhost:8790
   ```

   You don't need a redirect URI.
5. Click **Create**, then copy the **Client ID**. It ends in `.apps.googleusercontent.com`. You use it in step 2.

Because the authorized origin is `localhost`, you open the dashboard at `http://localhost:8790` in step 3, not at `http://127.0.0.1:8790`.

## Step 1: Seed an organization and the Shop project

The seed script creates an organization and a project directly in Hub's database, so you don't have to sign in yet. It takes three arguments: the owner's email, a webhook URL, and an allowed email domain. A **webhook URL** is an external address that Hub posts a project's tickets to when the project has no route to another project. Nothing listens on the seeded webhook URL in this tutorial, and after step 6 Hub no longer uses it.

1. In the first terminal, make sure Hub uses an embedded database, and choose a folder for it:

   ```bash
   unset DATABASE_URL
   export HUB_PG_DIR="$HOME/loupe-hub-tutorial/pg"
   ```

   The commands print nothing. Hub and the seed script connect to the Postgres server in `DATABASE_URL` whenever that variable is set, so `unset DATABASE_URL` keeps this tutorial away from any real database your shell points to. Without it, Hub stores its data in an embedded Postgres (PGlite) in the `HUB_PG_DIR` folder. Hub and the seed script must use the same folder.

2. Run the seed script once. Each run creates another organization and project, so a second run gives you two **Demo Org** entries.

   ```bash
   node packages/hub/seed.ts <YOUR_GOOGLE_EMAIL> http://127.0.0.1:8791/webhook acme.com
   ```

   Replace `<YOUR_GOOGLE_EMAIL>` with the email of your Google account. The seed script makes this address the owner of the organization, and the dashboard only shows organizations you belong to.

   You should see output like this, with your own IDs and secrets:

   ```text
   [hub] embedded Postgres (PGlite) at /home/you/loupe-hub-tutorial/pg
   organization   org_…  (owner you@example.com, allowed domain @acme.com)
   project        prj_…  → http://127.0.0.1:8791/webhook

   LOUPE_PROJECT_ID=prj_…
   LOUPE_PROJECT_SECRET=psk_…
   WEBHOOK_SECRET=whs_…
   ```

3. Copy the `LOUPE_PROJECT_ID` and `LOUPE_PROJECT_SECRET` lines somewhere safe. You use them in step 7 to sign requests as Shop. `WEBHOOK_SECRET` signs deliveries to the webhook URL; you don't use it in this tutorial.

The seed script names the organization **Demo Org** and the project **Demo Project**. In this tutorial, Demo Project plays the role of **Shop**, the app your users report issues from.

The **allowed domain** `acme.com` means that Hub accepts tickets from any `@acme.com` email address, in addition to the organization's explicit members. You rely on this in step 7.

## Step 2: Start Hub

1. In the same terminal, start Hub:

   ```bash
   HUB_ALLOW_PRIVATE_URLS=1 GOOGLE_CLIENT_ID=<GOOGLE_CLIENT_ID> node packages/hub/index.ts
   ```

   Replace `<GOOGLE_CLIENT_ID>` with the client ID of your Google OAuth client. It ends in `.apps.googleusercontent.com`.

   You should see:

   ```text
   [hub] embedded Postgres (PGlite) at /home/you/loupe-hub-tutorial/pg
   [hub] Loupe Hub on http://127.0.0.1:8790
   ```

2. Leave this terminal running.

`HUB_ALLOW_PRIVATE_URLS=1` is required here because the Tracker receiver in this tutorial listens on `127.0.0.1`. Hub normally refuses to deliver to loopback and private addresses. This setting is for local development only.

Hub creates a random session secret each time it starts, because `HUB_SESSION_SECRET` isn't set. If you restart Hub, sign in again.

## Step 3: Sign in to the dashboard

1. Open `http://localhost:8790` in your browser. Use `localhost`, not `127.0.0.1`: the Google client accepts only the origins you added.

   You should see the **Sign in** page with a **Sign in with Google** button.

   ![The Loupe Hub sign-in page with a Sign in with Google button](../images/hub-signin.png)

2. Click **Sign in with Google** and choose the account whose email you passed to the seed script.

   You should see the **Organizations** page, with **Demo Org** listed and your role shown as **owner**.

3. Click **Demo Org**.

   You should see the organization page with:

   - The line **Organization ID `org_…` · your role: owner**.
   - Under **Allowed members**, the sentence **Issues are accepted from these Google emails, and from any `@acme.com` email.** and a table with your email.
   - A **Projects** table with **Demo Project**.

   ![The Demo Org page with the Allowed members table and the Projects table](../images/hub-org.png)

## Step 4: Create the Tracker project

1. On the Demo Org page, under **New project**, type `Tracker` in **Project name**. Leave **External webhook URL** empty.
2. Click **Create project**.

   You should see the Tracker project page with a card that says **Copy now. These secrets are shown only once.** The card holds two values: **Project Secret (LOUPE_PROJECT_SECRET)** and **Webhook signing secret**. The webhook signing secret signs deliveries to an external webhook URL; you don't use it in this tutorial.

   Don't reload this page. Hub showed it in answer to the form you submitted, so a reload submits the form again and creates a second Tracker project with different secrets.

   ![The one-time secrets card for the new Tracker project](../images/hub-project-secrets.png)

3. Copy the **Project Secret** (it starts with `psk_`) and the **Project ID** shown below the card (it starts with `prj_`). You call them `<TRACKER_PROJECT_SECRET>` and `<TRACKER_PROJECT_ID>` in the next steps.

   Hub shows the secret only on this page. If you lose it, click **Rotate project secret** on the project page to get a new one.

## Step 5: Start a receiver for Tracker

The repository includes a small receiver script. It checks the signature on each request with the secret you give it, prints the payload, and answers `200`. It accepts any path.

When Hub sends a ticket from one project to another, it signs the request with the **destination project's own Project Secret**. So the Tracker receiver needs Tracker's `psk_` secret, not a webhook secret.

1. In the second terminal, start the receiver on port 8792:

   ```bash
   WEBHOOK_SECRET=<TRACKER_PROJECT_SECRET> PORT=8792 node packages/hub/tools/webhook-receiver.ts
   ```

   Replace `<TRACKER_PROJECT_SECRET>` with the `psk_…` value you copied in step 4.

   You should see:

   ```text
   [receiver] listening on http://127.0.0.1:8792
   ```

2. Leave this terminal running.

## Step 6: Route Shop's tickets to Tracker

A project can receive tickets only when it has an **inbound URL**: the address Hub posts tickets to. A real Laravel app receives them at `<app>/loupe/v1/hub/inbound`. Here you point it at the receiver.

1. On the Tracker project page, under **Routing**, find the second form, below **Send tickets to**. Its field has no label; its placeholder starts with **Inbound URL, e.g.** Type this URL into that field:

   ```text
   http://127.0.0.1:8792/loupe/v1/hub/inbound
   ```

2. Click **Save inbound URL**.

   You should see the page reload with **Inbound URL** showing the address you entered.

3. Click **← Demo Org**, then click **Demo Project**.
4. Under **Routing**, in the **Send tickets to** list, choose **Tracker**.

   The list shows only projects that have an inbound URL. If Tracker is missing, go back to substep 1.

5. Click **Save route**.

   You should see **Tickets go to Tracker** near the top of the Demo Project page.

   ![The Demo Project routing forms with Tracker chosen in the Send tickets to list](../images/hub-project-routing.png)

A route to another project takes priority over the project's webhook URL. Demo Project still has the seeded webhook `http://127.0.0.1:8791/webhook`, but Hub no longer uses it for tickets.

## Step 7: Send a ticket from Shop

Now you act as the Shop app and send one ticket to Hub. Every request to Hub's API carries three headers:

| Header | Value |
|---|---|
| `X-Loupe-Project` | The sending project's ID, `prj_…` |
| `X-Loupe-Timestamp` | The current Unix time in seconds |
| `X-Loupe-Signature` | The hex HMAC-SHA256 of `<timestamp>.<body>`, keyed with the project's secret |

HMAC-SHA256 is a keyed hash: only someone who holds the secret can produce the same value for the same text, so Hub knows the request came from the project and wasn't changed on the way.

Hub rejects a timestamp that is more than 5 minutes away from its clock, so compute the timestamp and signature right before you send.

1. In the third terminal, set Shop's credentials from step 1:

   ```bash
   SHOP_ID=<LOUPE_PROJECT_ID>
   SHOP_SECRET=<LOUPE_PROJECT_SECRET>
   ```

   Replace `<LOUPE_PROJECT_ID>` and `<LOUPE_PROJECT_SECRET>` with the values the seed script printed. The commands print nothing.

2. Write the ticket. The `user` is the person who reported it. The `issue` is a Loupe comment; Hub requires only a non-empty `issue.id` and passes the rest through unchanged:

   ```bash
   BODY='{"user":{"email":"sara@acme.com","name":"Sara"},"issue":{"id":"TCK-42","title":"Checkout button overlaps footer","body":"On a 1280px-wide window the Pay button sits on top of the footer.","url":"/checkout"}}'
   ```

   The command prints nothing.

3. Sign the body:

   ```bash
   TS=$(date +%s)
   SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SHOP_SECRET" -hex | sed 's/^.* //')
   ```

   The commands print nothing.

4. Send it:

   ```bash
   curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:8790/v1/issues \
     -H 'Content-Type: application/json' \
     -H "X-Loupe-Project: $SHOP_ID" \
     -H "X-Loupe-Timestamp: $TS" \
     -H "X-Loupe-Signature: $SIG" \
     --data "$BODY"
   ```

   You should see a `202` response that names Tracker as the destination:

   ```text
   {"id":"dlv_…","delivery":"ok","destination":{"id":"prj_…","name":"Tracker"}}
   HTTP 202
   ```

   `id` is the **delivery ID**. `"delivery":"ok"` means the receiver answered with a 2xx status.

5. Switch to the receiver terminal.

   You should see the signed delivery and its payload:

   ```text
   [receiver] … POST /loupe/v1/hub/inbound signature OK (delivery dlv_…)
   {
     "project_id": "prj_…",
     "organization_id": "org_…",
     "source": {
       "project_id": "prj_…",
       "project_name": "Demo Project",
       "organization_id": "org_…",
       "organization_name": "Demo Org"
     },
     "user": {
       "email": "sara@acme.com",
       "name": "Sara"
     },
     "issue": {
       "id": "TCK-42",
       "title": "Checkout button overlaps footer",
       "body": "On a 1280px-wide window the Pay button sits on top of the footer.",
       "url": "/checkout"
     },
     "received_at": "…"
   }
   ```

   Hub added `source`, so Tracker knows which project and organization the ticket came from. Hub also sends an `X-Loupe-Hub-Project` header with Tracker's ID, which a Laravel receiver checks. The receiver script doesn't print headers.

Hub accepted `sara@acme.com` even though Sara isn't a member of the organization, because her email domain matches the organization's allowed domain, `acme.com`. A reporter must be an explicit member or have an email on the allowed domain; anyone else gets `403 {"error":"user not in organization"}`.

## Step 8: Check the delivery log

1. In the browser, reload the Demo Project page.

   You should see a row under **Last 20 deliveries** with issue `TCK-42`, **To** set to `Tracker`, status `ok`, HTTP `200`, and `1` attempt.

   ![The Demo Project page with Tickets go to Tracker and one ok delivery in the Last 20 deliveries table](../images/hub-project.png)

The log is kept on the sending project. Tracker's page shows no row for this ticket, and updates (the next step) are not logged here.

## Step 9: Send updates in both directions

Once a ticket has been delivered from one project to another, either project can send an **update**: a status change or a message. Hub forwards it to the other side. The caller signs the update with its own secret, exactly like a ticket.

### Send a status update as Tracker

1. In the third terminal, set Tracker's credentials from step 4:

   ```bash
   TRACKER_ID=<TRACKER_PROJECT_ID>
   TRACKER_SECRET=<TRACKER_PROJECT_SECRET>
   ```

   Replace `<TRACKER_PROJECT_ID>` and `<TRACKER_PROJECT_SECRET>` with the values you copied in step 4. The commands print nothing.

2. Write, sign, and send a status update for `TCK-42`:

   ```bash
   UPDATE='{"kind":"status","status":"in_progress","label":"In progress","reference":"TCK-42"}'
   TS=$(date +%s)
   SIG=$(printf '%s' "$TS.$UPDATE" | openssl dgst -sha256 -hmac "$TRACKER_SECRET" -hex | sed 's/^.* //')
   curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:8790/v1/issues/TCK-42/updates \
     -H 'Content-Type: application/json' \
     -H "X-Loupe-Project: $TRACKER_ID" \
     -H "X-Loupe-Timestamp: $TS" \
     -H "X-Loupe-Signature: $SIG" \
     --data "$UPDATE"
   ```

   You should see:

   ```text
   {"delivery":"none"}
   HTTP 202
   ```

   Hub accepted the update but had nowhere to send it. An update from the destination goes back to the **reply URL** the source sent with the original ticket. Your `curl` in step 7 sent no `reply_url`, so Hub stored none.

   A Laravel app doesn't have this gap. When the `loupekit/laravel` package forwards a comment to Hub, it sends its own receiver route, `<app>/loupe/v1/hub/inbound`, as the `reply_url`. Status changes and replies made in the receiving app then flow back to the sender automatically.

### Send a message as Shop

An update from the source goes to the destination's current inbound URL, which Tracker has.

1. In the third terminal, where `SHOP_ID` and `SHOP_SECRET` are still set from step 7, write, sign, and send a message update as Shop:

   ```bash
   UPDATE='{"kind":"message","message":{"id":"msg-1","author":{"name":"Sara","email":"sara@acme.com"},"body":"It also happens on the cart page.","createdAt":"2026-10-05T10:00:00Z"}}'
   TS=$(date +%s)
   SIG=$(printf '%s' "$TS.$UPDATE" | openssl dgst -sha256 -hmac "$SHOP_SECRET" -hex | sed 's/^.* //')
   curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:8790/v1/issues/TCK-42/updates \
     -H 'Content-Type: application/json' \
     -H "X-Loupe-Project: $SHOP_ID" \
     -H "X-Loupe-Timestamp: $TS" \
     -H "X-Loupe-Signature: $SIG" \
     --data "$UPDATE"
   ```

   You should see:

   ```text
   {"id":"dlv_…","delivery":"ok"}
   HTTP 202
   ```

2. Switch to the receiver terminal.

   You should see the update, wrapped by Hub:

   ```text
   [receiver] … POST /loupe/v1/hub/inbound signature OK (delivery dlv_…)
   {
     "type": "update",
     "issue_id": "TCK-42",
     "from": {
       "project_id": "prj_…",
       "project_name": "Demo Project"
     },
     "update": {
       "kind": "message",
       "message": {
         "id": "msg-1",
         "author": {
           "name": "Sara",
           "email": "sara@acme.com"
         },
         "body": "It also happens on the cart page.",
         "createdAt": "2026-10-05T10:00:00Z"
       }
     }
   }
   ```

   Hub checks that the body is a JSON object whose `kind` is `status` or `message`, and that your project is one side of a delivered ticket with that ID. It relays the rest of the body as you sent it.

## What you learned

In this tutorial you:

- Ran Loupe Hub locally with an embedded database, and seeded an organization without signing in.
- Signed in to the dashboard with Google and created a second project, whose secrets Hub shows only once.
- Gave Tracker an inbound URL and routed Shop's tickets to it.
- Signed a ticket with Shop's project secret, and saw Hub re-sign it with Tracker's project secret on delivery.
- Saw that Hub accepts reporters from the organization's allowed domain.
- Sent updates in both directions, and saw why an update from the destination needs the reply URL that a Laravel app sends for you.

## Clean up

1. Press `Ctrl+C` in the Hub terminal and in the receiver terminal.

   You should see your shell prompt return in both terminals.
2. Delete the tutorial database:

   ```bash
   rm -rf "$HOME/loupe-hub-tutorial"
   ```

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Hub or the seed script prints `[hub] Postgres via DATABASE_URL` instead of the `embedded Postgres (PGlite)` line. | `DATABASE_URL` is set in your shell, so they use that Postgres server. | Press `Ctrl+C`, run `unset DATABASE_URL`, and start again from step 1. The seed script may also have written **Demo Org** to that server. |
| The sign-in page says **GOOGLE_CLIENT_ID is not configured on this server.** | You started Hub without `GOOGLE_CLIENT_ID`. | Press `Ctrl+C` in the Hub terminal and run the command in step 2 with your client ID. |
| The **Sign in with Google** button shows an error, such as `origin_mismatch`. | The Google client doesn't list the origin you opened. | Add both `http://localhost` and `http://localhost:8790` to the client's authorized JavaScript origins, and open `http://localhost:8790`, not `http://127.0.0.1:8790`. |
| After sign-in, the page says **You are not a member of any organization yet.** | You signed in with a Google account whose email differs from the one you passed to the seed script. | Click **Sign out** at the top of the page and sign in with the seeded account, or stop Hub, delete `$HOME/loupe-hub-tutorial`, and start again from step 1 with the right email. |
| The dashboard lists **Demo Org** twice. | You ran the seed script more than once. | Stop Hub, delete `$HOME/loupe-hub-tutorial`, and start again from step 1. Run the seed script once. |
| Demo Org lists two **Tracker** projects. | You reloaded the page after **Create project**. | Open the Tracker whose **Project ID** matches the one you copied. If you're unsure, click **Rotate project secret** on it, copy the new secret, and restart the receiver with it. |
| A dashboard form answers **Bad origin** (403). | Hub refuses a form post whose `Origin` header is missing or names a different host from the one you opened. | Open `http://localhost:8790` directly in the browser and submit the form again. |
| **Tracker** is missing from the **Send tickets to** list. | Tracker has no inbound URL. | Do step 6, substeps 1 and 2, then return to Demo Project. |
| `curl` answers `HTTP 401` with `{"error":"timestamp out of range"}`. | More than 5 minutes passed between computing `TS` and sending. | Run the `TS=` and `SIG=` lines again, then send. |
| `curl` answers `HTTP 401` with `{"error":"invalid signature"}`. | The secret doesn't belong to the project in `X-Loupe-Project`, or the body changed after you signed it. | Set the ID and secret again from the seed output or step 4, then sign and send again. |
| `curl` answers `HTTP 401` with `missing X-Loupe-Project, X-Loupe-Timestamp or X-Loupe-Signature`. | A variable is empty, for example because you opened a new terminal. | Repeat step 7, substeps 1 to 3, in this terminal. |
| `curl` answers `HTTP 404` with `{"error":"unknown project"}`. | The project ID is wrong. | Copy the `prj_…` value again and set the variable again. |
| `curl` answers `HTTP 403` with `{"error":"user not in organization"}`. | The reporter's email is not an organization member and not on the allowed domain. | Use an `@acme.com` email in `user.email`, or add the email under **Allowed members**. |
| `curl` answers `"delivery":"failed"`, and the receiver prints `REJECTED: invalid signature`. | You started the receiver with the wrong secret, such as the webhook signing secret or Shop's secret. | Press `Ctrl+C` in the receiver terminal and start it again with Tracker's `psk_…` Project Secret. |
| `curl` answers `"delivery":"failed"` after about 5 seconds, and the receiver prints nothing. | The receiver isn't running, or Hub was started without `HUB_ALLOW_PRIVATE_URLS=1`. Hub tries 3 times, waiting 1 second and then 4 seconds. The Hub terminal prints `[hub] delivery dlv_… from prj_… failed:` and the reason. | Start the receiver (step 5). If the reason says `resolves to a private address`, restart Hub with the step 2 command and sign in again. |
| An update answers `HTTP 404` with `{"error":"unknown ticket"}`. | No ticket with that ID has been delivered from one project to another. | Finish step 7 with `"delivery":"ok"` first, and use the same issue ID. |

## Next steps

- [Connect apps to Hub](../how-to/hub-connect-apps.md): connect two real Laravel apps, so tickets and updates flow without `curl`.
- [Self-host Loupe Hub](../how-to/hub-self-host.md): run Hub on a server with HTTPS, Postgres, and a fixed session secret.
- [How Loupe Hub works](../explanation/hub.md): organizations, routing, signatures, and two-way sync explained.
