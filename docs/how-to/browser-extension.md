# Use the Loupe browser extension

This guide shows you how to load the Loupe browser extension from source, configure it, and start Loupe on any website without adding the SDK to that site.

The extension injects the same SDK core as the embedded widget, but only when you ask for it: from the toolbar popup or from the right-click menu. The main difference is where screenshots come from. The embedded widget re-renders the page's DOM into an image. The extension asks the browser for real pixels of the *visible viewport* (the part of the page currently on screen) and crops them to the element or region you chose.

A *project key* identifies the Loupe project that your comments belong to. A *user id* identifies you as the author of each comment.

## Contents

- [Prerequisites](#prerequisites)
- [Steps](#steps)
  - [1. Install the extension from source](#1-install-the-extension-from-source)
  - [2. Start a local backend (optional)](#2-start-a-local-backend-optional)
  - [3. Configure the extension](#3-configure-the-extension)
  - [4. Start Loupe on a tab](#4-start-loupe-on-a-tab)
  - [5. Start Loupe from the right-click menu](#5-start-loupe-from-the-right-click-menu)
  - [6. Hide Loupe on a site](#6-hide-loupe-on-a-site)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)
- [Next steps](#next-steps)

## Prerequisites

- Google Chrome or another Chromium-based browser. The extension uses Manifest V3, the current format that Chrome uses to describe an extension and its permissions.
- A clone of the Loupe repository and Node.js 24 with npm. Node 24 is the version CI uses.
- A project key and a user id. For a local trial, use the demo project `pk_demo_acme` and the demo user `u_92` that [step 2](#2-start-a-local-backend-optional) creates.
- Optional: a Loupe backend. Without one, the extension runs in *offline mode*: comments are saved only in your browser, in the `localStorage` of the page you review. [Step 2](#2-start-a-local-backend-optional) starts a local backend at `http://localhost:8787`.
- If you use a backend: a *user HMAC*. This is HMAC-SHA256 of your user id, keyed with the project secret. Your server computes it. The extension sends it with every request so the backend can check that you are who you say you are. The local reference server rejects any request that has no valid HMAC, so with that server the HMAC is required.

## Steps

### 1. Install the extension from source

This guide does not use the Chrome Web Store. You build the extension from the repository and load it as an unpacked extension.

1. In the root folder of your clone, install the dependencies:

   ```bash
   npm install
   ```

   You should see npm finish with an `added … packages` line.

2. Build all packages, including the extension:

   ```bash
   npm run build
   ```

   The build runs in the order shared, sdk, mcp, dashboard, extension. You should see each workspace build without errors, and the extension build ends with a tsup `Build success` line.

   This creates `packages/extension/content.js`, the script that the extension injects into a page. The file is a build artifact and is not committed to git, so a fresh clone does not have it.

   Run the full build, not only `npm run build:extension`, on a fresh clone. The content script bundles `@loupekit/sdk`, which in turn uses `@loupekit/shared`, and both are loaded from their `dist/` folders. Those folders are not in git either, so `npm run build:extension` alone fails until they exist. After the first full build, `npm run build:extension` is enough to rebuild the extension.

3. Check that the content script exists:

   ```bash
   ls packages/extension/content.js
   ```

   You should see `packages/extension/content.js` printed back.

4. Open `chrome://extensions` in Chrome.

   You should see the Extensions page.

5. Turn on **Developer mode** in the top-right corner.

   You should see a toolbar appear with the **Load unpacked** button.

6. Click **Load unpacked**.

   You should see a folder picker.

7. Select the `packages/extension` folder of your clone, the folder that contains `manifest.json`.

   You should see a card named **Loupe — visual feedback** in the list of extensions. The card shows the version, 0.14.1.

8. Optional: pin the extension to the toolbar from the puzzle-piece menu, so the Loupe icon is always visible.

> **Note:** Each time you rebuild `content.js`, for example after you pull changes, click the reload icon on the **Loupe — visual feedback** card on `chrome://extensions`, then reload the tab you review. Otherwise the tab keeps running the old content script.

### 2. Start a local backend (optional)

Skip this step if you want to use offline mode or if you already have a Loupe backend.

1. In the root folder of your clone, create the demo project:

   ```bash
   npm run seed
   ```

   You should see output like this:

   ```text
   Seeded project: pk_demo_acme
     admin key   (dashboard ?key= / X-Loupe-Admin): sk_demo_acme_0f3b9c
     demo HMAC    (host-app-injected for u_92): <HMAC>
   ```

   `<HMAC>` is a hex string: the user HMAC for the demo user `u_92`. Copy it; you paste it into **User HMAC** in [step 3](#3-configure-the-extension). The project secret is the value of the `LOUPE_DEMO_SECRET` environment variable, or `sk_demo_acme_0f3b9c` if it is not set. If you change the secret, run `npm run seed` again and copy the new HMAC.

2. Start the server:

   ```bash
   npm start
   ```

   You should see:

   ```text
   [loupe] embedded Postgres (PGlite) at <DATA_DIR>
   [loupe] API + static on http://localhost:8787  (dashboard: /dashboard/ · demo: /demo/)
   ```

   `<DATA_DIR>` is the database directory. The server listens on port 8787 unless you set `PORT`. Leave this terminal open.

For more about the local server, see [Run the local server and dashboard](run-local-server.md).

### 3. Configure the extension

1. Click the Loupe icon in the toolbar.

   You should see the Loupe popup with the fields below and the **Save settings** and **Start Loupe on this tab** buttons.

2. Fill in the fields:

   | Field | Required | What to enter |
   |---|---|---|
   | **Project key** | Yes | Your project key, for example `pk_demo_acme`. |
   | **User id** | Yes | Your user id, for example `u_92`. |
   | **Name** | No | Your display name, for example `Sara`. If you leave it blank, the extension saves the name `Reviewer`. |
   | **API base (optional)** | No | The base URL of your Loupe backend, for example `http://localhost:8787`. Leave it blank for offline mode. |
   | **User HMAC (optional, from your server)** | Yes, when **API base** is set | The hex HMAC of your user id. For the local server, paste the `demo HMAC` value that `npm run seed` printed. |

   The extension trims spaces from every value. There is no email field.

   You should see your values in the fields.

   ![The Loupe extension popup with the demo project key, user id, name and local API base filled in](../images/extension-popup.png)

3. Click **Save settings**.

   You should see **Saved ✓** under the buttons for about a second and a half. The settings are stored in the extension's local storage and filled in again the next time you open the popup.

### 4. Start Loupe on a tab

1. Open the website you want to review in a tab, usually an `http://` or `https://` page. For local `file://` pages, see [Troubleshooting](#troubleshooting).
2. Click the Loupe icon in the toolbar.
3. Click **Start Loupe on this tab**.

   The extension saves your settings, injects Loupe into the tab, and closes the popup. You should see the Loupe panel open with the *Inspect tool* armed. The Inspect tool lets you click one element on the page to comment on it.

   The first time you start Loupe in a browser, a short guided tour also opens over the panel. Click **Next** through the steps and then **Done**, or click **Skip**. The tour does not open again after that.

**Start Loupe on this tab** injects Loupe into the top frame of the page only. To comment inside an embedded frame, use the right-click menu in the next step.

Loupe stays on the page until you reload it or navigate away. If you click **Start Loupe on this tab** again on the same page, the popup saves your settings and closes, and nothing else changes, because Loupe is already running there.

### 5. Start Loupe from the right-click menu

You can also start Loupe from whatever you right-click. If Loupe is not running yet, the extension injects it and opens the matching tool. If it is already running, the extension switches it to that tool.

1. Right-click an element on the page.
2. Choose one of the Loupe entries:

   | Menu entry | Appears when you right-click | Tool it opens |
   |---|---|---|
   | **Comment on this page** | the page or a frame | Inspect (pick an element) |
   | `Comment on “<SELECTED_TEXT>”` | selected text | Note (a free note placed anywhere on the page, not tied to an element) |
   | **Comment on this image** | an image | Inspect |
   | **Comment on this video** | a video | Inspect |
   | **Comment on this audio** | an audio element | Inspect |
   | **Comment on this link** | a link | Inspect |
   | **Comment on this field** | an editable field | Inspect |
   | **Show / hide Loupe on this page** | the page or a frame | No tool; see [step 6](#6-hide-loupe-on-a-site) |

   In the selection entry, `<SELECTED_TEXT>` is the text you selected; Chrome fills it in.

   You should see the Loupe panel open with the chosen tool armed.

When you right-click inside an embedded frame, the extension injects Loupe into that frame, not into the top page.

### 6. Hide Loupe on a site

Use this when you never want Loupe on a particular site. This works only on `http://` and `https://` pages.

1. Right-click anywhere on a page of that site.
2. Choose **Show / hide Loupe on this page**.

   If Loupe is running, it closes and removes itself from the page. The site's origin (for example `https://shop.example.com`) is saved as hidden, and stays hidden after reloads and browser restarts.

3. To bring Loupe back, choose **Show / hide Loupe on this page** again on that site.

   The extension marks the site as not hidden and starts Loupe in the page or frame you right-clicked.

## Verify

1. Start Loupe on a page, as in [step 4](#4-start-loupe-on-a-tab).

   You should see the Loupe panel open. The round *launcher* button, which opens the panel, appears only after you close the panel. On the first start, finish or skip the guided tour.

2. With the Inspect tool armed, click an element on the page.

   You should see the *composer*, the small form where you write the comment, next to the element. **Attach screenshot** is checked.

3. In the first field (placeholder **Title — one line: what's wrong, or what you need**), type a title, such as `Checkout button overlaps footer`.

4. In the second field (placeholder **Describe what should change here…**), type a description, such as `The button covers the footer links on a narrow window.`

   You should see the **Comment** button become active. It stays disabled until both the title and the description have text.

5. Click **Comment**.

   You should see a numbered *pin*, the marker for a comment, on the element, and the comment in the **Comments** tab of the panel.

6. In the **Comments** tab, click the comment.

   You should see the comment expand and show its screenshot. The screenshot is a crop of the real pixels in the visible viewport. Areas marked with `data-loupe-redact` are painted over. Loupe does not hide its own composer before it takes the screenshot, so the composer can appear in the crop where it overlaps the element.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Nothing happens after **Start Loupe on this tab** or after a **Comment on …** menu entry. The browser console shows `[loupe] Set a project key and user in the extension popup first.` | The project key or the user id is empty. Both are required. | Open the popup, fill in **Project key** and **User id**, click **Save settings**, then start again. |
| Nothing happens after **Start Loupe on this tab** or after a **Comment on …** menu entry, and the console shows no warning. | You hid this site with **Show / hide Loupe on this page**. On a hidden site, Loupe does not start, silently. | Right-click the page and choose **Show / hide Loupe on this page** to un-hide the site. |
| You click **Start Loupe on this tab** on a `chrome://` page, an `about:` page, or the Chrome Web Store, and the popup stays open. | Chrome does not let extensions inject scripts into its own pages, so the injection fails before the popup closes. | Use Loupe on an `http://` or `https://` page. |
| Loupe does not start on a `file://` page. | Chrome blocks extensions on file URLs by default. | On `chrome://extensions`, click **Details** on the Loupe card and turn on **Allow access to file URLs**. **Show / hide Loupe on this page** still does nothing on `file://` pages, because it needs an `http://` or `https://` origin. |
| **Load unpacked** fails, and Chrome reports that the manifest file is missing. | You selected the wrong folder. | Select `packages/extension`, the folder that contains `manifest.json`. |
| The extension loads, but **Start Loupe on this tab** leaves the popup open on every page, and no right-click entry starts Loupe. | `packages/extension/content.js` is missing because the build did not run or failed. The manifest does not list `content.js`, so Chrome loads the extension without it, and the injection fails only when you start Loupe. | Run `npm run build` in the root folder, then click the reload icon on the Loupe card. |
| The extension still behaves like an older version. | The tab kept the old content script, or `content.js` was not rebuilt. | Run `npm run build:extension`, reload the extension on `chrome://extensions`, then reload the tab. |
| Comments do not reach the server, and the requests fail with `401`. | **User HMAC** is empty or does not match **User id** for this project. | Paste the HMAC for the same user id. For the local server, run `npm run seed` and copy the `demo HMAC` line for `u_92`. |
| A screenshot cuts off part of a large element. | The extension captures the visible viewport only, not the full page. | Scroll so the whole element is on screen before you click it, or comment on a smaller element. |
| The *Record tool*, which records a short video of a region, asks you to choose a screen, window, or tab to share. | The extension does not provide its own recorder. Recording uses the SDK's screen-share recorder, which uses the browser's screen-sharing prompt and crops the video to your region. | Drag the region to record, then choose the current tab in the share prompt. The crop lines up only when you share the current tab. |
| Comments you left yesterday are missing. | **API base** is blank, so comments are stored in the reviewed page's `localStorage` in your browser only. Clearing site data removes them, and other people cannot see them. | Set **API base** to a Loupe backend so comments are stored on a server. |

For more symptoms, see [Troubleshooting: Extension](../troubleshooting.md#extension).

## Next steps

- [Browser extension reference](../reference/extension.md): permissions, every context menu, and the settings the extension stores.
- [Use the widget](use-the-widget.md): [comment on an element](use-the-widget.md#comment-on-an-element), [record a short video](use-the-widget.md#record-a-short-video), [reply](use-the-widget.md#reply-mention-and-react), and [resolve](use-the-widget.md#resolve-reopen-or-delete) feedback in the panel.
- [Run the local server and dashboard](run-local-server.md): the backend that **API base** points to.
- [Authentication and privacy](../explanation/auth-and-privacy.md): how the user HMAC works and what leaves the page.
