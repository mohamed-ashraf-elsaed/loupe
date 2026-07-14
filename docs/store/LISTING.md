# Chrome Web Store — listing (copy/paste)

## Product details

**Title**
```
Loupe — visual feedback
```

**Summary** (132 char max)
```
Inspect any page, pin comments to elements, and hand them to Claude — no SDK install required.
```

**Category:** `Developer Tools`
**Language:** `English (United States)`

**Description** (paste into the Description box)
```
Loupe turns "can you fix this?" into a precise, actionable task — right from the page.

Click any element on any website, pin a comment to it, and capture a screenshot. Loupe records exactly what you clicked (the element, its HTML, and its styles), so there's never a "which button did you mean?" reply. Feedback is organized on a triage board and can be handed straight to Claude Code via MCP, so an AI agent can make the change with full context.

Built for product managers, designers, QA, and the developers who ship their feedback.

WHAT YOU CAN DO
• Inspect & pin — click an element and attach a comment anchored to it, not to a vague screenshot.
• Free notes — drop a page-level comment anywhere with the Note mode, no element or screenshot required.
• Capture — pixel-perfect screenshots of the page, cropped to what matters (sensitive fields can be redacted).
• Survive redeploys — pins re-anchor to their element even after the markup changes, using a multi-signal fingerprint.
• Triage — every comment lands on a Kanban board: open, in progress, done.
• Hand it to Claude — comments become a backlog Claude Code reads over MCP (element HTML, computed styles, screenshot) and resolves, closing the loop back to you.

WHY LOUPE
• Works on any site — no code change or SDK install required on the target page.
• Context that carries to code — the exact element and its styles travel with every comment.
• Open source (MIT) and privacy-respecting — screenshots are captured locally and can redact sensitive fields.

HOW IT WORKS
1. Click the Loupe icon, set your project key and (optionally) your API endpoint.
2. Click "Start Loupe on this tab."
3. Inspect an element (or drop a free note anywhere), write your comment, capture a screenshot.
4. Review on the board, or let Claude Code work through the backlog via MCP.

Loupe is open source. Docs, the SDK, and the self-hostable backend live at github.com/mohamed-ashraf-elsaed/loupe.
```

## Additional fields

- **Homepage URL:** `https://mohamed-ashraf-elsaed.github.io/loupe/`
- **Support URL:** `https://github.com/mohamed-ashraf-elsaed/loupe/issues`
- **Official URL (optional):** `https://mohamed-ashraf-elsaed.github.io/loupe/` — requires verifying the site in Google Search Console first.
- **Mature content:** No.
- **Visibility / Item support:** your choice (Public or Unlisted). Turn "Item support" on to show the Support URL.

## Graphic assets (files in this folder)

| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshot 1 | `screenshot-1-inspect.jpg` | 1280×800 |
| Screenshot 2 | `screenshot-2-board.jpg` | 1280×800 |
| Screenshot 3 | `screenshot-3-claude.jpg` | 1280×800 |
| Small promo tile | `promo-small-440x280.jpg` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.jpg` | 1400×560 |

Promo video: optional — leave blank, or add a YouTube URL later.

## Upload the extension package

The reviewable package is `loupe-extension.zip` at the repo root (`npm run build:extension` then re-zip if you change it). It now includes the `icons/` (16/48/128).
