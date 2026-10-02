# Changelog

All notable changes to Loupe are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are
published via [GitHub Releases](https://github.com/mohamed-ashraf-elsaed/loupe/releases);
see [RELEASING.md](RELEASING.md) for the process.

## [Unreleased]

_Nothing yet._

## [0.10.19] — 2026-10-02

### Added

- **The workspace source mapper** (`packages/mcp/src/mapper.ts`) — the single highest-value parity gap.
  Loupe used to hand an agent raw HTML, so it had to re-find the file that rendered it every single
  time. `mapElementToSource()` walks the workspace and returns ranked `file:line` candidates instead.
  (Milestone 0.11; #13.)
  - **Signal weights in one table**, so the model is tunable and readable: id 0.85, aria-label 0.8,
    text 0.7, class 0.5. Boosts for a PascalCase component basename, a view file, a path under `src/`,
    several signals agreeing on one file, and repeated matches.
  - **Utility classes are filtered before searching.** `flex`, `mt-4`, `bg-blue-500`, `hover:x` and
    `md:y` appear in a stylesheet, never in the JSX that renders the button — searching for them
    produces noise, not answers.
  - **Build output is skipped**, by directory (`node_modules`, `dist`, `build`, `.next`, `vendor`,
    caches…) *and* by shape: a file with a line over 1500 characters is generated, wherever it lives.
    That second rule matters — the extension's own `content.js` sits in a package root and ranked first
    for every signal until it existed.
  - Breadth-first walk with a file cap (default 4000), a per-file size cap, a total scan budget, a
    short-lived file-list cache, and bounded read concurrency.
  - An empty result is an answer, not an error: no match, a missing root and a blank workspace all
    resolve to `[]`.
- **Four element-context MCP tools** (milestone 0.11; #14): `get_latest_selection`,
  `get_selection_history`, `get_element_context` and `find_source_for_selection`.
  - Each takes **either a live selection** (bridged from the browser) **or a `thread_id`**, and
    `threadContextToPayload()` normalises a stored comment into the identical shape — so an agent never
    has to care which it got.
  - `get_element_context` returns the element, the page, its key computed styles, the ranked source
    candidates and a **ready-made edit prompt**.
  - **`generateEditPrompt()`** pins the work: smallest diff that satisfies the request, follow the
    file's own conventions, keep the element's behaviour and accessibility, don't touch unrelated files.
    It also tells the agent to **say why it chose a file**, so a wrong guess is visible rather than
    silently plausible, and — for a thread — spells out propose → In Review, with the reminder that
    **only a person resolves**.
  - With nothing selected yet they explain what to do rather than erroring.

### Changed

- The MCP tool registration test is now a snapshot of all eight tools plus an assertion that every
  tool carries a description long enough to choose on, so a tool cannot be added without one.

## [0.10.18] — 2026-10-02

### Fixed

- **A package upgrade can no longer break a host app's writes.** `POST /comments` returned **500**
  on an app whose database had not run the migration that adds a column the controller writes —
  reproduced against the package itself: with `pr` absent, every create raised a
  `QueryException` and **zero rows were written**. The write path now keeps only the attributes the
  table actually has, so a pending migration degrades (the newest fields stay empty) instead of
  taking feedback down, and logs one clear warning naming the migration to run.

  If your app was upgraded to 0.10.15+ without migrating, run `php artisan migrate` — that is the
  real fix, and this release means the window before you do is no longer an outage.

  The column list is deliberately **not** cached: under Octane or a queue worker the process
  outlives a migration, so a worker started before `php artisan migrate` would keep writing the old
  shape until restarted. Caught by a test that checks the write path still carries `pr` after a
  migration in the same process.

## [0.10.17] — 2026-10-02

### Added

- **A local bridge in the MCP server** (`packages/mcp/src/bridge/`). A browser tab and an agent process
  have no way to see each other; this is the seam that fixes it. `startHttpBridge()` binds **127.0.0.1
  only** — this is a hand-off between two programs on one machine, and putting it on a LAN interface
  would turn "the page you are looking at" into something anyone on the network could read or forge.
  (Milestone 0.11; #11.)
  - **A selection store** — a bounded ring (default 50) of element payloads with `latest()`,
    `history()` and `correlationId` lookup. Bounded deliberately: an agent that has not looked in fifty
    selections is not going to want the first one.
  - **Strict ingest validation.** A half-formed selection is worse than a rejected one — the agent
    would act on a payload silently missing the selector it needs — so required fields are required,
    optional fields are still type-checked, and unknown keys are dropped rather than passed through as
    "element context".
  - **Routes**: `POST /selection`, `GET /selection/latest`, `GET /selection/history`, `GET /selection`,
    `DELETE /selection`, `GET /health`, the agent routes below, and the SSE streams.
  - **CORS limited to `chrome-extension://` and loopback origins** — a random site cannot read what you
    have selected.
  - **A busy port is not fatal.** `EADDRINUSE` is retried five times, 1.5s apart, then logged and the
    server continues with `bridge=disabled`; the MCP tools work without it, they just cannot see the
    browser.
  - Request bodies are capped, and `SIGINT`/`SIGTERM` close the listener cleanly.
- **An agent registry with heartbeat and an SSE channel.** Agents register with `(name, type,
  workspace)`, heartbeat, and are evicted after 30s of silence (swept every 10s). Ids are **derived
  from the identity** rather than random, so an agent that restarts lands on the same row instead of
  leaving a ghost in the picker until its TTL expires. (Milestone 0.11; #12.)
  - **SSE** on `/events`, with `/thread-updates` as the thread-only view. A 15s keep-alive comment keeps
    proxies and browsers from dropping an idle stream; disconnects remove the subscriber.
  - **`emitThreadUpdate` is wired into the tools** — `update_status` publishes `status_changed` /
    `thread_resolved` and `propose_change` publishes `preview_live`, so an open panel can update in
    place. Publishing is best-effort and never throws into a tool call: a dead browser tab is not a
    reason for `update_status` to fail.
  - The MCP process **registers itself on startup** and unregisters on exit, so the picker is accurate
    without any extra configuration.

### Fixed

- **The MCP server could not start from source at all.** `SelectionStore` and `AgentRegistry` used
  constructor parameter properties (`constructor(private readonly capacity = 50)`), which Node's
  strip-only TypeScript mode rejects — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Caught by the existing
  MCP test suite, which spawns the server as a child process; without it this would have shipped as a
  server that dies on launch for anyone running from a checkout.

## [0.10.16] — 2026-10-02

### Added

- **Generate a change from a thread, and iterate on it.** With `init({ generate })`, a thread's detail
  gains a Generate pane: a **sandboxed preview plane** for the result, an **opacity slider** to compare
  it against the original capture, **undo**, **prev/next** through every iteration, and an iterate
  input with a refine / revise selector. The panel owns the preview, the comparison and the history;
  producing the markup is the host's job, so any model works. (Milestone 0.20; #62.)
- **`iteration.ts` in `@loupekit/shared`** — the pure history model behind that pane: preview-per-push,
  step without discarding, undo *does* discard, branching from a point in the middle drops the
  abandoned tail rather than silently mixing two lineages, and the stack is capped at 20.
- **Local-AI configuration** — endpoint URL and model name in the project manager, with a **real
  connection check** against an OpenAI-compatible `/v1/models` (what Ollama, llama.cpp and the rest
  expose). It reports reachable-but-erroring, times out rather than hanging, tells you when the named
  model is not among those served, and explains the CORS failure you will actually hit. (Milestone
  0.20; #62.)
- **An access gate.** Without a generator, the pane offers *Request access to generate* and hands the
  request to `init({ onRequestAccess })` — the seam the Team tab will land on when 0.17/0.18 exist.
  With no handler at all it says so rather than doing nothing. (Milestone 0.20; #62.)
- **Consent-gated agent navigation.** `requestNavigation(url, { reason, requester })` asks the user;
  the panel shows who wants to go where and why, and **only an explicit grant navigates** —
  `decide()` returns a URL on nothing else, and the panel navigates from that return value rather
  than from the request. Every decision is kept as an audit trail. `javascript:`, `data:` and `file:`
  requests are refused outright, and a second request replaces the first rather than stacking prompts.
  (Milestone 0.20; #64.)
- **Dictation in the composer** — a mic button backed by `SpeechRecognition`, with a visible
  recording state. Where the browser has no such API the button is disabled and says so, instead of
  offering something that cannot work. (Milestone 0.20; #64.)
- **Context menus in the extension** — comment on the page, a selection, an image, a video, an audio
  element, a link or an editable field, plus **show / hide Loupe on this site**, persisted per origin.
  A menu that lands on an already-open widget aims it at the right tool via a new `openTool()`;
  otherwise it injects the content script with the intent, which is why `init()` gained `tool`.
  (Milestone 0.20; #64.)

### Fixed

- **The preview plane collapsed to two pixels on any thread without a screenshot.** The generated
  markup lives in an absolutely-positioned iframe, which contributes no height — so with no captured
  image under it the plane had nothing in flow. It has a minimum height now.
- **A generated change rendered as a dark box.** Generated markup is usually a *fragment*, so on a
  transparent body it read as an empty panel. The plane gives it a white surface, like any other
  design preview.
- The iterate input's placeholder no longer truncates.

### Not in this release

- **Notifications** from #64 ("Claude finished your fix"). Those need something to notify *about* —
  the bridge daemon (#11) — and a service worker with no events to report would be decoration.

## [0.10.15] — 2026-10-02

### Added

- **A thread's change now has a lifecycle.** `Comment.pr` records the pull request carrying a fix
  (`number`, `url`, `state`, `checksPassed`, `checksTotal`), and `lifecycle()` in `@loupekit/shared`
  turns that plus the thread's stage into one chip: **Sent to agent → In PR → Review preview →
  Reviewed**. Precedence is deliberate — a PR outranks the board column, because "In PR" is more
  specific than the column it happens to sit in. A thread with nothing attached wears no badge at
  all. (Milestone 0.20; #71.)
- **PR chips and a checks meter on every card.** The number is a monospace chip that links out to the
  PR; the checks render as a numerator over a thin bar, and the bar reflects the fraction, not just
  the count. (Milestone 0.20; #71.)
- **A review banner.** Threads in In Review lead their detail with a banner — *Waiting on your
  review* — carrying **Approve** and **Add comment**. Approving resolves the thread and is recorded in
  the Activity feed, like every other operation. That asymmetry is the rule the flow rests on: an
  agent moves work to In Review, only a human closes it. (Milestone 0.20; #61, #71.)
- **An origin compare.** When Claude has proposed a change, *Show original* puts the original request
  (its text and the element's captured HTML) beside the proposal (its notes, HTML and CSS), in two
  columns that collapse to one in a narrow panel. (Milestone 0.20; #61, #71.)
- **A review strip** above the list — *2 waiting on your review* with a **Review** button that
  narrows the list to them and back again. (Milestone 0.20; #61, #71.)
- **`pr` is stored end to end** — a new `pr` column on the server (additive, `ALTER TABLE … IF NOT
  EXISTS`) and in the Laravel package (additive migration), accepted on create and on PATCH,
  returned in the canonical comment shape. A non-object `pr` is dropped rather than stored, so the
  panel never renders a chip from something that is not a pull request.

### Fixed

- **The card's header row could overflow.** It now carries the number, a badge, a lifecycle chip, a
  PR chip, a checks meter and the caret — more than fits on one line in a 360px panel, so the last
  chip and the caret were spilling past the card edge. The row wraps now, and the "element
  moved/removed" badge became **moved** with the full wording on hover — at 158px it was eating a
  third of the row on its own.
- **A resolved thread no longer wears two green pills.** The "resolved" badge already says it, so the
  lifecycle chip is suppressed for that stage; its PR chip and meter stay, since those are the part
  you cannot read off the badge.

## [0.10.14] — 2026-10-02

### Added

- **A reusable tab API — the panel is now extensible without forking it.** `init({ tabs: [...] })`
  registers your own sidebar pages. Each tab gets a `LoupeTabContext` (project key, apiBase, user,
  the page's comments, the page URL, the running version, plus `track` / `open` / `close`) and returns
  markup or an element, so a tab never reaches into the panel and the panel never reaches into a tab.
  A tab that throws is caught and shown as an error card instead of taking the panel down. (#59.)
- **The Connect Claude page is now an opt-in tab.** The panel no longer ships it: register it with
  `init({ tabs: [connectTab()] })`, which also brings back the FAB's Connect shortcut. It doubles as
  the worked example of the tab API. (Requested change.)
- **An in-panel Activity Monitor** — a status dot (idle / working / error), a collapsible session
  summary (status, events, duration, files touched, errors, per-tool counts), a micro-stat row, tool
  chips that filter the feed, and a live event feed. The feed pauses as you scroll back through it and
  resumes when you return to the end. With nothing connected it says *Monitor unavailable* and explains
  how to feed it, rather than erroring. (Milestone 0.20; #59.)
- **A public activity seam** — `trackActivity(event)`, `setActivityStatus(status)` and
  `clearActivity()`, exported from the package. An agent bridge or the host app pushes through them;
  Loupe's own operations (create, resolve, reopen, delete, link a repo) feed the same stream, so the
  view is useful before a bridge exists. `summarizeActivity` / `formatDuration` are shared, so any
  other consumer derives the same numbers. (#59.)
- **The running package version is visible in the UI** — in the Home footer (`Acme · v0.10.14`) and in
  the settings dropdown, which also shows whether the panel is in `server` or `offline` mode.
  (Requested change.)
- **A project manager** in the Home view — link the current page to a repository, searching a list the
  host supplies (`repos`: a string array, or a function the panel calls with the search text, so a host
  can back it with its own API). Overlapping searches are sequence-guarded, the list is re-rendered
  without rebuilding the input so typing keeps focus, and the choice persists per browser and is filed
  on new comments. (Milestone 0.20; #60.)
- **Environment URLs** — add, validate and remove the environments for a project. Only absolute
  `http(s)` URLs are accepted (a bare `staging.example.com` is a typo, not an environment), they are
  normalized so two spellings of one place cannot both be listed, and duplicates are refused with an
  inline message. (Milestone 0.20; #60.)
- **Scope chips carry counts** — *This page 3* / *All 14*, with the project total showing `⋯` until it
  has been read rather than a number we would be inventing. (Milestone 0.20; #60.)

### Changed

- The sidebar is `Home · Comments · Activity` by default, plus whatever the host registers. The
  guided tour is five steps now (it covers the Activity view and the settings menu).

### Fixed

- **A host tab could be swallowed by a startup ordering bug.** `render()` runs while the panel is
  still being built, so a tab that reported an event hit the Activity view before its own markup
  existed — and the exception silently replaced the whole tab with an error card. The monitor now
  keeps events reported before it was built and paints them when it is. Found by the tab test.
- **The project popover rendered off the bottom of the panel.** It was a sibling of the row it
  anchors to, so its `top: 100%` resolved against the panel instead of the row — it landed at y=866
  in an 860px-tall window. It is now a child of that row. Found by measuring the rect instead of
  eyeballing the screenshot.

## [0.10.13] — 2026-10-02

### Added

- **A minimize bar.** The header's new minimize button collapses the panel to a one-line strip that
  keeps its context on screen (`3 open on this page`) and restores on click. (Milestone 0.20; #56.)
- **A dock-position menu.** The four layout buttons became one button opening a 2×2 grid — left,
  bottom, right, float — which leaves the header room for the settings and minimize controls. The
  active layout is marked. (Milestone 0.20; #56.)
- **Accent colours.** Five presets (indigo, violet, teal, amber, rose) in Settings, applied as an
  inline `--accent` custom property so they beat the theme token blocks and follow dark/light.
  (Milestone 0.20; #56.)
- **A settings dropdown** — accents, the visibility switches, and *Restart tour*. (Milestone 0.20; #63.)
- **Visibility switches** for **hover hints**, **markers** and **page paths** — the last labels each row
  in the project scope with the page it came from. (Milestone 0.20; #63.)
- **A guided spotlight tour** — four steps over the stat tiles, the scope switch, the capture tools and
  Connect Claude. It runs once on first open, is skippable, and is replayable from Settings. The
  spotlight is a `box-shadow` cut-out and the overlay is click-through, so a tour can never trap
  someone mid-task. (Milestone 0.20; #63, #72.)
- **Contextual hint cards**, one per view, shown once each and dismissible — with a *Turn off hints*
  link that silences the whole help layer, persisted. (Milestone 0.20; #72.)

### Fixed

- **A malformed stored anchor no longer takes the panel down.** `resolveAnchor` reads `attrs`, `rect`
  and `viewport` off the anchor, but a row written by an older client (or by hand) can be missing
  them — `Object.keys(undefined)` threw, which aborted `start()` entirely: no pins, no list, no tour.
  The scorer now defaults those fields, and the pin positioner isolates a failing anchor to that one
  comment. Found by seeding the demo with a minimal anchor.

## [0.10.12] — 2026-10-02

### Added

- **The panel opens on a Home overview.** The widget's sidebar is now three pages — **Home · Comments ·
  Connect Claude** — and it leads with Home: four stat tiles (**Open**, **Needs you** (`in_review`),
  **Resolved**, **Stale** = open for over a week), each a button that narrows the list; a **scope
  switch** between this page and the whole project; a one-click **Pin feedback**; and the most recent
  feedback with author, age and stage. (Milestones 0.20; #57.)
- **The project scope is a timeline.** Switching to **All** lists the whole project's feedback, newest
  first and **grouped by day** (`Today`, `Yesterday`, …), with a repo filter that appears once there is
  more than one repo in play. (Milestones 0.20; #58.)
- **`StorageAdapter.listAll()`** — every comment in a project, across pages. Implemented for both the
  HTTP adapter (`GET /v1/comments` with no page filter) and offline `localStorage`.

### Fixed

- **Offline mode could not update or delete a comment once the panel had saved its state.**
  `LocalStorageAdapter.update()/remove()` treated every `loupe:` key as a comment list, but
  `loupe:dock` holds the panel state as an object — so `JSON.parse` returned an object and
  `.findIndex` threw. The scan now skips the dock key and tolerates any non-array value. (Found by
  the new Home tab, which is the first thing to persist state before a comment is resolved.)

## [0.10.11] — 2026-10-02

### Added

- **The card leads with the captured pixels.** A card now opens with its screenshot (or a recording's
  poster frame) above the text, so a board reads visually instead of as a wall of titles. The
  screenshot is no longer repeated on expand — expanding now reveals the recording player and any
  attachments. (Milestone 0.14; #26.)
- **Copy for agent.** Every card has a one-click brief: stage, priority, change type, repo/branch,
  page, target selector, the element HTML and its computed styles — the same context the MCP
  `get_comment` tool returns, as pasteable Markdown. (The "Copy-for-Claude" affordance the docs
  described but the board never actually shipped.)
- **Compact density.** A header toggle trades the media strip and the card padding for scanability on
  a long board. The choice persists in `localStorage`.
- **A loading state.** The board says _Loading feedback…_ on first paint instead of showing an empty
  board while the first fetch is in flight.

### Changed

- **A card is a keyboard-reachable disclosure.** It is focusable, carries `role="button"` and
  `aria-expanded`, and expands on `Enter` / `Space`; clicking a card no longer collapses when you
  interact with its selects. Each card also shows its repo/branch as a chip when it has one.

## [0.10.10] — 2026-10-02

### Added

- **Branch-aware threads.** A comment now records the **`repo`** and **`branch`** it was filed against.
  The widget takes both from `init({ repo, branch })`, the API and dashboard store and filter them, and
  both MCP servers report them per item and accept them as filters — so an agent can be pointed at one
  repository or branch. (Milestone 0.14; #25.)
- **Filtering moves into SQL.** `GET /v1/comments` (and the matching Laravel route) now accept `repo`,
  `branch`, `status`, `priority`, `changeType`, `kind` and `q` — so a board with thousands of rows never
  ships them all to the client. A stage filter still matches the legacy `open` / `done` rows.
- **Saved views.** The board gains a Repo and a Branch filter plus a view switcher: **All feedback**,
  **Needs you (In Review)**, **Critical only** and **Not linked to a repo**. The choice is remembered in
  `localStorage` and reflected in the URL (`?view=…`), so a filtered board can be shared as a link.

## [0.10.9] — 2026-10-02

### Added

- **Priorities and change types on every comment.** A comment now carries a **priority**
  (critical → low, default medium) and a **change type** (frontend / backend / api / other, default
  other). The reporter picks both in the widget's composer; the board renders them as chips and lets
  you re-triage straight from the card. `COMMENT_PRIORITIES`, `PRIORITY_RANK`, `CHANGE_TYPES` and the
  `normalize*` helpers in `@loupekit/shared` are the single source of truth, mirrored in the Laravel
  package by `Loupekit\Loupe\Support\Triage`. (Milestone 0.14; #24.)
- **Filter and sort by both.** The board gains Priority and Type filters and a **Priority** sort
  (most urgent first, newest within a priority). Both MCP servers report priority and change type for
  every comment — `list_comments` prints them and accepts them as filters — so an agent can start
  with what actually matters.

### Changed

- **Existing rows need no backfill.** A comment written before this release has no triage columns;
  every read path defaults it to **Medium · Other** rather than leaving it blank, and an unrecognised
  value is coerced the same way instead of being stored raw.

## [0.10.8] — 2026-10-02

### Added

- **The board is five stages, not three.** A comment now moves through **Queue → To Do → In
  Progress → In Review → Resolved** rather than open / in_progress / done. The extra columns are
  what let a team tell "not triaged yet" apart from "waiting on me" and "waiting on a preview" —
  and they give the agent handoff somewhere to land: an agent may move a comment to **In Review**,
  but only a person resolves it. `COMMENT_STAGES`, `STAGE_LABELS` and `normalizeStatus()` in
  `@loupekit/shared` are the single source of truth, mirrored in the Laravel package by
  `Loupekit\Loupe\Support\Stages`. (Milestone 0.14; #23.)

### Changed

- **`Comment.status` is now one of the five stages.** Rows written before the board are migrated
  (`open` → `queue`, `done` → `resolved`; `in_progress` is unchanged) by the server's `migrate()`
  and by a new Laravel migration, and every read path normalizes as it reads — so a pre-board row
  still lands on a column even if the migration has not run yet.
- **The old names are still accepted everywhere.** The HTTP API, the SDK and both MCP servers
  (`list_comments` filtering, `update_status`) normalize `open` / `done` onto the board, so an
  older widget or an agent configured before the board keeps working. Anything unrecognised lands
  in **Queue** rather than falling off the board.
- **The dashboard board is five columns** with a swatch per stage, and the widget's comment list
  reads `resolved` where it used to say `done`.
- **`update_status` guidance changed for agents:** move a comment to **In Review** when a change is
  ready for a human, and never set **Resolved** yourself.

## [0.10.7] — 2026-10-02

### Changed

- **Laravel: the package supports PHP 8.2+ (was 8.4+).** The constraint was `^8.4`, with only
  8.4 in CI — which locked out most real apps for no reason. Laravel 11/12 need PHP ^8.2 (13
  needs ^8.3) and there is no 8.4-only syntax in the package, so the floor is now `^8.2`, and
  the CI matrix tests that claim: 8.2 · Laravel 11/12, 8.3 · 11/12/13, 8.4 · 11/12/13.

### Added

- **`loupe:install` now says when the app has nobody to sign in.** Laravel 11+ ships no auth
  scaffolding and Loupe only shows the widget to an authenticated user, so a fresh install
  looked broken with no explanation. The installer warns, and the README states the
  prerequisite up front.
- **A stranger test in CI** (`packages/laravel/bin/stranger-test.sh`): it creates a brand-new
  Laravel app, installs this working tree, wires it up the way the docs say, and asserts the
  widget renders for a signed-in user but not for a guest, `/loupe/dashboard` never 5xxs, the
  versioned SDK bundle downloads, and a comment posts and comes back in the list. It runs at
  both ends of the support matrix — and it is the check that would have caught the
  `Route [login] not defined` 500 that 0.10.5 fixed.

## [0.10.6] — 2026-10-02

### Added

- **The collapsed widget is now a quick-action cluster.** `@loupekit/sdk` replaces its single
  launcher button with a FAB cluster: a primary brand button carrying the live comment-count
  badge, plus four quick actions — **Pin comment**, **Note**, **Markers** and **Connect
  Claude** — each with a hover label, a chevron that flips on expand, and a staggered reveal
  that is switched off under `prefers-reduced-motion`. The cluster sits on the dock's edge and
  gets out of the way when the panel opens. (Milestone 0.20; #70.)

### Changed

- **Markers can be hidden without discarding them.** A new quick action hides every pin on the
  page and remembers the choice in `loupe:dock` next to the rest of the panel state, so a
  reporter can read the page without the pins in the way.
- **The primary FAB now expands the quick actions rather than opening the panel directly.**
  Opening the panel from the cluster is one of the quick actions (`Pin comment` or `Note`), or
  `Connect Claude` to land straight on the MCP setup page. The panel itself is unchanged.

## [0.10.5] — 2026-10-02

### Fixed

- **A fresh Laravel app no longer 500s on `/loupe/dashboard`.** Found by installing the
  package as a stranger would in a brand-new app: Laravel 11+ ships no auth scaffolding, so
  there is no `login` route — and the auth middleware's `AuthenticationException` is turned
  into a redirect to it, which threw `Route [login] not defined`. A browser guest now gets a
  **403 that says what to do**; apps with a login route are unchanged; JSON still gets 401.
  (The suite never caught it because the testbench app registers a `[login]` route.)

## [0.10.4] — 2026-10-02

### Fixed

- **An iPhone screen recording reaches the ticket as a playable video.** The blob MIME maps
  knew png/jpeg/webp/gif/webm/mp4 but not `video/quicktime` — what iOS hands a file picker
  for a screen recording. Unmapped values fall back to `png`, so the clip was stored as
  `.png` and served as `image/png`: the video the reporter had just recorded arrived as a
  broken image. `video/quicktime`, `image/heic` and `image/heif` are now mapped (Laravel
  package and Node server).

## [0.10.3] — 2026-10-02

### Fixed

- **The Camera tool is gone.** It opened the phone's camera, so the clip filmed the room
  instead of the screen — wrong by design. It was added on the belief that `getDisplayMedia`
  was an iOS gap; it is not. **No mobile browser supports it** (iOS Safari never has;
  Chrome/Firefox on Android exposed the method in old versions but every call fails), so
  in-page screen recording is desktop-only.
- Record is therefore offered where the API genuinely exists (desktop, including Safari on
  macOS) and nowhere else. On a phone — which cannot record the screen from a page at all —
  the **Video** tool opens the picker for a clip the phone's own screen recorder produced,
  with **no `capture` attribute**, because that is what was forcing the camera open.

## [0.10.2] — 2026-10-02

### Fixed

- **A phone in "Request Desktop Site" mode is recognised as touch again.** Detection keyed
  off `(pointer: coarse)` alone, and a desktop-mode phone reports a **fine** pointer — so
  those users got the mouse path: a composer that grabbed the focus (keyboard over the
  page) and a drag-select that fought the page scroll. It now also accepts `(hover: none)`
  and a touch-capable screen (`maxTouchPoints` / `ontouchstart`).
- **Video is possible on iOS again — via the camera.** Every iOS browser is WebKit, which
  has no `getDisplayMedia`, so screen recording cannot work there and the tool was hidden.
  Touch devices without it now get a **Camera** tool: one tap opens the phone's video
  recorder and the clip is attached to the composer, like the screen-capture flows.

### Added

- Every comment records `viewport.{v, touch, coarse, gdm}` — the SDK build that produced it
  and what the browser could do. A "still broken" report can then be checked against the
  build that actually ran instead of guessed at.

## [0.10.1] — 2026-10-02

### Fixed

- **Record works on a phone again.** 0.10.0 hid the tool on every coarse pointer: right
  for iOS Safari, which has no `getDisplayMedia` at all, but wrong for **Android Chrome**,
  which can capture the screen — so touch users lost video entirely. Record is now offered
  wherever `getDisplayMedia` exists; on touch there is no box to drag, so tapping it
  records the **whole screen** (the call stays synchronous with the tap, as the API
  requires), the tap-to-**Stop** pill ends it, and the composer opens with the video
  attached. Desktop keeps its drag-select.

## [0.10.0] — 2026-10-02

### Added

- **A touch-first capture flow.** On a phone the Region tool now captures the **visible
  viewport** in one tap and opens the composer with the screenshot already attached —
  scroll to what you mean first, then tap Region. Drag-select was unusable on touch: a
  finger hides the area it draws and the drag fought the page scroll.
- The composer is a **bottom sheet** on small screens (full width, thumb-reachable,
  scrollable when the keyboard is up).

### Fixed

- **The composer no longer steals focus on touch**, which threw the on-screen keyboard up
  over the page being described. It still focuses for a mouse/pen.
- **The Region/Record drag no longer locks page scrolling** (the `touch-action: none` page
  lock is gone).
- **Record is not offered on touch at all** — there is no `getDisplayMedia` on iOS Safari,
  and no pointer with which to drag a selection box.

## [0.9.3] — 2026-10-02

### Fixed

- **Laravel: `config('loupe.user_resolver')` may be a class-string.** A Closure cannot be
  serialized, so `php artisan config:cache` failed ("the value at loupe.user_resolver is
  non-serializable") — and since config:cache boots the providers before serializing, a
  Closure injected at runtime broke it too, leaving the app with no config cache. A
  class-string (or `[class, method]`) is now accepted and survives the cache.

## [0.9.2] — 2026-10-02

### Fixed

- **The widget is usable by touch, not just with a mouse.** Inspect, Region and Record
  listened for `mousemove`/`mousedown`/`mouseup`, which a touch drag never fires — so on a
  phone a region could not be drawn and Inspect gave no highlight to aim with. The
  selection layer now uses **Pointer Events** (one path for mouse, touch and pen, with
  `pointercancel` handled); `touch-action: none` is applied to the page only while a
  drag-select tool is active so it cannot scroll mid-drag; and Inspect highlights on
  **finger-down**, since touch has no hover.
- **Record is hidden where `getDisplayMedia` is unavailable** (e.g. iOS Safari) instead of
  offering a tool that can never work.

## [0.9.1] — 2026-10-01

### Fixed

- **Laravel: a custom `config('loupe.user_resolver')` is honoured by the identity check.**
  `CommentController::store()` compared the client's `author.id` against the raw session
  user, so an app that describes a different identity — the documented way to attribute
  comments made while an admin impersonates a user to the **admin** rather than the
  impersonated account — was rejected with *"cannot post as another user"*. The check and
  `author_id` now use the identity the widget was handed (`describeUser()`), which is
  unchanged when no resolver is configured.

## [0.9.0] — 2026-10-01

### Added

- **A real issue form in the widget.** The composer now takes a **Title** and a
  **Description** (the old single field), plus **Attachments** — several images and/or
  videos, picked or dropped in, each shown as a removable chip (images ≤10 MB, videos
  ≤25 MB, up to 10 files). Free notes ("Note") get the same form.
- **`Comment.title` and `Comment.attachments[]`** in `@loupekit/shared`, with an
  `Attachment { url, name?, mime?, kind: image|video, size? }`. Additive — the
  auto-captured `screenshot` / `recording` are unchanged.
- **Search, filters and a sort** on the dashboard board (title/body/author search,
  kind + device filters, newest/oldest), and a **search box** in the widget list.
- **Collapsible comment cards** in both the widget list and the board: a title
  summary that expands to the full card, with an attachment gallery.
- **MCP**: `get_comment` reports the title and every attachment and embeds each
  image attachment as an image content block (plus the auto screenshot);
  `list_comments` reports the title and attachment count.
- **Laravel**: a migration adding `title` and `attachments` to `loupe_comments`,
  model/controller support, and the re-vendored SDK + dashboard bundles.

### Removed

- **"Copy for Claude"** in the widget and the dashboard. The MCP `get_comment` tool
  is the supported way to hand a comment to Claude, and it carries more than the
  clipboard prompt ever did.

### Changed

- **Tickets filed from a Hub issue no longer dump element HTML into the description**
  (the CRM receiver): the description reads like a request, while the raw element
  markup, computed styles and anchor are stored in the ticket's `loupe_context`
  column — still available to the tech team and to Claude over MCP. Every attached
  image **and video** is attached to the ticket, and the ticket drawer renders
  videos with a real player.

## [0.8.1] — 2026-10-01

### Fixed

- **The Laravel widget and dashboard asset URLs are now versioned** (`…/loupe.js?v=…`, from the
  published bundle's mtime+size). A new build is a new URL, so no CDN edge or browser cache can
  keep serving the previous bundle after an upgrade. In the field an app behind Cloudflare kept
  handing users the old SDK — missing the Record tool — until the edge TTL expired, and a
  package user has no way to purge someone else's cache. Versioning fixes it for every host.

## [0.8.0] — 2026-09-24

### Added

- **Loupe Hub** (`packages/hub`, private): a minimal hosted service with Google sign-in where
  org owners create organizations, add allowed members (Google emails and/or one email
  domain) and create projects with a generated Project ID (`prj_…`), Project Secret (`psk_…`),
  webhook URL and webhook signing secret (`whs_…`). Secrets are shown once and can be rotated.
  `POST /v1/issues` verifies the project HMAC (±5 min timestamp), checks the submitter's email
  belongs to the organization (`403` otherwise), and forwards the issue to the project webhook,
  signed, with a 10 s timeout and 3 attempts. The dashboard lists the last 20 deliveries.
  Ships with `deploy/` scripts for a GCP e2-micro VM (Node 24, Postgres 16, Caddy HTTPS,
  systemd).
- **Laravel → Hub forwarding.** New `loupe.hub.url` / `loupe.hub.project_id` /
  `loupe.hub.project_secret` config (`LOUPE_HUB_URL`, `LOUPE_PROJECT_ID`,
  `LOUPE_PROJECT_SECRET`). When all three are set, each new comment dispatches a queued
  `SendToHub` job (after the response on the sync queue) signed with the Project Secret and
  carrying the logged-in user's email. Hub failures are logged and never break comment creation.

## [0.7.0] — 2026-07-20

### Added

- **Claude modification loop (round-trip).** The MCP `get_comment` tool now returns the
  **actual screenshot as an image** (not just a URL) alongside the element HTML and computed
  styles, and a new **`propose_change(id, html, css?, notes?)`** tool lets Claude write its
  **modified HTML/CSS back onto the comment**. The dashboard renders that proposal for the dev
  team as copyable code plus a **live before/after preview** (the "after" rendered in a
  sandboxed iframe). Mirrored in the Laravel MCP server (`propose_change` tool + image block).
- **Screen recording.** A new **Record** tool captures a screen video of a drag-selected
  region (same selection UX as Region) via `getDisplayMedia` + per-frame canvas crop, saved as
  `.webm` (duration-capped, with a Stop button). Recordings play back inline in the widget and
  the dashboard. Overridable via the new `captureRecording` config seam.
- **Two-page sidebar on both surfaces.** The SDK widget dock and the dashboard now each have a
  **Comments** page and a **Connect Claude** page (numbered steps + copyable MCP config), plus
  an **"Integrates with"** row (GitHub / Slack / Telegram / Linear — visual for now). The
  widget's comment list no longer shows the author's name/email.

### Changed

- **Data model (additive).** `Comment` gains optional `recording` (webm URL) and `proposal`
  (`{ html, css?, notes?, author?, createdAt }`) fields; new nullable DB columns
  (`recording_url`, `proposal`) on both the Node and Laravel schemas. Blob storage now carries
  a file extension / content type so it serves `video/webm` as well as `image/png` (legacy
  extensionless ids still resolve to PNG). The comment `PATCH` accepts `proposal`. All changes
  are back-compat — upgrading is drop-in.

## [0.6.0] — 2026-07-17

### Added

- **Dockable, DevTools-style control.** The widget is now a single dockable panel —
  header (`◎ Loupe` + dock controls) → tools (Inspect / Note / Region) → comment list —
  that you dock to the **left**, **right**, or **bottom** edge, or **float** as a movable,
  resizable window. Docked edges **push the host page over** (reflow the `<html>` margin) so
  the panel never hides content; float overlays. The chosen position, open/closed state, and
  float geometry all persist in `localStorage`.
- **Light / dark theme toggle** in the panel header (dark by default); persists.
- **Mobile bottom sheet.** On viewports ≤ 640px the panel becomes a full-width bottom sheet
  (docking is a desktop affordance), and shrinks to a compact header-plus-tools bar while a
  tool is active so most of the page stays visible and tappable.
- **`label` config** — sets the brand name shown in the control header (defaults to `"Loupe"`).

### Changed

- The floating pill toolbar and the separate comment panel are unified into the single
  dockable panel; when closed it collapses to a small `◎` launcher button. Comments render
  inline in the panel. **UI-only** — no DB migration and no change to the SDK `init` config
  (additive `label` only), HTTP API, or MCP tools, so upgrading is drop-in.

## [0.5.2] — 2026-07-15

### Fixed

- **`loupe-mcp` binary now actually starts.** After 0.5.1 shipped compiled JS, launching the
  installed `loupe-mcp` binary still did nothing — it started and exited without serving.
  The entrypoint guard compared `import.meta.url` to `argv[1]`, but the npm `bin` is a
  **symlink** into `node_modules/.bin`: Node resolves the symlink for `import.meta.url` while
  `argv[1]` stays the symlink path, so the two never matched and the stdio transport never
  connected. The check now resolves symlinks (`realpathSync`) before comparing, so
  `loupe-mcp` (and MCP-directory introspection like Glama) works. Verified by running the
  published binary through its `node_modules/.bin` symlink.

## [0.5.1] — 2026-07-15

### Fixed

- **`@loupekit/mcp` now installs and runs from npm.** The package shipped its raw
  TypeScript entry (`index.ts`) and relied on Node stripping types at runtime — but
  Node refuses to strip types for files under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so `npm i -g @loupekit/mcp` followed
  by `loupe-mcp` failed for every consumer (and blocked containerized introspection on
  MCP directories like Glama). The package now compiles to `dist/index.js` (tsup, bundled
  in the root build with a `prepublishOnly` safety net) and points `bin`/`main` there.
  Running the server from a source checkout (`node packages/mcp/index.ts`) is unchanged.
  Its type-only dependency on `@loupekit/shared` moved to `devDependencies`, so a fresh
  install no longer pulls an unrelated `shared` version.

## [0.5.0] — 2026-07-14

### Added

- **Free comments — drop a note anywhere, no element or screenshot.** A new **"Note"**
  toolbar mode lets you click any spot on the page and leave a page-level comment that
  isn't tied to a DOM element and carries no screenshot — the lightest way to say "this
  whole area feels off." New `kind: "free"` in `@loupekit/shared`; the drop point is
  stored in the existing `offset` field as a fraction of the document, so **no database
  migration is needed** on the Node server or in `loupekit/laravel`. Free notes render as
  page-level items in the SDK panel, the dashboard, and both MCP servers (Node + Laravel),
  which omit the element-HTML/styles sections for them. _Ships to the SDK, the browser
  extension, and the Laravel widget together (shared `@loupekit/sdk` core)._
- **Draggable, edge-aware toolbar.** Grab the `◎ Loupe` logo and drop the bar anywhere on
  screen; its position persists across reloads (`localStorage`). When expanded it grows
  **inward** so it's always fully visible — docked to a left/right edge it opens as a
  vertical column, along the top/bottom or in a corner it opens as a horizontal row.
  Clicking the logo still collapses/expands; a drag no longer triggers a toggle.

### Changed

- **Version alignment.** All publishable packages move to `0.5.0`. The previously stale
  `@loupekit/server` (`0.2.0`), the extension `manifest.json` (`0.2.0`), and the Node MCP
  server (`McpServer` `0.2.0`) are now `0.5.0` in lockstep with the rest.

## [0.4.3] — 2026-07-13

### Fixed
- **`loupekit/laravel`: multi-guard apps no longer 403 with "cannot post as another
  user".** Apps that use separate auth guards (e.g. `web` for users, `admin` for admins)
  could render the widget under one guard and authenticate the API under another, so the
  ids mismatched. Loupe now resolves identity through a configurable, ordered guard list
  (`LOUPE_GUARDS`, e.g. `web,admin`) and uses the **same** resolution everywhere — the
  widget author, the `loupe:use`/`loupe:admin` gates, the API middleware (new `loupe.auth`,
  which accepts a session on any configured guard), and the anti-spoof check. Fully
  backward compatible: unset = the app's default guard, identical to before.

## [0.4.2] — 2026-07-12

### Fixed
- **`loupekit/laravel`: widget/dashboard assets now load behind a CDN.** The package
  loaded its own JS via `asset('vendor/loupe/...')`, which respects the host's
  `ASSET_URL` — so apps that point `ASSET_URL` at a CDN (with only their Vite build
  uploaded there) got 404s and a silently missing widget. Loupe now resolves its own
  published assets from the **app URL** via `Url::asset()`, bypassing `ASSET_URL`. New
  `LOUPE_ASSET_URL` env / `config('loupe.asset_url')` to override the origin if you serve
  `public/vendor/loupe` elsewhere. Backward-compatible (same result on non-CDN hosts).

## [0.4.1] — 2026-07-12

### Fixed
- **Captures no longer hang the widget.** `await document.fonts.ready` (added in 0.3.4)
  could stall indefinitely on SPAs that keep loading fonts, making **Inspect** feel
  stuck ("loads too hard") and **Region shot** never open its composer. The font wait
  is now capped (~0.8s), the capture timeout lowered to 6s, and every capture is
  wrapped in a hard outer timeout so it can never block the UI.
- **Region shot opens instantly.** The composer now appears immediately and the
  screenshot is captured in the background (attached on submit), instead of blocking on
  the capture first. Fixes the region "Attach screenshot" checkbox being disabled
  because the shot hadn't been captured yet.

_SDK fix — applies to the SDK, the browser extension, and the `loupekit/laravel` widget._

## [0.4.0] — 2026-07-12

### Added
- **Device / viewport tracking (end to end).** Each comment now records the viewport
  it was captured on; the SDK panel, the dashboard, and the MCP payload show a
  **desktop / tablet / mobile** badge, and it's persisted in the database
  (`comments.viewport` on the server; a new `viewport` column via
  `add_viewport_to_loupe_comments_table` on Laravel). New `deviceType(width)` helper
  in `@loupekit/shared`.
- **Per-page comments on SPA navigation.** The widget reloads comments when the URL
  changes without a full page load (patched `history.pushState`/`replaceState` +
  `popstate`), so each page shows only its own comments.

### Changed
- **Mobile toolbar.** On small screens the bar is compact, **icon-only, and pinned to
  the left**; every item now uses one consistent icon+label layout (fixes the
  misaligned icons/text). Collapsing the bar (click the ◎ logo) now also hides the pins.
- **Region-shot capture** renders the smallest element that covers the selection
  instead of the whole page — faster, and it embeds web fonts reliably (the full-page
  render was timing out and falling back to system fonts, distorting the shot).

_All changes above are in `@loupekit/sdk`/`@loupekit/shared`, so they apply to the SDK,
the browser extension, and the `loupekit/laravel` widget; released together at 0.4.0._

## [0.3.4] — 2026-07-12

### Fixed
- **Screenshots fell back to system fonts (wrong layout).** The DOM-based capture
  rasterized before the page's web fonts were embedded, so headings/buttons rendered
  in a fallback font and reflowed (e.g. button text wrapping). Capture now awaits
  `document.fonts.ready` and allows a generous 30s timeout for cross-origin font/asset
  embedding, so the screenshot matches the page. Applies to `@loupekit/sdk` (and thus
  the browser extension and the `loupekit/laravel` widget).
  _Note: fonts served without CORS headers still can't be embedded by any DOM-based
  capture — the pixel-perfect browser extension is the fallback for those._

## [0.3.3] — 2026-07-12

### Added
- **Collapsible toolbar (all SDK surfaces).** Clicking the "◎ Loupe" logo now
  collapses the toolbar to just the logo and expands it again — so the bar can be
  tucked away while browsing. This lives in `@loupekit/sdk`, so it applies
  everywhere the SDK renders: the standalone SDK, the browser extension, and the
  `loupekit/laravel` widget.

### Fixed
- **`loupekit/laravel` — "You are not authorized to use Loupe" on a fresh install.**
  Loupe is now frictionless for any authenticated user in the `local` environment
  (governed by the new `config('loupe.allow_in_local')`, default `true`); the
  `loupe:use` / `loupe:admin` gates and `authorize` closures govern other
  environments. Baseline gates now deny by default (secure in production). An
  explicit `authorize` closure still wins in every environment.

### Changed
- All publishable packages released together at 0.3.3 (`@loupekit/shared`,
  `@loupekit/sdk`, `@loupekit/mcp`, and `loupekit/laravel`).

## [0.3.2] — 2026-07-12

### Fixed
- **`loupekit/laravel` migration failed on MySQL** — the `loupe_comments.url` column
  was a `TEXT`, which MySQL cannot include in the `(project_key, url)` index without a
  key length (`SQLSTATE[42000] 1170: BLOB/TEXT column 'url' used in key specification
  without a key length`). `url` is now `VARCHAR(500)` and `project_key` `VARCHAR(191)`
  so the composite index fits MySQL's key-length limit. Works on MySQL, PostgreSQL and
  SQLite. (Normalized URLs are short, so 500 chars is ample.)

## [0.3.1] — 2026-07-12

### Changed
- **SEO / GEO — author & entity metadata.** Made the project and its author,
  **Mohamed Ashraf Elsaed**, discoverable by search engines and AI answer engines
  (ChatGPT, Claude, Perplexity, Gemini, Copilot): a schema.org `@graph`
  (`Person` + `Organization` + `WebSite` + `SoftwareApplication`) with `sameAs`
  links to LinkedIn/GitHub and `mailto:`, `rel="me"`/`rel="author"` links, a visible
  author byline, an explicit AI-crawler allow-list in `robots.txt`, an **Author**
  section in `llms.txt`, `author` fields across the npm packages, and updated
  `composer.json` author (email `m.ashraf.saed@gmail.com`, LinkedIn homepage).

### Fixed
- **Release/CI:** synced `package-lock.json` with the bumped versions so `npm ci`
  (and therefore the npm publish + CI) no longer fails on release tags.

## [0.3.0] — 2026-07-12

### Added
- **Loupe for Laravel (`loupekit/laravel`).** A Composer package that installs the whole
  Loupe loop into any Laravel app: the `@loupeWidget` Blade directive embeds the SDK,
  comments persist to the host's own database (`loupe_comments` Eloquent model), access is
  gated per-user via `loupe:use` / `loupe:admin` Gate abilities **and** config closures,
  the Kanban dashboard is served on a host route (`/loupe/dashboard`) behind the host's
  auth, and a first-party **MCP server** (`php artisan mcp:start loupe`, on
  `laravel/mcp`) hands the backlog to Claude Code. Screenshots use the Laravel filesystem.
  Supports **PHP 8.4+** and **Laravel 11/12/13**, with a CI matrix and a **100%
  line-coverage** gate. See [docs/LARAVEL.md](docs/LARAVEL.md).

### Changed
- **SDK:** `LoupeConfig` gained two generic options — `headers` (extra request headers,
  e.g. a CSRF token) and `credentials` (fetch credentials mode) — so the widget can
  authenticate via a session cookie instead of the HMAC identity header. Fully
  back-compatible with the standalone server.
- **Dashboard:** now reads an injected `window.__LOUPE__` (api/project/csrf) when present
  and sends `X-CSRF-TOKEN`, so it can run behind a host's authenticated session (used by
  the Laravel package). Falls back to the existing `?api/?project/?key` query params.

## [0.2.1] — 2026-07-12

### Changed
- **Docs:** professional npm READMEs for `@loupekit/sdk`, `@loupekit/mcp`, and
  `@loupekit/shared` — hero banner, shields.io badges, product screenshots, feature tables,
  and the re-anchor before/after visuals. No code changes.

## [0.2.0] — 2026-07-12

### Added
- **Free-region screenshots ("Region shot")** — a new toolbar mode lets you drag a
  free-size box anywhere on the page, screenshot exactly that area, and pin a comment to
  it — no element required. The region is anchored to the element under its center and
  stored as fractions of that element's box, so the pin **tracks responsive reflow and a
  different viewport** (a region drawn on mobile lands correctly on desktop) as well as
  scrolling; it re-shows the outline when highlighted and detaches gracefully if the
  anchor is gone. Persists through the whole loop (SDK/extension → API → dashboard →
  MCP); the extension captures real pixels via `captureVisibleTab`, the SDK default via
  `modern-screenshot`. New optional `captureRegion` config hook mirrors `captureScreenshot`.

### Changed
- **Automated dual-registry publishing.** Every push to `main` now publishes a
  `X.Y.Z-next.<n>` prerelease to the `next` dist-tag, and tagging `vX.Y.Z` publishes a
  stable `latest` — both to **public npm** (`@loupekit/*`) and **GitHub Packages**
  (`@mohamed-ashraf-elsaed/*`). See `RELEASING.md`.
- **npm package pages.** Added full, professional READMEs and keywords to
  `@loupekit/shared`, `@loupekit/sdk`, and `@loupekit/mcp` (previously blank on npm).

### Fixed
- **SDK widget styling** — the theme custom properties (`--accent`, `--panel`, `--line`, …)
  were declared on `:root, .loupe`, neither of which resolves inside the Shadow DOM, so every
  `var(…)` fell back to nothing: composer/panel backgrounds went transparent and buttons lost
  their fills and borders (the "Comment" button was white-on-transparent → invisible; panel
  actions rendered as bare text). Declared them on `:host` so they inherit through the shadow
  tree. Affects the SDK widget and the browser extension (which reuses the SDK core).

## [0.1.0] — 2026-07-09

The first release — the full loop, end to end.

### Added
- **`@loupekit/sdk`** — embeddable Shadow-DOM widget: element inspector, comment composer,
  screenshot capture, and redeploy-surviving re-anchoring (multi-signal fingerprint).
- **`@loupekit/server`** — `node:http` API with Postgres (PGlite locally, `pg` in prod),
  object storage for screenshots, per-project HMAC authentication, and static hosting.
- **`@loupekit/dashboard`** — Kanban triage board (status columns, page filter, live refresh).
- **`@loupekit/mcp`** — MCP server exposing comments to Claude Code (`list_comments`,
  `get_comment`, `update_status`).
- **`@loupekit/extension`** — MV3 browser extension reusing the SDK core with pixel-perfect
  `captureVisibleTab` screenshots.
- **`@loupekit/shared`** — canonical types + `normalizeUrl`.
- Vitest test suite (~91% line coverage), Mermaid architecture docs, a GitHub Wiki, and an
  SEO/GEO-optimized landing page.

[Unreleased]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/mohamed-ashraf-elsaed/loupe/compare/v0.2.1...v0.3.0
[0.1.0]: https://github.com/mohamed-ashraf-elsaed/loupe/releases/tag/v0.1.0
