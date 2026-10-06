# Publish the extension to the Chrome Web Store

This page has two parts:

- **[Part 1: Dashboard field values](#part-1-dashboard-field-values)** is reference. It lists the
  text and files for each field in the Chrome Web Store Developer Dashboard, grouped by the
  dashboard tab that holds the field. Copy the text inside a code block as-is.
- **[Part 2: Build and upload the package](#part-2-build-and-upload-the-package)** is a how-to.
  It builds `loupe-extension.zip` and submits it for review.

Open the dashboard at <https://chrome.google.com/webstore/devconsole/>. Each item in the
dashboard has the tabs **Package**, **Store listing**, **Privacy**, **Distribution** and
**Test instructions**.

## Contents

- [Terms used on this page](#terms-used-on-this-page)
- [Part 1: Dashboard field values](#part-1-dashboard-field-values)
  - [Store listing tab: product details](#store-listing-tab-product-details)
  - [Store listing tab: graphic assets](#store-listing-tab-graphic-assets)
  - [Store listing tab: additional fields](#store-listing-tab-additional-fields)
  - [Privacy tab](#privacy-tab)
  - [Distribution tab](#distribution-tab)
  - [Test instructions tab](#test-instructions-tab)
- [Part 2: Build and upload the package](#part-2-build-and-upload-the-package)
  - [Prerequisites](#prerequisites)
  - [Steps](#steps)
  - [Verify](#verify)
  - [Troubleshooting](#troubleshooting)
  - [Next steps](#next-steps)

## Terms used on this page

The store copy below uses these terms without defining them, because store copy must stay short.

| Term | Meaning | More |
|---|---|---|
| MCP | The Model Context Protocol. It lets an AI agent, such as Claude Code, call tools that a separate program, the MCP server, provides. | [Connect Claude Code and other MCP clients](../how-to/connect-mcp-clients.md), [MCP server reference](../reference/mcp.md) |
| Project key | The Loupe project that your feedback belongs to. | [Popup fields](../reference/extension.md#popup-fields) |
| User id | Identifies you to that project. | [Popup fields](../reference/extension.md#popup-fields) |
| API base | The URL of the Loupe backend that receives your feedback. When it is empty, the extension runs in *offline mode* and saves comments in the reviewed page's `localStorage`. | [Popup fields](../reference/extension.md#popup-fields) |
| User HMAC | A signature that your server computes over your user id, so the backend can check that requests really come from you. | [Why userHmac is computed on the server](../explanation/auth-and-privacy.md#why-userhmac-is-computed-on-the-server) |

# Part 1: Dashboard field values

## Store listing tab: product details

**Title**

```text
Loupe — visual feedback
```

The title equals the `name` field in `packages/extension/manifest.json`.

**Summary** (132 characters maximum)

The summary must equal the `description` field in `packages/extension/manifest.json`. If you
change one, change the other. To check the manifest value, run this from the repository root:

```bash
grep '"description"' packages/extension/manifest.json
```

You should see:

```text
  "description": "Inspect any page, pin comments to elements, and hand them to Claude — no SDK install required.",
```

```text
Inspect any page, pin comments to elements, and hand them to Claude — no SDK install required.
```

**Category:** `Developer Tools`

**Language:** `English (United States)`

**Description** (paste into the Description box)

```text
Loupe turns "can you fix this?" into a specific task, written on the page it is about.

Click an element on a website, pin a comment to it, and capture a screenshot. Loupe records what you clicked (the element, its HTML, and its computed styles), so the developer knows which element you mean. Comments go to a triage board and can be handed to Claude Code over MCP, so an AI agent can make the change with that context.

For product managers, designers, QA, and the developers who act on their feedback.

WHAT YOU CAN DO
• Inspect and pin: click an element and attach a comment anchored to it.
• Free notes: add a page-level comment with Note mode. No element or screenshot is needed.
• Right-click to start: right-click a page, an image, a video, an audio player, a link, or a form field and choose "Comment on …". Loupe opens in Inspect mode, and you click the element you want to comment on. Right-click selected text to open a free note instead.
• Show or hide per site: right-click and choose "Show / hide Loupe on this page". A site you hide stays hidden until you show it again from the same menu.
• Capture: screenshots taken from the browser's own pixels of the visible tab, cropped to the element or region. Elements marked data-loupe-redact are painted over before the image leaves the page.
• Record: capture a short screen video of a region with the Record tool. You choose what to share and can stop at any time.
• Survive redeploys: pins re-anchor to their element after the markup changes, using a multi-signal fingerprint.
• Triage: every comment lands on a board with five stages: Queue, To Do, In Progress, In Review, Resolved.
• Hand it to Claude: Claude Code reads comments over MCP (element HTML, computed styles, the screenshot as an image), proposes HTML/CSS changes back to the dashboard, and can move the comment to In Review. Claude Code is instructed to stop at In Review and leave resolving to a person.

WHY LOUPE
• Works on any http or https site: no code change or SDK install on the target page.
• Context travels with the comment: the element and its styles go with every comment.
• Open source (MIT). The extension runs on a tab only when you start it from the popup or a right-click menu, and it can redact marked fields from screenshots.

HOW IT WORKS
1. Click the Loupe icon. Enter your project key and your user id (both are required). Optionally enter a name, an API base, and a user HMAC from your server.
2. Click "Start Loupe on this tab", or right-click the page and choose "Comment on …".
3. Inspect an element or add a free note, write your comment, and capture a screenshot.
4. Review comments on the board, or let Claude Code work through them over MCP.

Loupe is open source. Docs, the SDK, and the self-hostable backend are at github.com/mohamed-ashraf-elsaed/loupe.
```

## Store listing tab: graphic assets

All files are in this folder, `docs/store/`.

| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshot 1 | `screenshot-1-inspect.jpg` | 1280×800 |
| Screenshot 2 | `screenshot-2-board.jpg` | 1280×800 |
| Screenshot 3 | `screenshot-3-claude.jpg` | 1280×800 |
| Small promo tile | `promo-small-440x280.jpg` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.jpg` | 1400×560 |

Promo video: optional. Leave it blank, or add a YouTube URL later.

Two files in this folder are not uploaded:

| File | What it is |
|---|---|
| `icon-512.png` | A 512×512 icon. The public site uses it as its logo (`docs/index.html:56`). |
| `assets.html` | The HTML page that the promo tiles and screenshots are drawn from. |

## Store listing tab: additional fields

| Field | Value |
|---|---|
| Homepage URL | `https://mohamed-ashraf-elsaed.github.io/loupe/` |
| Support URL | `https://github.com/mohamed-ashraf-elsaed/loupe/issues` |
| Official URL (optional) | `https://mohamed-ashraf-elsaed.github.io/loupe/`. You must verify the site in Google Search Console first. |
| Mature content | No |

Turn on "Item support" to show the Support URL.

## Privacy tab

### Single purpose description

```text
Loupe lets you attach visual feedback to elements of the web page in the current tab: you pick an element or region, write a comment, and capture a screenshot or short recording, and Loupe sends that feedback to a Loupe backend you choose, or keeps it in your browser.
```

### Permissions justification

The manifest requests exactly these four permissions, and no host permissions
(`packages/extension/manifest.json`).

| Permission | Why the extension needs it |
|---|---|
| `activeTab` | Capture the visible tab for a screenshot, and inject Loupe into the tab you started it on. |
| `scripting` | Inject the Loupe content script when you click "Start Loupe on this tab" or a right-click menu item. |
| `storage` | Save the popup settings (project key, user, API base, user HMAC) and the list of sites you hid, and, for a moment, which tool a right-click menu item asked for (session storage). |
| `contextMenus` | Add the "Comment on …" and "Show / hide Loupe on this page" right-click menu items. |

### Remote code

Answer **No, I am not using remote code.** The extension injects only its own packaged
`content.js` (`popup.js:34` and `background.js:95` both pass `files: ["content.js"]`), and the
build bundles the SDK into that file.

### Data usage

Use this table to choose the data types to disclose and to check each certification
statement. The full text is in the privacy policy.

| Data | Where it is kept | Where it is sent |
|---|---|---|
| Popup settings: project key, user id and name, API base, user HMAC | `chrome.storage.local` | With each request to the backend at the API base, as the user id and, when set, the user HMAC |
| Hidden sites: each origin you hid and whether it is hidden | `chrome.storage.local` | Nowhere |
| `loupeIntent`: the tool a right-click item asked for, and when | `chrome.storage.session`, deleted when Loupe starts | Nowhere |
| A comment: your text, the page path and query string, the selected element's HTML and computed styles, viewport size | The backend at the API base, or the page's `localStorage` in offline mode | Only to the backend at the API base |
| Screenshots, recordings and files you attach | Same as a comment | Only to the backend at the API base |

The extension's background worker makes no network requests. Loupe's authors run no shared
server and never receive this data.

### Privacy policy

```text
https://mohamed-ashraf-elsaed.github.io/loupe/privacy.html
```

## Distribution tab

| Field | Value |
|---|---|
| Visibility | Public or Unlisted, your choice. |

## Test instructions tab

A reviewer can test the extension without a backend, in offline mode.

```text
1. Click the Loupe icon to open the popup.
2. Enter Project key: pk_demo_acme and User id: u_92. Leave API base and User HMAC empty. Comments are then saved only in the page's localStorage.
3. Open any http or https page and click "Start Loupe on this tab". The Loupe panel opens in Inspect mode.
4. Click an element, write a comment, and save it.
If nothing happens after step 3, the project key or user id is empty: Loupe does not start, and it writes "[loupe] Set a project key and user in the extension popup first." to the page's developer console. Fill in both fields and click "Start Loupe on this tab" again.
```

# Part 2: Build and upload the package

Use this procedure for each release. No script or workflow creates or uploads the package,
and `loupe-extension.zip` is gitignored, so it is never in the repository. The same procedure,
in short form, is in [RELEASING.md](../../RELEASING.md#chrome-web-store-extension).

## Prerequisites

- A clone of the repository, Node.js 24 and npm.
- The `zip` command-line tool. To check, run `zip -v`. You should see the version banner.
- A registered Chrome Web Store developer account that can open the dashboard.

## Steps

1. Open `packages/extension/manifest.json` and set `"version"` to the release version, for
   example `"0.14.0"`. No script bumps it; edit it by hand, together with the other files in
   [Version strings to bump together](../../RELEASING.md#version-strings-to-bump-together).

   To check, run this from the repository root:

   ```bash
   grep '"version"' packages/extension/manifest.json
   ```

   You should see `"version": "<VERSION>",`, where `<VERSION>` is the release version.

2. Check that the Summary in [Product details](#store-listing-tab-product-details) still equals
   the manifest `description`.

3. Install the dependencies from the repository root:

   ```bash
   npm install
   ```

   You should see npm finish with an `added … packages` line, or `up to date`.

4. Build all packages:

   ```bash
   npm run build
   ```

   The build runs shared, sdk, mcp, dashboard, then extension. You should see the extension
   build end with a tsup `Build success` line.

   This writes `packages/extension/content.js`, which is ignored by git. Run the full build
   rather than only `npm run build:extension`: the content script bundles `@loupekit/sdk` from
   `packages/sdk/dist/`, so building only the extension packs whatever SDK build is already on
   disk, and on a fresh clone it fails.

5. Delete any old package, so the new zip does not keep files from the last one:

   ```bash
   rm -f loupe-extension.zip
   ```

6. Create the zip from the repository root, leaving out sources and tests:

   ```bash
   (cd packages/extension && zip -r ../../loupe-extension.zip . -x "*.ts" "node_modules/*" "test/*")
   ```

   The parentheses run the command in a subshell, so your shell stays in the repository root.
   You should see `loupe-extension.zip` in the repository root. It contains `manifest.json`,
   `background.js`, `content.js`, `popup.html`, `popup.js`, `package.json`, and `icons/`
   (16, 48 and 128 pixels).

7. Open <https://chrome.google.com/webstore/devconsole/>.

   You should see your list of items.

8. Upload `loupe-extension.zip`:
   - For a first release, click **Add new item** and choose the zip.
   - For a later release, open the Loupe item, go to the **Package** tab, click
     **Upload New Package** and choose the zip.

   You should see the item open in the dashboard with its tabs.

9. Fill in the **Store listing**, **Privacy**, **Distribution** and **Test instructions** tabs
   from [Part 1](#part-1-dashboard-field-values).

10. Click **Submit for Review**.

    The item goes into review. Until the review passes, existing users keep the published
    version.

## Verify

Before you upload, list the zip contents:

```bash
unzip -l loupe-extension.zip
```

You should see `content.js` and `manifest.json` in the list, and no `.ts` file and no `test/`
entry. To check the packaged version, run:

```bash
unzip -p loupe-extension.zip manifest.json | grep '"version"'
```

You should see the release version.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The zip holds a file you deleted, or an old version. | `zip -r` adds to an existing archive instead of replacing it. | Delete `loupe-extension.zip` (step 5), then create it again (step 6). |
| `unzip -l` does not list `content.js`. | The build step was skipped or failed. | Run `npm run build` (step 4), check for `Build success`, then repeat steps 5 and 6. |
| The dashboard rejects the upload because of its version. | Each new version must have a larger version number than the previous one. | Set a higher `"version"` (step 1), then repeat steps 4 to 8. |
| A reviewer reports that Start does nothing. | The project key or user id was empty, so the content script stopped. | Check that the [Test instructions](#test-instructions-tab) give both values. |

## Next steps

- [Use the Loupe browser extension](../how-to/browser-extension.md): install from source and use it.
- [Browser extension reference](../reference/extension.md): every file, permission, menu and storage key.
- [RELEASING.md](../../RELEASING.md): the rest of a release.
