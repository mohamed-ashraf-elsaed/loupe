import { STYLES } from "./styles.js";
import { captureAnchor, resolveAnchor } from "./fingerprint.js";
import { attachmentKind, captureElementContext, captureScreenshot, captureRegionScreenshot, captureRegionRecording } from "./capture.js";
import { LocalStorageAdapter } from "./store.js";
import { HttpAdapter } from "./http-adapter.js";
import {
  ACTIVITY_STATUS_LABELS,
  awaitingReview,
  CHANGE_TYPES,
  CHANGE_TYPE_LABELS,
  COMMENT_PRIORITIES,
  DEFAULT_CHANGE_TYPE,
  DEFAULT_PRIORITY,
  formatDuration,
  lifecycle,
  normalizePriority,
  normalizeStatus,
  PRIORITY_LABELS,
  STAGE_LABELS,
  summarizeActivity,
} from "./types.js";
import type {
  ActivityEvent, ActivityEventInput, ActivityStatus, Anchor, Attachment, ChangeType, Comment,
  CommentPriority, LoupeConfig, RegionRect, ResolveResult, StorageAdapter,
} from "./types.js";

declare const __LOUPE_VERSION__: string | undefined;
/** The build that produced this bundle (baked in by tsup); recorded on every comment. */
const SDK_VERSION = typeof __LOUPE_VERSION__ === "string" ? __LOUPE_VERSION__ : "dev";

type Mode = "off" | "inspect" | "region" | "free" | "record";
/** Accent presets — a variant per theme, since light needs a darker hue to stay legible. */
const ACCENTS: { id: string; dark: string; light: string; soft: string }[] = [
  { id: "indigo", dark: "#6b73e6", light: "#4a55d6", soft: "rgba(107,115,230,0.12)" },
  { id: "violet", dark: "#a06be6", light: "#7c3fd4", soft: "rgba(160,107,230,0.14)" },
  { id: "teal", dark: "#2fb6a8", light: "#0f8f83", soft: "rgba(47,182,168,0.14)" },
  { id: "amber", dark: "#d99a2b", light: "#a9700f", soft: "rgba(217,154,43,0.14)" },
  { id: "rose", dark: "#e05c86", light: "#c2295a", soft: "rgba(224,92,134,0.14)" },
];
const ACCENT_IDS = ACCENTS.map((a) => a.id);

/**
 * The guided tour: one short step per idea a new user needs. Each step names the
 * tab it belongs to, so the tour can move the panel itself out of the way.
 */
const TOUR: { sel: string; tab: Tab; title: string; body: string }[] = [
  // Home first: the panel already opens there, so the first step never moves the
  // user — the tour starts where they are.
  { sel: ".hstat", tab: "home", title: "Home shows what needs you",
    body: "Four tiles count open, needs-you, resolved and stale feedback. Click one to narrow the list to that bucket." },
  { sel: ".hscope", tab: "home", title: "This page, or the whole project",
    body: "Switch to All to see every page's feedback as a day-grouped timeline, with a repo filter." },
  { sel: ".tools", tab: "comments", title: "Pin feedback anywhere",
    body: "Inspect picks an element, Note drops a page-level comment, Region captures a rectangle, and Record films one." },
  { sel: '.tabs [data-tab="activity"]', tab: "activity", title: "Watch the work happen",
    body: "Anything an agent bridge or your app reports lands here — with tool chips to filter it, and Loupe's own operations alongside." },
  { sel: '.dctl [data-role="settings"]', tab: "activity", title: "Make it yours",
    body: "Accents, the visibility switches, and Restart tour all live here." },
];

/** One contextual hint per built-in view, shown once (unless hints are switched off). */
const HINTS: Record<BuiltinTab, { title: string; body: string }> = {
  home: { title: "Your triage at a glance", body: "The tiles count this page by default. Switch to All for the whole project, or click a tile to jump straight to that bucket." },
  comments: { title: "Pin, note or record", body: "Inspect selects an element, Note comments anywhere on the page, Region screenshots a rectangle, and Record captures video of one." },
  activity: { title: "Watch the work happen", body: "Every event the bridge or your app reports lands here, alongside Loupe's own operations. Click a tool chip to filter the feed." },
};

/** Where the control panel is anchored — the four layouts the position menu offers. */
type DockMode = "left" | "right" | "bottom" | "float";
/** The pages that ship with the panel. Hosts can add more via `init({ tabs })`. */
type BuiltinTab = "home" | "comments" | "activity";
const BUILTIN_TABS: { id: BuiltinTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "comments", label: "Comments" },
  { id: "activity", label: "Activity" },
];
/** A tab id — built-in or host-registered. */
type Tab = string;
/** Which comments the panel is looking at: just this page, or the whole project. */
type Scope = "page" | "all";
/** A stat tile the user clicked — narrows the list to that bucket. */
type StatFilter = "" | "open" | "needs_you" | "resolved" | "stale";
/** What the composer is about to attach a comment to. */
type ComposeTarget =
  | { kind: "element"; element: Element }
  | { kind: "region"; region: RegionRect; element: Element | null; screenshot?: string; recording?: string }
  | { kind: "free"; offset: { x: number; y: number }; point: { x: number; y: number }; label?: string };

const DOCK_MODES: DockMode[] = ["left", "right", "bottom", "float"];
/** How long a single screen recording may run before it auto-stops. */
const RECORD_MAX_MS = 20000;
/** Attachment limits for the composer — small enough to survive a base64 POST. */
const MAX_FILES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const uid = () =>
  (crypto as any).randomUUID ? crypto.randomUUID() : "c_" + Math.abs(hash(String(performance.now()))).toString(36);
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/**
 * A phone/tablet. `(pointer: coarse)` is the primary signal, but a phone asking for the
 * **desktop site** reports a FINE pointer, so touch capability is the backstop. Getting
 * this wrong sends a finger user down the mouse path: a composer that grabs the focus
 * (keyboard over the page) and a drag-select that fights the page scroll.
 */
function isTouchDevice(): boolean {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(hover: none)").matches) return true;
  } catch {
    /* matchMedia unavailable */
  }
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
  return typeof window !== "undefined" && "ontouchstart" in window;
}

/** Whether the browser says the primary pointer is coarse (diagnostic only). */
function coarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Whether screen recording is possible at all (absent in every iOS browser). */
function canShareScreen(): boolean {
  return typeof (navigator.mediaDevices as MediaDevices | undefined)?.getDisplayMedia === "function";
}

/** A captured data-URL as a File, so a screenshot can ride along as a normal attachment. */
function dataUrlToFile(dataUrl: string, name: string): File | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const [, type, b64, payload = ""] = m;
  try {
    const raw = b64 ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new File([bytes], name, { type: type || "image/png" });
  } catch {
    return null;
  }
}

export class LoupeApp {
  private cfg: LoupeConfig;
  private store: StorageAdapter;
  private root!: HTMLElement;
  private shadow!: ShadowRoot;
  private overlay!: HTMLElement;
  private hl!: HTMLElement;
  private selbox!: HTMLElement;
  private regionBox!: HTMLElement;
  private composer!: HTMLElement;

  /** The dockable control panel (header + tabs + tools + comment list). */
  private dock!: HTMLElement;
  /**
   * The collapsed FAB cluster shown while the panel is closed: a primary brand
   * button (with the comment count) plus quick actions that expand out of it.
   * `launcher` is the primary button itself (kept as a class for the dock's
   * show/hide logic); `fabMinis` is the row of quick actions.
   */
  private fabCluster!: HTMLElement;
  private fabMinis!: HTMLElement;
  private fabBadge!: HTMLElement;
  /** Whether the quick-action minis are expanded out of the primary FAB. */
  private fabExpanded = false;
  /** Whether pin markers are hidden on the page (a quick-action toggle, persisted). */
  private markersHidden = false;
  private themeBtn!: HTMLButtonElement;
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  /** Floating "recording…" indicator + stop button, shown only while recording. */
  private recBar!: HTMLElement;
  /** Stops the in-flight screen recording (wired while recording). */
  private stopRecording?: () => void;

  private comments: Comment[] = [];
  /** Free-text filter over the list (title / body / author). */
  private search = "";
  /** Ids of list items the user expanded — items are collapsed by default. */
  private expanded = new Set<string>();
  /** comment.id → currently resolved element (or null when detached). */
  private resolved = new Map<string, Element | null>();
  /** comment.id → pin element. */
  private pins = new Map<string, HTMLElement>();

  private mode: Mode = "off";
  private lastUrl = "";
  /** In-flight region screenshot, captured in the background while the composer is open. */
  private pendingShot?: Promise<string | undefined>;
  private targetOffset = { x: 0.5, y: 0.5 };
  private pending: ComposeTarget | null = null;
  private dragStart: { x: number; y: number } | null = null;
  /** region comment whose outline is currently highlighted (tracks scroll). */
  private activeRegionId: string | null = null;
  private regionTimer?: number;

  // ---- control-panel state (persisted in localStorage `loupe:dock`) ----------
  private dockMode: DockMode = "right";
  private open = true;
  private theme: "dark" | "light" = "dark";
  private tab: Tab = "home";
  /** "page" = this URL only; "all" = the whole project (the timeline scope). */
  private scope: Scope = "page";
  /** Every-page comments, fetched the first time the "All" scope is opened. */
  private allComments: Comment[] = [];
  /** A clicked stat tile, which narrows the list. */
  private statFilter: StatFilter = "";
  /** Repo filter, offered once the scope is "all". */
  private repoFilter = "";
  private repoSel!: HTMLSelectElement;
  /** The Home overview container (stat tiles + activity), rebuilt on render. */
  private homeEl!: HTMLElement;
  /** Accent preset id (see ACCENTS), applied as inline --accent / --accent-soft. */
  private accent = "indigo";
  /** Collapsed to the one-line minimize bar. */
  private minimized = false;
  /** The "help layer": FAB tooltips and the contextual hint cards. */
  private hoverHints = true;
  /** Show each comment's page path (useful in the project scope). */
  private showPaths = false;
  /** Views whose hint card has already been shown. */
  private hintsSeen = new Set<string>();
  /** Current guided-tour step, or -1 when the tour is closed. */
  private tourStep = -1;
  /** The first-run tour has been finished or skipped. */
  private tourDone = false;
  private posMenu!: HTMLElement;
  private settingsMenu!: HTMLElement;
  private minBar!: HTMLElement;
  private tourEl!: HTMLElement;
  private tourSpot!: HTMLElement;
  private tourCard!: HTMLElement;
  /** The live Activity feed — in memory only; it is a monitor, not an archive. */
  private activityEvents: ActivityEvent[] = [];
  private activityStatus: ActivityStatus = "idle";
  /** A tool chip the user clicked, which narrows the feed to that kind. */
  private activityFilter = "";
  /** Auto-scroll the feed to the newest event (off while the user is reading). */
  private activityFollow = true;
  /** The summary card's key/value rows are behind this toggle. */
  private summaryOpen = false;
  private activityEl!: HTMLElement;
  private feedEl!: HTMLElement;
  /** Per-browser project settings: a repo override and the environment URLs. */
  private project: { repo?: string; environments: string[] } = { environments: [] };
  /** The project manager popover, and its search box. */
  private projMenu!: HTMLElement;
  private projSearch = "";
  private projOpen = false;
  private projResults: string[] = [];
  private projError = "";
  private envDraft = "";
  /** Guards against a slow repo search overwriting a newer one. */
  private repoSeq = 0;
  /** Float-mode window geometry; (x<=0 && y<=0) → placed on first layout. */
  private floatRect = { x: 0, y: 0, w: 380, h: 540 };
  private floatDrag: { px: number; py: number; ox: number; oy: number } | null = null;
  private floatResize: { px: number; py: number; ow: number; oh: number } | null = null;

  private raf = 0;
  private mo?: MutationObserver;
  private tick?: number;

  constructor(cfg: LoupeConfig) {
    this.cfg = cfg;
    // apiBase set → talk to the backend; otherwise persist locally (prototype).
    this.store = cfg.apiBase
      ? new HttpAdapter(cfg.apiBase, cfg.user, cfg.userHmac, cfg.headers, cfg.credentials)
      : new LocalStorageAdapter();
  }

  private get url() { return location.pathname + location.search; }

  async start() {
    this.loadState();
    this.loadProject();
    this.buildDom();
    if (this.cfg.autoOpen) this.open = true;
    this.applyDockLayout();
    this.lastUrl = this.url;
    this.comments = await this.store.list(this.cfg.projectKey, this.url);
    this.renderPins();
    this.renderList();
    this.renderHome();
    // A restored "All" scope needs the project-wide list.
    if (this.scope === "all") void this.loadAllComments();
    this.observe();
    this.watchNavigation();
    // First run: walk through the panel once. Skippable, never repeated, and off on
    // phones where the sheet is too small to spotlight anything useful.
    if (!this.tourDone && this.open && !this.isMobile()) this.startTour();
    if (this.cfg.autoOpen) this.setMode("inspect");
  }

  /**
   * Reload comments when the page URL changes without a full reload (SPA
   * navigation), so each page only ever shows its own comments.
   */
  private watchNavigation() {
    const onChange = () => {
      if (this.url === this.lastUrl) return;
      this.lastUrl = this.url;
      void this.reloadComments();
    };
    addEventListener("popstate", onChange);
    // history.pushState/replaceState don't emit events — wrap them once.
    for (const key of ["pushState", "replaceState"] as const) {
      const original = history[key];
      history[key] = function (this: History, ...args: unknown[]) {
        const result = (original as (...a: unknown[]) => unknown).apply(this, args);
        dispatchEvent(new Event("loupe:locationchange"));
        return result;
      } as History[typeof key];
    }
    addEventListener("loupe:locationchange", onChange);
  }

  private async reloadComments() {
    try {
      this.comments = await this.store.list(this.cfg.projectKey, this.url);
      this.renderPins();
      this.renderList();
    } catch { /* keep the current view on transient errors */ }
  }

  // ---- DOM construction -----------------------------------------------------

  private buildDom() {
    this.root = document.createElement("div");
    this.root.id = "loupe-root";
    document.body.appendChild(this.root);
    this.shadow = this.root.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.overlay = el("div", "overlay");
    this.hl = el("div", "hl");
    this.hl.appendChild(el("span", "tip"));
    this.selbox = el("div", "selbox");
    this.regionBox = el("div", "region-box");
    this.overlay.append(this.hl, this.selbox, this.regionBox);
    this.shadow.appendChild(this.overlay);

    this.composer = el("div", "composer");
    this.shadow.appendChild(this.composer);

    this.dock = this.buildDock();
    this.fabCluster = this.buildFabCluster();
    this.recBar = this.buildRecBar();

    // Guided tour overlay — click-through by design (see STYLES), so it can never
    // trap someone mid-task.
    this.tourEl = el("div", "tour");
    this.tourSpot = el("div", "tour-spot");
    this.tourCard = el("div", "tour-card");
    this.tourEl.append(this.tourSpot, this.tourCard);

    this.shadow.append(this.dock, this.fabCluster, this.recBar, this.tourEl);

    // A click anywhere outside a popover dismisses it.
    this.shadow.addEventListener("click", (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest && t.closest(".menu-wrap")) return;
      this.closeMenus();
    });
  }

  /**
   * The dockable control panel:
   * header (brand + dock controls) → tabs → [Comments view: tools + list + integrations]
   * and a [Connect view] with the Claude/MCP onboarding steps.
   */
  private buildDock(): HTMLElement {
    const dock = el("div", "dock");

    // header ------------------------------------------------------------------
    const head = el("div", "dhead");
    const brand = el("div", "brand");
    brand.innerHTML = `<span class="logo">◎</span><span class="title"></span>`;
    (brand.querySelector(".title") as HTMLElement).textContent = this.cfg.label ?? "Loupe";
    head.addEventListener("pointerdown", this.onHeadPointerDown); // drag in float mode

    const ctl = el("div", "dctl");

    // Position menu — one button opening a 2x2 grid of the four layouts. Four
    // separate header buttons left no room once settings and minimize moved in.
    const posWrap = el("div", "menu-wrap");
    const posBtn = el("button") as HTMLButtonElement;
    posBtn.dataset.role = "pos";
    posBtn.title = "Panel position";
    posBtn.setAttribute("aria-label", "Panel position");
    posBtn.innerHTML = I_DOCK_RIGHT;
    this.posMenu = el("div", "menu");
    const posMeta: { mode: DockMode; icon: string; label: string }[] = [
      { mode: "left", icon: I_DOCK_LEFT, label: "Left" },
      { mode: "bottom", icon: I_DOCK_BOTTOM, label: "Bottom" },
      { mode: "right", icon: I_DOCK_RIGHT, label: "Right" },
      { mode: "float", icon: I_FLOAT, label: "Float" },
    ];
    this.posMenu.innerHTML = `<div class="menu-label">Position</div><div class="pos-grid">` +
      posMeta.map((m) => `<button data-pos="${m.mode}">${m.icon}<span>${m.label}</span></button>`).join("") +
      `</div>`;
    this.posMenu.querySelectorAll<HTMLElement>("[data-pos]").forEach((b) => {
      b.onclick = () => { this.setDock(b.dataset.pos as DockMode); this.closeMenus(); };
    });
    posBtn.onclick = () => this.toggleMenu(this.posMenu);
    posWrap.append(posBtn, this.posMenu);

    this.themeBtn = el("button") as HTMLButtonElement;
    this.themeBtn.dataset.role = "theme";
    this.themeBtn.onclick = () => this.toggleTheme();

    // Settings dropdown (theme accents, the help layer, replaying the tour).
    const setWrap = el("div", "menu-wrap");
    const setBtn = el("button") as HTMLButtonElement;
    setBtn.dataset.role = "settings";
    setBtn.title = "Settings";
    setBtn.setAttribute("aria-label", "Settings");
    setBtn.innerHTML = I_GEAR;
    setBtn.onclick = () => this.toggleMenu(this.settingsMenu);
    // Built once and only ever reflected into — rewriting this menu's innerHTML on
    // every paint detached the row being clicked, so the outside-click handler saw
    // a detached target and closed the menu out from under the user.
    this.settingsMenu = el("div", "menu");
    this.settingsMenu.innerHTML =
      `<div class="menu-label">Appearance</div>` +
      `<div class="acc-dots">` +
      ACCENTS.map((a) =>
        `<button class="acc-dot" data-accent="${a.id}" style="background:${a.dark}" ` +
        `title="${a.id}" aria-label="${a.id} accent"></button>`).join("") +
      `</div><div class="menu-sep"></div><div class="menu-label">Show</div>` +
      `<button class="menu-row" data-set="hoverHints" aria-pressed="true"><span>Hover hints</span><span class="sw"></span></button>` +
      `<button class="menu-row" data-set="markersHidden" aria-pressed="true"><span>Markers</span><span class="sw"></span></button>` +
      `<button class="menu-row" data-set="showPaths" aria-pressed="false"><span>Page paths</span><span class="sw"></span></button>` +
      `<div class="menu-sep"></div>` +
      `<button class="menu-row" data-set="tour"><span>Restart tour</span></button>` +
      `<div class="menu-ver">Loupe <b>v${escapeHtml(SDK_VERSION)}</b>` +
      `<span class="menu-mode">${this.cfg.apiBase ? "server" : "offline"}</span></div>`;
    this.settingsMenu.querySelectorAll<HTMLElement>("[data-accent]").forEach((b) => {
      b.onclick = () => this.setAccent(b.dataset.accent!);
    });
    this.settingsMenu.querySelectorAll<HTMLElement>("[data-set]").forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.set!;
        if (key === "tour") { this.closeMenus(); this.startTour(); return; }
        this.toggleSetting(key as "markersHidden" | "hoverHints" | "showPaths");
      };
    });
    setWrap.append(setBtn, this.settingsMenu);

    const minBtn = el("button") as HTMLButtonElement;
    minBtn.dataset.role = "min";
    minBtn.title = "Minimize";
    minBtn.setAttribute("aria-label", "Minimize");
    minBtn.innerHTML = I_MINIMIZE;
    minBtn.onclick = () => this.setMinimized(true);

    const closeBtn = el("button") as HTMLButtonElement;
    closeBtn.dataset.role = "close";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = I_CLOSE;
    closeBtn.onclick = () => this.closeDock();
    ctl.append(posWrap, this.themeBtn, setWrap, minBtn, closeBtn);

    head.append(brand, ctl);

    // The minimize bar: a one-line strip that keeps the panel's context on screen.
    this.minBar = el("div", "minbar");
    this.minBar.onclick = () => this.setMinimized(false);

    // tabs (built-in pages, then whatever the host registered) -----------------
    this.tabList = [...BUILTIN_TABS, ...(this.cfg.tabs ?? []).map((t) => ({ id: t.id, label: t.label }))];
    const tabs = el("div", "tabs");
    for (const t of this.tabList) {
      const b = el("button", "tab", t.label) as HTMLButtonElement;
      b.dataset.tab = t.id;
      b.onclick = () => this.setTab(t.id);
      tabs.appendChild(b);
    }

    // tools -------------------------------------------------------------------
    const tools = el("div", "tools");
    const inspectBtn = this.toolBtn("✛", "Inspect", "inspect");
    inspectBtn.title = "Inspect an element and comment on it";
    inspectBtn.onclick = () => this.setMode(this.mode === "inspect" ? "off" : "inspect");
    const freeBtn = this.toolBtn(NOTE_ICON, "Note", "free");
    freeBtn.title = "Drop a note anywhere on the page — no element, no screenshot";
    freeBtn.onclick = () => this.setMode(this.mode === "free" ? "off" : "free");
    const regionBtn = this.toolBtn(REGION_ICON, "Region", "region");
    regionBtn.title = "Drag a free-size box, screenshot it, and comment";
    regionBtn.onclick = () => this.setMode(this.mode === "region" ? "off" : "region");
    const recordBtn = this.toolBtn(RECORD_ICON, "Record", "record");
    recordBtn.title = isTouchDevice()
      ? "Record your screen, then describe the issue"
      : "Drag a box, record a screen video of it, and comment";
    recordBtn.onclick = () => this.setMode(this.mode === "record" ? "off" : "record");

    // Screen recording is desktop-only: NO mobile browser supports getDisplayMedia
    // (iOS Safari never has; Chrome/Firefox on Android expose it in old versions but every
    // call fails — recorded as unsupported). So on a phone we cannot record the screen
    // from the page at all. What we can do is take the clip the phone already recorded
    // with its own screen recorder — so open the picker for it, and deliberately WITHOUT
    // a `capture` attribute: that would open the camera, and filming the room is not a
    // screen recording.
    if (canShareScreen()) {
      tools.append(inspectBtn, freeBtn, regionBtn, recordBtn);
    } else if (isTouchDevice()) {
      const videoBtn = this.toolBtn(VIDEO_ICON, "Video", "video");
      videoBtn.title = "Attach a video — record your screen with your phone, then pick it here";
      videoBtn.onclick = () => this.pickVideo();
      tools.append(inspectBtn, freeBtn, regionBtn, videoBtn);
    } else {
      tools.append(inspectBtn, freeBtn, regionBtn);
    }

    // list --------------------------------------------------------------------
    const listHead = el("div", "listhead");
    listHead.append(document.createTextNode("Comments"));
    this.countEl = el("span", "count", "0");
    listHead.appendChild(this.countEl);
    const search = el("input", "search") as HTMLInputElement;
    search.type = "search";
    search.placeholder = "Search…";
    search.value = this.search;
    search.oninput = () => { this.search = search.value; this.renderList(); };
    listHead.appendChild(search);
    // Repo filter — shown only in the project scope (see renderRepoFilter).
    this.repoSel = el("select", "reposel") as HTMLSelectElement;
    this.repoSel.title = "Filter by repository";
    this.repoSel.setAttribute("aria-label", "Filter by repository");
    this.repoSel.onchange = () => { this.repoFilter = this.repoSel.value; this.renderList(); };
    this.repoSel.style.display = "none";
    listHead.appendChild(this.repoSel);
    this.listEl = el("div", "list");

    // Home view = the overview surface the panel opens on.
    const homeView = el("div", "view home-view");
    this.homeEl = homeView;

    // Comments view = hint card + tools + list + the "integrates with" footer.
    const commentsView = el("div", "view comments-view");
    this.commentsHint = el("div", "hint-slot");
    this.reviewBar = el("div", "reviewbar");
    this.reviewBar.style.display = "none";
    commentsView.append(this.commentsHint, tools, listHead, this.reviewBar, this.listEl, this.buildIntegrations());

    // Activity view = the live monitor (status, summary, chips, feed). The hint slot
    // is part of this panel's own markup — appending it beforehand would be wiped by
    // the innerHTML below.
    const activityView = el("div", "view activity-view");
    this.activityEl = activityView;

    // Host-registered tabs. `render` runs once, here, and gets a context object —
    // the panel never reaches into a tab, and a tab never reaches into the panel.
    const customViews = (this.cfg.tabs ?? []).map((t) => {
      const view = el("div", "view custom-view");
      const slot = el("div", "hint-slot");
      view.appendChild(slot);
      this.customHintSlots.set(t.id, slot);
      try {
        const out = t.render({
          projectKey: this.cfg.projectKey,
          apiBase: this.cfg.apiBase,
          user: this.cfg.user,
          comments: this.comments,
          url: this.url,
          version: SDK_VERSION,
          track: (event) => this.addActivity(event),
          open: (id) => this.setTab(id),
          close: () => this.closeDock(),
        });
        if (typeof out === "string") {
          // Built through innerHTML on a throwaway wrapper rather than
          // insertAdjacentHTML, which not every DOM implementation provides.
          const wrap = el("div", "tab-body");
          wrap.innerHTML = out;
          view.append(...Array.from(wrap.childNodes));
        } else if (out) view.appendChild(out);
      } catch (e) {
        // A broken tab must not take the panel with it.
        view.appendChild(el("div", "empty", `This tab failed to render: ${e instanceof Error ? e.message : String(e)}`));
      }
      return view;
    });

    const resize = el("div", "resize");
    resize.addEventListener("pointerdown", this.onResizeDown);

    dock.append(head, this.minBar, tabs, homeView, commentsView, activityView, ...customViews, resize);
    for (const [id, view] of [["home", homeView], ["comments", commentsView], ["activity", activityView]] as [string, HTMLElement][]) {
      this.viewEls.set(id, view);
    }
    customViews.forEach((v, i) => this.viewEls.set((this.cfg.tabs ?? [])[i]!.id, v));
    this.buildHomePanel();
    this.buildActivityPanel();
    return dock;
  }

  /** The contextual hint cards live in a slot at the top of each view. */
  private commentsHint!: HTMLElement;
  private activityHint!: HTMLElement;
  /** The "N waiting on your review" strip above the list. */
  private reviewBar!: HTMLElement;
  /** Tab id → its hint slot (custom tabs only; the built-ins have named fields). */
  private customHintSlots = new Map<string, HTMLElement>();
  /** The tab strip, in order. */
  private tabList: { id: string; label: string }[] = [];
  /**
   * Each page's container, keyed by tab id. Display is driven by an "on" class
   * rather than a `.tab-<id>` selector, so host-registered ids need no CSS.
   */
  private viewEls = new Map<string, HTMLElement>();

  /**
   * The Activity view: a status row, a collapsible summary, the tool chips and the
   * live feed. Everything is re-derived from `activityEvents` on render, so the
   * summary and the micro-stats can never disagree with the feed below them.
   */
  private buildActivityPanel() {
    this.activityEl.innerHTML =
      `<div class="hint-slot" id="loupe-ahint"></div>` +
      `<div class="mon-status" id="loupe-mon-status">` +
      `<span class="mon-dot"></span><span class="mon-status-label"></span>` +
      `<span class="mon-spacer"></span>` +
      `<button class="mon-clear" data-role="mon-clear" title="Clear the feed">Clear</button>` +
      `</div>` +
      `<div class="mon-summary" id="loupe-mon-summary"></div>` +
      `<div class="mon-micro" id="loupe-mon-micro"></div>` +
      `<div class="mon-chips" id="loupe-mon-chips"></div>` +
      `<div class="mon-feed" id="loupe-mon-feed"></div>`;
    this.feedEl = this.activityEl.querySelector("#loupe-mon-feed") as HTMLElement;
    this.activityHint = this.activityEl.querySelector("#loupe-ahint") as HTMLElement;

    (this.activityEl.querySelector('[data-role="mon-clear"]') as HTMLElement).onclick = () => this.clearActivity();
    // Reading back through the feed stops it jumping to the bottom; scrolling to the
    // end starts following again. That is the "pause on scroll" behaviour, without a
    // separate pause button to forget about.
    this.feedEl.addEventListener("scroll", () => {
      const el = this.feedEl;
      this.activityFollow = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      this.renderActivityChrome();
    });

    // Paint anything reported before this panel existed (e.g. by a tab's render()).
    this.renderActivity();
  }

  // ---- activity feed --------------------------------------------------------

  /** Push one event. Called by Loupe itself and by the public trackActivity(). */
  addActivity(input: ActivityEventInput) {
    const event: ActivityEvent = {
      id: input.id ?? `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: input.at ?? new Date().toISOString(),
      kind: input.kind,
      label: input.label,
      detail: input.detail,
      level: input.level ?? "info",
      files: input.files,
    };
    this.activityEvents.push(event);
    // Cap the ring so a long session cannot grow without bound.
    if (this.activityEvents.length > 500) this.activityEvents = this.activityEvents.slice(-500);
    // A reported error flips the status dot; progress resets it to working.
    this.activityStatus = event.level === "error" ? "error" : "working";
    this.renderActivity();
  }

  setActivityStatus(status: ActivityStatus) {
    this.activityStatus = status;
    this.renderActivity();
  }

  clearActivity() {
    this.activityEvents = [];
    this.activityFilter = "";
    this.activityStatus = "idle";
    this.renderActivity();
  }

  /** The summary, status row, micro-stats and chips — derived, never stored. */
  private renderActivityChrome() {
    if (!this.activityEl) return;
    const status = this.activityEl.querySelector("#loupe-mon-status") as HTMLElement | null;
    // A host tab's render() may report events while the panel is still being built,
    // before this markup exists. Those events are kept and painted once it does.
    if (!status) return;
    const s = summarizeActivity(this.activityEvents, this.activityStatus);

    status.querySelector(".mon-status-label")!.textContent = ACTIVITY_STATUS_LABELS[s.status];
    status.className = `mon-status st-${s.status}`;

    const summary = this.activityEl.querySelector("#loupe-mon-summary") as HTMLElement;
    if (!s.events) {
      summary.innerHTML = "";
      summary.style.display = "none";
    } else {
      summary.style.display = "";
      const rows: [string, string][] = [
        ["Status", ACTIVITY_STATUS_LABELS[s.status]],
        ["Events", String(s.events)],
        ["Duration", formatDuration(s.durationMs)],
        ["Files touched", String(s.files)],
        ["Errors", String(s.errors)],
        ["Tools", s.byKind.map((k) => `${k.kind} ×${k.count}`).join(", ") || "—"],
      ];
      summary.innerHTML =
        `<button class="mon-sum-head" data-role="mon-toggle" aria-expanded="${this.summaryOpen}">` +
        `<span class="mon-sum-title">Session summary</span>` +
        `<span class="mon-sum-peek">${s.events} events · ${formatDuration(s.durationMs)} · ${s.files} files</span>` +
        `<span class="mon-caret">${this.summaryOpen ? "▾" : "▸"}</span></button>` +
        `<div class="mon-sum-body"${this.summaryOpen ? "" : ' style="display:none"'}>` +
        rows.map(([k, v]) => `<div class="mon-kv"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("") +
        `<div class="mon-preview"></div></div>`;

      // Last event as the preview line. (`.at(-1)` is ES2022; the SDK targets ES2020.)
      summary.querySelector(".mon-preview")!.textContent =
        this.activityEvents[this.activityEvents.length - 1]?.label ?? "";
      (summary.querySelector('[data-role="mon-toggle"]') as HTMLElement).onclick = () => {
        this.summaryOpen = !this.summaryOpen;
        this.renderActivityChrome();
      };
    }

    const micro = this.activityEl.querySelector("#loupe-mon-micro") as HTMLElement;
    micro.textContent = "";
    if (s.events) {
      micro.append(
        el("span", "mon-micro-i", `⏱ ${formatDuration(s.durationMs)}`),
        el("span", "mon-micro-i", `◦ ${s.events} events`),
        el("span", "mon-micro-i", `⧉ ${s.files} files`),
      );
    }

    const chips = this.activityEl.querySelector("#loupe-mon-chips") as HTMLElement;
    chips.textContent = "";
    if (s.events) {
      const chip = (kind: string, label: string, count: number) => {
        const b = el("button", "mon-chip" + (this.activityFilter === kind ? " on" : ""), `${label} ${count}`);
        b.dataset.kind = kind;
        b.onclick = () => {
          this.activityFilter = this.activityFilter === kind ? "" : kind;
          this.renderActivity();
        };
        return b;
      };
      chips.appendChild(chip("", "All", s.events));
      for (const { kind, count } of s.byKind) chips.appendChild(chip(kind, kind, count));
    }
  }

  /** The feed itself, newest last (so it grows downward like a log). */
  private renderActivity() {
    if (!this.activityEl) return;
    this.renderActivityChrome();
    if (!this.feedEl) return;

    const events = this.activityFilter
      ? this.activityEvents.filter((e) => e.kind === this.activityFilter)
      : this.activityEvents;

    if (!events.length) {
      this.feedEl.innerHTML =
        `<div class="mon-empty">` +
        (this.activityEvents.length
          ? `Nothing from <b>${escapeHtml(this.activityFilter)}</b> yet.`
          : `<b>Monitor unavailable.</b> Nothing is feeding this view yet.<br>` +
            `A bridge or your app can push events with <code>Loupe.trackActivity({ kind, label })</code>, ` +
            `and Loupe reports its own operations here as you work.`) +
        `</div>`;
      return;
    }

    this.feedEl.innerHTML = events.map((e) => {
      const time = new Date(e.at).toLocaleTimeString(undefined, { hour12: false });
      return `<div class="mon-row lv-${e.level ?? "info"}">` +
        `<span class="mon-time">${escapeHtml(time)}</span>` +
        `<span class="mon-kind">${escapeHtml(e.kind)}</span>` +
        `<span class="mon-label">${escapeHtml(e.label)}` +
        (e.detail ? `<span class="mon-detail">${escapeHtml(e.detail)}</span>` : "") +
        `</span></div>`;
    }).join("");

    if (this.activityFollow) this.feedEl.scrollTop = this.feedEl.scrollHeight;
  }

  /**
   * The Home overview: four stat tiles over the current scope, a scope switch
   * (this page ↔ the whole project), a one-click way into capture, and the
   * most recent feedback. Every tile is a button that narrows the list.
   */
  private buildHomePanel() {
    const title = this.cfg.label ?? "Loupe";
    this.homeEl.innerHTML =
      `<div class="hint-slot" id="loupe-hhint"></div>` +
      `<div class="hstat" id="loupe-hstats"></div>` +
      `<div class="hscope">` +
      `<button class="hscope-b" data-scope="page">This page <b class="hscope-n"></b></button>` +
      `<button class="hscope-b" data-scope="all">All <b class="hscope-n"></b></button>` +
      `<button class="hrefresh" title="Refresh" aria-label="Refresh">⟳</button>` +
      `</div>` +
      `<button class="hpin" data-role="home-pin">✛ Pin feedback on this page</button>` +
      `<div class="projbar">` +
      `<span class="proj-label">Project</span>` +
      `<button class="proj-chip" data-role="proj-open" aria-haspopup="dialog" aria-expanded="false">` +
      `<span class="proj-repo"></span><span class="proj-caret">▾</span></button>` +
      // The popover lives INSIDE .projbar: absolute positioning resolves against the
      // nearest positioned ancestor, and as a sibling it anchored to the panel
      // instead — landing off the bottom of the view.
      `<div class="proj-pop" id="loupe-proj" role="dialog" aria-label="Project settings"></div>` +
      `</div>` +
      `<div class="hlabel">Recent</div>` +
      `<div class="hfeed" id="loupe-hfeed"></div>` +
      `<div class="hfoot">${escapeHtml(title)} · <span class="hver">v${escapeHtml(SDK_VERSION)}</span></div>`;

    (this.homeEl.querySelector('[data-role="proj-open"]') as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      this.setProjectOpen(!this.projOpen);
    };

    this.homeEl.querySelectorAll<HTMLElement>(".hscope-b").forEach((b) => {
      b.onclick = () => this.setScope(b.dataset.scope === "all" ? "all" : "page");
    });
    (this.homeEl.querySelector('[data-role="home-pin"]') as HTMLElement | null)!.onclick = () => {
      this.setTab("comments");
      this.setMode("inspect");
    };
    (this.homeEl.querySelector(".hrefresh") as HTMLElement | null)!.onclick = () => {
      void this.reloadComments();
      if (this.scope === "all") void this.loadAllComments();
    };
  }

  /** The comments the panel is currently looking at (page scope or project scope). */
  private get visibleComments(): Comment[] {
    return this.scope === "all" ? this.allComments : this.comments;
  }

  /** Switch the panel between "this page" and the whole project. */
  private setScope(scope: Scope) {
    this.scope = scope;
    this.saveState();
    // The project scope costs a fetch; do it once, then keep it fresh.
    if (scope === "all" && !this.allComments.length) void this.loadAllComments();
    this.renderHome();
    this.renderList();
  }

  private async loadAllComments() {
    try {
      this.allComments = await this.store.listAll(this.cfg.projectKey);
      this.renderHome();
      this.renderList();
    } catch { /* keep whatever we have */ }
  }

  /**
   * The four buckets a triager actually asks about. "Stale" is open work older
   * than a week — the thing that quietly rots on a board.
   */
  private homeStats(): { key: StatFilter; label: string; n: number }[] {
    const list = this.visibleComments;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [
      { key: "open", label: "Open", n: list.filter((c) => normalizeStatus(c.status) !== "resolved").length },
      { key: "needs_you", label: "Needs you", n: list.filter((c) => normalizeStatus(c.status) === "in_review").length },
      { key: "resolved", label: "Resolved", n: list.filter((c) => normalizeStatus(c.status) === "resolved").length },
      {
        key: "stale",
        label: "Stale",
        n: list.filter((c) => normalizeStatus(c.status) !== "resolved" && Date.parse(c.createdAt) < weekAgo).length,
      },
    ];
  }

  private renderHome() {
    if (!this.homeEl) return;
    const stats = this.homeStats();
    const statsEl = this.homeEl.querySelector("#loupe-hstats") as HTMLElement | null;
    if (statsEl) {
      statsEl.innerHTML = stats
        .map((s) =>
          `<button class="hstat-b${this.statFilter === s.key ? " on" : ""}" data-stat="${s.key}">` +
          `<span class="hstat-n">${s.n}</span><span class="hstat-l">${s.label}</span></button>`)
        .join("");
      statsEl.querySelectorAll<HTMLElement>(".hstat-b").forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.stat as StatFilter;
          // Clicking the active tile clears the filter.
          this.statFilter = this.statFilter === key ? "" : key;
          this.setTab("comments");
        };
      });
    }

    // Scope chips carry the counts, so "All" is a decision, not a guess. The project
    // total is only known once the project list has been read; until then it shows ⋯
    // rather than a number we would be inventing.
    const allKnown = this.allComments.length > 0 || this.scope === "all";
    const counts: Record<Scope, string> = {
      page: String(this.comments.length),
      all: allKnown ? String(this.allComments.length) : "⋯",
    };
    const labels: Record<Scope, string> = { page: "This page", all: "All" };
    this.homeEl.querySelectorAll<HTMLElement>(".hscope-b").forEach((b) => {
      const scope = (b.dataset.scope === "all" ? "all" : "page") as Scope;
      b.classList.toggle("on", scope === this.scope);
      b.setAttribute("aria-pressed", String(scope === this.scope));
      b.setAttribute("aria-label", `${labels[scope]} — ${counts[scope]} comments`);
      (b.querySelector(".hscope-n") as HTMLElement).textContent = counts[scope];
    });
    this.renderProject();

    const feed = this.homeEl.querySelector("#loupe-hfeed") as HTMLElement | null;
    if (!feed) return;
    const recent = [...this.visibleComments]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8);
    feed.innerHTML = recent.length
      ? recent.map((c) => {
          const stage = STAGE_LABELS[normalizeStatus(c.status)];
          const prio = normalizePriority(c.priority);
          return `<button class="hfeed-i" data-id="${escapeAttr(c.id)}">` +
            `<span class="hfeed-t">${escapeHtml(c.title || (c.body.split("\n")[0] ?? "").slice(0, 60))}</span>` +
            `<span class="hfeed-m">${escapeHtml(c.author?.name ?? "")} · ${fmtAgo(c.createdAt)} · ` +
            `<span class="hfeed-s hfeed-s-${normalizeStatus(c.status)}">${stage}</span>` +
            `<span class="hfeed-p hfeed-p-${prio}">${PRIORITY_LABELS[prio]}</span></span></button>`;
        }).join("")
      : `<div class="hempty">Nothing here yet.</div>`;
    feed.querySelectorAll<HTMLElement>(".hfeed-i").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id!;
        this.statFilter = "";
        this.setTab("comments");
        this.expanded.add(id);
        this.renderList();
        this.flash(id);
      };
    });
  }

  // ---- project manager (#60) ------------------------------------------------

  /** The repo new comments are filed against: the panel's choice, else the config. */
  private effectiveRepo(): string | undefined {
    return this.project.repo || this.cfg.repo || undefined;
  }

  private setProjectOpen(open: boolean) {
    this.projOpen = open;
    this.projError = "";
    if (open) { this.projSearch = ""; void this.refreshRepos(); }
    this.renderProject();
  }

  /** Repositories to offer — a fixed list, or the host's search function. */
  private async repoChoices(): Promise<string[]> {
    const source = this.cfg.repos;
    if (!source) return [];
    if (Array.isArray(source)) {
      const q = this.projSearch.trim().toLowerCase();
      const all = q ? source.filter((r) => r.toLowerCase().includes(q)) : source;
      return all.slice(0, 50);
    }
    try {
      const out = await source(this.projSearch);
      return (Array.isArray(out) ? out : []).slice(0, 50);
    } catch (e) {
      this.projError = e instanceof Error ? e.message : "Could not load repositories.";
      return [];
    }
  }

  /**
   * Re-run the repo search. The sequence guard matters: typing fires overlapping
   * requests, and without it a slow early reply would overwrite a newer one.
   */
  private async refreshRepos() {
    this.projError = "";
    const seq = ++this.repoSeq;
    const out = await this.repoChoices();
    if (seq !== this.repoSeq) return;
    this.projResults = out;
    this.renderRepoList();
    this.renderProjectError();
  }

  /** Only the list is rewritten on search, so the input keeps focus while typing. */
  private renderRepoList() {
    const list = this.homeEl?.querySelector("#loupe-pp-repos") as HTMLElement | null;
    if (!list) return;
    const repo = this.effectiveRepo();
    list.innerHTML = this.projResults.length
      ? this.projResults.map((r) =>
          `<button class="pp-item${r === repo ? " on" : ""}" data-repo="${escapeAttr(r)}" ` +
          `title="${escapeAttr(r)}">${escapeHtml(r)}</button>`).join("")
      : `<div class="pp-empty">No repositories match.</div>`;
    list.querySelectorAll<HTMLElement>("[data-repo]").forEach((b) => {
      b.onclick = () => {
        this.project.repo = b.dataset.repo;
        this.saveProject();
        this.renderProject();
        this.renderPins();
        this.renderList();
        this.addActivity({ kind: "repo.link", label: `Linked this page to ${b.dataset.repo}` });
      };
    });
  }

  private renderProjectError() {
    const box = this.homeEl?.querySelector("#loupe-pp-err") as HTMLElement | null;
    if (!box) return;
    box.textContent = this.projError;
    box.style.display = this.projError ? "" : "none";
  }

  private renderProject() {
    if (!this.homeEl) return;
    const chip = this.homeEl.querySelector(".proj-chip") as HTMLElement | null;
    const pop = this.homeEl.querySelector("#loupe-proj") as HTMLElement | null;
    if (!chip || !pop) return;
    const repo = this.effectiveRepo();

    (chip.querySelector(".proj-repo") as HTMLElement).textContent = repo ?? "no repo linked";
    chip.classList.toggle("unset", !repo);
    chip.setAttribute("aria-expanded", String(this.projOpen));

    if (!this.projOpen) { pop.classList.remove("open"); pop.innerHTML = ""; return; }
    pop.classList.add("open");

    const envs = this.project.environments;
    pop.innerHTML =
      `<div class="pp-head"><span>Repository</span><button class="pp-x" data-role="pp-close" aria-label="Close">✕</button></div>` +
      `<div class="pp-cur">${repo
        ? `New comments are filed against <b>${escapeHtml(repo)}</b>.`
        : "This page is not linked to a repository yet."}</div>` +
      (this.cfg.repos
        ? `<input class="pp-search" type="search" placeholder="Search repositories…" ` +
          `value="${escapeAttr(this.projSearch)}" aria-label="Search repositories">` +
          `<div class="pp-list" id="loupe-pp-repos"></div>`
        : `<div class="pp-empty">No repository list to search. Pass <code>repos</code> to ` +
          `<code>init()</code> — a string array, or a function the panel calls with the search text.</div>`) +
      (repo ? `<button class="pp-clear" data-role="pp-clear">Unlink this page</button>` : "") +
      `<div class="pp-sep"></div>` +
      `<div class="pp-head"><span>Environments</span></div>` +
      `<div class="pp-list">` + (envs.length
        ? envs.map((u, i) =>
            `<div class="pp-env"><span class="pp-env-u" title="${escapeAttr(u)}">${escapeHtml(u)}</span>` +
            `<button class="pp-x" data-env-rm="${i}" aria-label="Remove environment">✕</button></div>`).join("")
        : `<div class="pp-empty">No environment URLs yet.</div>`) + `</div>` +
      `<div class="pp-add"><input class="pp-env-url" type="url" placeholder="https://staging.example.com" ` +
      `value="${escapeAttr(this.envDraft)}" aria-label="Environment URL">` +
      `<button class="pp-add-b" data-role="env-add">Add</button></div>` +
      `<div class="pp-err" id="loupe-pp-err"></div>`;

    this.renderRepoList();
    this.renderProjectError();

    (pop.querySelector('[data-role="pp-close"]') as HTMLElement).onclick = () => this.setProjectOpen(false);
    (pop.querySelector('[data-role="pp-clear"]') as HTMLElement | null)?.addEventListener("click", () => {
      this.project.repo = undefined;
      this.saveProject();
      this.renderProject();
      this.renderPins();
      this.renderList();
    });

    const search = pop.querySelector(".pp-search") as HTMLInputElement | null;
    if (search) {
      // Keep clicks inside the popover from reaching the panel's dismiss handler.
      search.addEventListener("click", (e) => e.stopPropagation());
      search.oninput = () => { this.projSearch = search.value; void this.refreshRepos(); };
    }

    pop.querySelectorAll<HTMLElement>("[data-env-rm]").forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.envRm);
        this.project.environments = this.project.environments.filter((_, n) => n !== i);
        this.saveProject();
        this.renderProject();
      };
    });

    const url = pop.querySelector(".pp-env-url") as HTMLInputElement | null;
    if (url) {
      url.addEventListener("click", (e) => e.stopPropagation());
      url.oninput = () => { this.envDraft = url.value; };
      url.onkeydown = (e) => { if (e.key === "Enter") (pop.querySelector('[data-role="env-add"]') as HTMLElement).click(); };
    }
    (pop.querySelector('[data-role="env-add"]') as HTMLElement).onclick = () => {
      const normalized = normalizeEnvUrl(this.envDraft);
      if (!normalized) {
        this.projError = "Enter a full http:// or https:// URL.";
        this.renderProjectError();
        return;
      }
      if (this.project.environments.includes(normalized)) {
        this.projError = "That environment is already listed.";
        this.renderProjectError();
        return;
      }
      this.project.environments = [...this.project.environments, normalized];
      this.envDraft = "";
      this.projError = "";
      this.saveProject();
      this.renderProject();
      (pop.querySelector(".pp-env-url") as HTMLInputElement | null)?.focus();
    };
  }

  /** Per-browser project settings, keyed separately from the dock's UI state. */
  private loadProject() {
    const fromConfig = (this.cfg.environments ?? []).filter((u): u is string => typeof u === "string");
    try {
      const raw = localStorage.getItem(`loupe:project:${this.cfg.projectKey}`);
      const p = raw ? JSON.parse(raw) : null;
      const repo = typeof p?.repo === "string" && p.repo ? p.repo : undefined;
      const stored = Array.isArray(p?.environments)
        ? (p.environments as unknown[]).filter((u): u is string => typeof u === "string")
        : null;
      this.project = { repo, environments: stored ?? fromConfig };
    } catch {
      this.project = { environments: fromConfig };
    }
  }

  private saveProject() {
    try {
      localStorage.setItem(`loupe:project:${this.cfg.projectKey}`, JSON.stringify(this.project));
    } catch { /* storage unavailable */ }
  }

  /** The "INTEGRATES WITH" footer on the Comments page (visual only for now). */
  private buildIntegrations(): HTMLElement {
    const wrap = el("div", "integrations");
    wrap.append(el("div", "ilabel", "INTEGRATES WITH"));
    const row = el("div", "irow");
    const icons: [string, string][] = [
      ["GitHub", I_GITHUB],
      ["Slack", I_SLACK],
      ["Telegram", I_TELEGRAM],
      ["Linear", I_LINEAR],
    ];
    for (const [name, icon] of icons) {
      const b = el("span", "ibtn");
      b.title = `${name} — connect (coming soon)`;
      b.setAttribute("aria-label", name);
      b.innerHTML = icon;
      row.appendChild(b);
    }
    wrap.appendChild(row);
    return wrap;
  }

  /** The floating "recording…" pill with a Stop button (shown only while recording). */
  private buildRecBar(): HTMLElement {
    const bar = el("button", "recbar") as HTMLButtonElement;
    bar.title = "Stop recording";
    bar.setAttribute("aria-label", "Stop recording");
    bar.onclick = () => this.stopRecording?.();
    return bar;
  }

  /**
   * The collapsed-state FAB cluster. The primary brand button carries the comment
   * count and toggles the quick actions out and back; the actions are the four
   * ways into the product without opening the full panel first:
   * pin a comment, drop a note, hide/show the markers already on the page, and
   * jump straight to the Claude/MCP setup.
   */
  private buildFabCluster(): HTMLElement {
    const cluster = el("div", "fab-cluster");

    const minis = el("div", "fab-minis");
    const mini = (role: string, icon: string, label: string, title: string) => {
      const b = el("button", "fab-mini") as HTMLButtonElement;
      b.dataset.fab = role;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.innerHTML = `${icon}<span class="fab-tip">${label}</span>`;
      return b;
    };
    const comment = mini("comment", I_COMMENT, "Pin comment", "Pin feedback on any element");
    comment.onclick = () => { this.collapseFab(); this.openDock(); this.setMode("inspect"); };
    const note = mini("note", I_NOTE, "Note", "Drop a note anywhere on the page");
    note.onclick = () => { this.collapseFab(); this.openDock(); this.setMode("free"); };
    const markers = mini("markers", I_EYE, "Markers", "Show or hide the markers on this page");
    markers.onclick = () => this.toggleMarkers();
    minis.append(comment, note, markers);
    // The Connect shortcut only exists when a "connect" tab is registered — the
    // panel no longer ships one, so it is opt-in via connectTab().
    if (this.tabList.some((t) => t.id === "connect")) {
      const connect = mini("connect", I_PLUG, "Connect Claude", "Set up the Claude/MCP connection");
      connect.onclick = () => { this.collapseFab(); this.openDock(); this.setTab("connect"); };
      minis.appendChild(connect);
    }

    const primary = el("button", "launcher") as HTMLButtonElement;
    primary.title = `Open ${this.cfg.label ?? "Loupe"}`;
    primary.setAttribute("aria-label", `${this.cfg.label ?? "Loupe"} — quick actions`);
    primary.setAttribute("aria-expanded", "false");
    primary.innerHTML = `<span class="logo">◎</span>${I_FAB_CHEVRON}<span class="lcount"></span>`;
    this.fabBadge = primary.querySelector(".lcount") as HTMLElement;
    primary.onclick = () => this.toggleFab();

    cluster.append(minis, primary);
    this.fabMinis = minis;
    return cluster;
  }

  /** Expand/collapse the quick actions out of the primary FAB. */
  private toggleFab() {
    this.fabExpanded = !this.fabExpanded;
    this.applyFab();
  }

  private collapseFab() {
    if (!this.fabExpanded) return;
    this.fabExpanded = false;
    this.applyFab();
  }

  /** Hide/show every pin on the page without losing them (persisted). */
  private toggleMarkers() {
    this.markersHidden = !this.markersHidden;
    this.saveState();
    this.applyFab();
  }

  /** Reflect cluster expansion + marker visibility into the DOM. */
  private applyFab() {
    this.fabCluster.classList.toggle("expanded", this.fabExpanded);
    const primary = this.fabCluster.querySelector(".launcher") as HTMLElement | null;
    primary?.setAttribute("aria-expanded", String(this.fabExpanded));
    primary?.setAttribute("aria-label", this.fabExpanded ? "Close quick actions" : `Open ${this.cfg.label ?? "Loupe"} quick actions`);
    const markers = this.fabCluster.querySelector('[data-fab="markers"]') as HTMLElement | null;
    markers?.classList.toggle("on", this.markersHidden);
    markers?.setAttribute("aria-pressed", String(this.markersHidden));
    // !important in CSS so it beats the inline display set by position().
    this.overlay.classList.toggle("hide-pins", this.markersHidden);
  }

  /** A tool button with a uniform icon + label layout. `icon` may be an SVG string. */
  private toolBtn(icon: string, label: string, role: string): HTMLButtonElement {
    const b = el("button") as HTMLButtonElement;
    b.dataset.role = role;
    b.setAttribute("aria-label", label);
    b.innerHTML = `<span class="ico">${icon}</span><span class="label">${label}</span>`;
    return b;
  }

  // ---- inspector ------------------------------------------------------------

  // Pointer Events, not mouse events: a touch drag on a phone never fires
  // mousemove/mouseup, so Region/Record selection was impossible on touch devices.
  // Pointer events cover mouse, touch and pen with one handler each.

  private onMove = (e: PointerEvent) => {
    if (this.mode !== "inspect") return;
    const target = this.pick(e.clientX, e.clientY);
    if (!target) { this.hl.style.display = "none"; return; }
    const r = target.getBoundingClientRect();
    Object.assign(this.hl.style, {
      display: "block", left: r.left + "px", top: r.top + "px",
      width: r.width + "px", height: r.height + "px",
    });
    (this.hl.firstChild as HTMLElement).textContent =
      target.tagName.toLowerCase() + (target.id ? "#" + target.id : "");
  };

  private onClick = (e: MouseEvent) => {
    if (this.mode !== "inspect") return;
    const target = this.pick(e.clientX, e.clientY);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const r = target.getBoundingClientRect();
    this.targetOffset = {
      x: r.width ? clamp((e.clientX - r.left) / r.width) : 0.5,
      y: r.height ? clamp((e.clientY - r.top) / r.height) : 0.5,
    };
    this.setMode("off");
    this.openComposer({ kind: "element", element: target }, e.clientX, e.clientY);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { this.cancelDrag(); this.setMode("off"); this.closeComposer(); }
  };

  // ---- region ("free-size screenshot") selection ----------------------------

  private onRegionDown = (e: PointerEvent) => {
    if (this.mode !== "region" && this.mode !== "record") return;
    // A mouse must use the primary button; touch/pen always start with button 0.
    if (e.pointerType !== "touch" && e.pointerType !== "pen" && e.button !== 0) return;
    // Ignore drags that start on our own UI (the panel overlays the page).
    const t = e.target as Element | null;
    if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragStart = { x: e.clientX, y: e.clientY };
    document.addEventListener("pointermove", this.onRegionMove, true);
    document.addEventListener("pointerup", this.onRegionUp, true);
    document.addEventListener("pointercancel", this.onRegionCancel, true);
    this.drawSelection(e.clientX, e.clientY);
  };

  private onRegionMove = (e: PointerEvent) => {
    if (!this.dragStart) return;
    e.preventDefault();
    this.drawSelection(e.clientX, e.clientY);
  };

  private onRegionUp = (e: PointerEvent) => {
    if (!this.dragStart) return;
    e.preventDefault();
    e.stopPropagation();
    const start = this.dragStart;
    const wasRecord = this.mode === "record";
    this.cancelDrag();
    const vp: RegionRect = {
      x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y),
    };
    if (vp.w < 8 || vp.h < 8) { this.selbox.style.display = "none"; return; } // stray tap
    this.setMode("off");
    if (wasRecord) void this.finishRecording(vp);
    else this.finishRegion(vp);
  };

  /** The OS took over the gesture (e.g. a system swipe): drop the selection. */
  private onRegionCancel = () => {
    this.cancelDrag();
    this.selbox.style.display = "none";
  };

  private drawSelection(curX: number, curY: number) {
    const s = this.dragStart!;
    Object.assign(this.selbox.style, {
      display: "block",
      left: Math.min(s.x, curX) + "px", top: Math.min(s.y, curY) + "px",
      width: Math.abs(curX - s.x) + "px", height: Math.abs(curY - s.y) + "px",
    });
  }

  private cancelDrag() {
    this.dragStart = null;
    document.removeEventListener("pointermove", this.onRegionMove, true);
    document.removeEventListener("pointerup", this.onRegionUp, true);
    document.removeEventListener("pointercancel", this.onRegionCancel, true);
  }

  /**
   * Anchor a dragged viewport rect to the element under its center so it survives
   * reflow. `rel` (element-relative fractions) is preferred; document coords are the
   * fallback. Shared by both the Region (screenshot) and Record (video) tools.
   */
  private regionFromViewport(vp: RegionRect): { region: RegionRect; element: Element | null } {
    const centerEl = this.pick(vp.x + vp.w / 2, vp.y + vp.h / 2);
    let rel: RegionRect["rel"];
    if (centerEl) {
      const er = centerEl.getBoundingClientRect();
      if (er.width > 0 && er.height > 0) {
        rel = {
          fx: (vp.x - er.left) / er.width, fy: (vp.y - er.top) / er.height,
          fw: vp.w / er.width, fh: vp.h / er.height,
        };
      }
    }
    const region: RegionRect = { x: vp.x + window.scrollX, y: vp.y + window.scrollY, w: vp.w, h: vp.h, rel };
    return { region, element: centerEl };
  }

  /**
   * Touch path for the Region tool: capture what is on screen right now and open the
   * composer with it already attached. The reporter scrolls to the part of the page they
   * mean FIRST, then taps Region — no drag, so nothing fights the page scroll.
   */
  private async captureViewportForComposer() {
    const vp: RegionRect = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
    let shot: string | undefined;
    try {
      shot = await capture(vp);
    } catch {
      shot = undefined;
    }
    const file = shot ? dataUrlToFile(shot, "screenshot.png") : null;
    const docX = window.scrollX + vp.w / 2;
    const docY = window.scrollY + vp.h / 2;
    const docW = Math.max(1, document.documentElement.scrollWidth);
    const docH = Math.max(1, document.documentElement.scrollHeight);
    const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
    this.setMode("off");
    this.openComposer(
      { kind: "free", offset, point: { x: docX, y: docY }, label: "Screenshot · attached" },
      8,
      window.innerHeight / 2,
      file ? [file] : []
    );
  }

  /**
   * Attach a video on a phone, where the page cannot record the screen: the reporter
   * records it with the phone's own screen recorder first, then picks the clip here. No
   * `capture` attribute on purpose — that would force the camera open, and a video of the
   * room is not a screen recording.
   */
  private pickVideo() {
    this.setMode("off");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const docX = window.scrollX + window.innerWidth / 2;
      const docY = window.scrollY + window.innerHeight / 2;
      const docW = Math.max(1, document.documentElement.scrollWidth);
      const docH = Math.max(1, document.documentElement.scrollHeight);
      const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
      this.openComposer(
        { kind: "free", offset, point: { x: docX, y: docY }, label: "Video · attached" },
        8,
        window.innerHeight / 2,
        [file]
      );
    };
    // In the shadow root: keeps the host page's DOM untouched.
    this.shadow.appendChild(input);
    input.click();
  }

  /** Capture the selected viewport rect, then open the composer for a region comment. */
  private async finishRegion(vp: RegionRect) {
    this.selbox.style.display = "none";
    const { region, element } = this.regionFromViewport(vp);
    const target: ComposeTarget = { kind: "region", region, element };
    // Open the composer immediately; capture the screenshot in the background so a
    // slow capture never blocks the UI. It attaches to the comment on submit.
    this.openComposer(target, vp.x + vp.w, vp.y);
    const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
    this.pendingShot = capture(vp);
    void this.pendingShot.then((shot) => {
      if (shot && this.pending === target) target.screenshot = shot;
    }).catch(() => undefined);
  }

  /**
   * Record a screen video of the selected rect (same drag-select as Region), then
   * open the composer with the recording attached. Unlike the screenshot flow this
   * is interactive — the browser share prompt and a Stop button drive it — so the
   * composer opens only once recording has finished.
   */
  private async finishRecording(vp: RegionRect) {
    this.selbox.style.display = "none";
    const { region, element } = this.regionFromViewport(vp);
    const capture = this.cfg.captureRecording ?? captureRegionRecording;
    this.showRecBar();
    let recording: string | undefined;
    try {
      // Call the capture synchronously (getDisplayMedia needs the click gesture).
      recording = await capture(vp, {
        maxMs: RECORD_MAX_MS,
        register: (stop) => { this.stopRecording = stop; },
      });
    } catch {
      recording = undefined;
    }
    this.hideRecBar();
    if (!recording) return; // user cancelled the share prompt or capture failed
    const target: ComposeTarget = { kind: "region", region, element, recording };
    const x = Math.min(vp.x + vp.w, window.innerWidth - 320);
    this.openComposer(target, x, vp.y);
  }

  private showRecBar() {
    this.stopRecording = undefined;
    this.recBar.innerHTML = `<span class="recdot"></span><span>Recording… <b>Stop</b></span>`;
    this.recBar.classList.add("show");
  }
  private hideRecBar() {
    this.recBar.classList.remove("show");
    this.stopRecording = undefined;
  }

  /** elementFromPoint, ignoring our own UI. */
  private pick(x: number, y: number): Element | null {
    const hitHl = this.hl.style.display;
    this.hl.style.display = "none"; // never let the highlight itself be the hit
    const elAt = document.elementFromPoint(x, y);
    this.hl.style.display = hitHl;
    if (!elAt) return null;
    if (elAt.id === "loupe-root" || (elAt as Element).closest?.("#loupe-root")) return null;
    return elAt;
  }

  private setMode(mode: Mode) {
    // Tools live on the Comments page — entering a mode implies the panel is open there.
    if (mode !== "off") {
      if (!this.open) this.open = true;
      if (this.tab !== "comments") { this.tab = "comments"; this.saveState(); }
      this.applyDockLayout();
    }
    this.mode = mode;
    this.hl.style.display = "none";
    this.selbox.style.display = "none";
    this.cancelDrag();
    document.body.style.cursor = mode === "off" ? "" : "crosshair";
    (this.dock.querySelector('[data-role="inspect"]') as HTMLElement)?.classList.toggle("on", mode === "inspect");
    (this.dock.querySelector('[data-role="free"]') as HTMLElement)?.classList.toggle("on", mode === "free");
    (this.dock.querySelector('[data-role="region"]') as HTMLElement)?.classList.toggle("on", mode === "region");
    (this.dock.querySelector('[data-role="record"]') as HTMLElement)?.classList.toggle("on", mode === "record");
    // On mobile this shrinks the bottom sheet to just header + tools (see styles)
    // so most of the page stays visible while picking an element/region.
    this.dock.classList.toggle("inspecting", mode !== "off");

    document.removeEventListener("pointermove", this.onMove, true);
    document.removeEventListener("pointerdown", this.onMove, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("click", this.onFreeClick, true);
    document.removeEventListener("pointerdown", this.onRegionDown, true);

    if (mode === "off") return;
    document.addEventListener("keydown", this.onKey, true);
    this.closeComposer();
    if (mode === "inspect") {
      document.addEventListener("pointermove", this.onMove, true);
      // Touch has no hover: highlight on finger-down so the user can see what a tap
      // will select before lifting (the tap itself still arrives as a click).
      document.addEventListener("pointerdown", this.onMove, true);
      document.addEventListener("click", this.onClick, true);
    } else if (mode === "free") {
      document.addEventListener("click", this.onFreeClick, true);
    } else if (mode === "region" && isTouchDevice()) {
      // No drag-select on touch — a finger covers the area it is drawing, and the drag
      // fights the page scroll. Grab the visible viewport instead (the reporter scrolls
      // to what they mean first, then taps Region) and hand it to the composer.
      void this.captureViewportForComposer();
    } else if (mode === "record" && isTouchDevice()) {
      // Same one-tap idea for video: nothing to drag with a finger, so record the whole
      // screen. Called synchronously from the tap — getDisplayMedia needs that gesture.
      const vp: RegionRect = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      this.setMode("off");
      void this.finishRecording(vp);
    } else if (mode === "region" || mode === "record") {
      document.addEventListener("pointerdown", this.onRegionDown, true);
    }
  }

  // ---- free note (drop a comment anywhere, no element / no screenshot) -------

  private onFreeClick = (e: MouseEvent) => {
    if (this.mode !== "free") return;
    const t = e.target as Element | null;
    if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return; // ignore our own UI
    e.preventDefault();
    e.stopPropagation();
    const docX = e.clientX + window.scrollX;
    const docY = e.clientY + window.scrollY;
    const docW = Math.max(1, document.documentElement.scrollWidth);
    const docH = Math.max(1, document.documentElement.scrollHeight);
    // Store the drop point as a fraction of the document so it survives reloads
    // and reasonable reflow without needing any element anchor.
    const offset = { x: clamp(docX / docW), y: clamp(docY / docH) };
    this.setMode("off");
    this.openComposer({ kind: "free", offset, point: { x: docX, y: docY } }, e.clientX, e.clientY);
  };

  // ---- composer -------------------------------------------------------------

  private openComposer(target: ComposeTarget, x: number, y: number, seedFiles: File[] = []) {
    this.pending = target;
    const isRecording = target.kind === "region" && !!target.recording;
    const c = this.composer;
    c.innerHTML = "";
    const label = el("div", "target",
      target.kind === "element" ? describe(target.element)
        : target.kind === "region"
          ? (isRecording
              ? `⏺ Recording · ${Math.round(target.region.w)}×${Math.round(target.region.h)} px`
              : `Region · ${Math.round(target.region.w)}×${Math.round(target.region.h)} px`)
          : target.label ?? "Free note · anywhere on the page");
    const title = el("input", "title") as HTMLInputElement;
    title.type = "text";
    title.placeholder = "Title — one line: what's wrong, or what you need";

    const ta = el("textarea") as HTMLTextAreaElement;
    ta.placeholder = isRecording ? "Describe the issue in this recording…"
      : target.kind === "region" ? "Describe the issue in this area…"
        : target.kind === "free" ? "Describe this note…"
          : "Describe what should change here…";

    // Attachments: images and/or videos, several of each. A touch screenshot capture is
    // seeded here so it needs no extra tap to attach.
    const files: File[] = seedFiles.slice();
    const attach = el("div", "attach");
    const pick = el("button", "pick", "＋ Attach images / videos") as HTMLButtonElement;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.style.display = "none";
    const chips = el("div", "chips");
    const err = el("div", "err");
    const drawChips = () => {
      chips.innerHTML = "";
      files.forEach((f, idx) => {
        const chip = el("span", "chip", `${attachmentKind(f.type) === "video" ? "🎬" : "🖼"} ${f.name}`);
        const x = el("button", "x", "×") as HTMLButtonElement;
        x.onclick = () => { files.splice(idx, 1); drawChips(); };
        chip.appendChild(x);
        chips.appendChild(chip);
      });
    };
    input.onchange = () => {
      err.textContent = "";
      for (const f of Array.from(input.files ?? [])) {
        if (files.length >= MAX_FILES) { err.textContent = `Up to ${MAX_FILES} files.`; break; }
        const cap = attachmentKind(f.type) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (f.size > cap) { err.textContent = `${f.name} is too large.`; continue; }
        files.push(f);
      }
      input.value = "";
      drawChips();
    };
    pick.onclick = () => input.click();
    attach.append(pick, input, chips, err);
    if (files.length) drawChips();

    const row = el("div", "row");
    // Triage metadata. Both default sensibly so a reporter can ignore them and
    // still file something the team can find and rank.
    const meta = el("div", "meta2");
    const prioSel = document.createElement("select");
    prioSel.className = "mini";
    prioSel.title = "Priority";
    prioSel.setAttribute("aria-label", "Priority");
    for (const p of COMMENT_PRIORITIES) {
      prioSel.append(optionEl(PRIORITY_LABELS[p], p, p === DEFAULT_PRIORITY));
    }
    const typeSel = document.createElement("select");
    typeSel.className = "mini";
    typeSel.title = "Change type";
    typeSel.setAttribute("aria-label", "Change type");
    for (const t of CHANGE_TYPES) {
      typeSel.append(optionEl(CHANGE_TYPE_LABELS[t], t, t === DEFAULT_CHANGE_TYPE));
    }
    meta.append(prioSel, typeSel);
    // Free notes carry nothing; recordings always attach the video — both skip the checkbox.
    let box: HTMLInputElement | null = null;
    if (target.kind !== "free" && !isRecording) {
      const chk = el("label", "chk") as HTMLLabelElement;
      box = document.createElement("input"); box.type = "checkbox";
      // Default to attaching. Element shots are captured on submit; region shots are
      // captured in the background and awaited on submit (see pendingShot).
      box.checked = true;
      chk.append(box, document.createTextNode("Attach screenshot"));
      row.append(chk);
    } else {
      row.style.justifyContent = "flex-end";
    }
    const btns = el("div", "btns");
    const cancel = el("button", "ghost", "Cancel") as HTMLButtonElement;
    cancel.onclick = () => this.closeComposer();
    const save = el("button", "primary", "Comment") as HTMLButtonElement;
    save.disabled = true;
    const sync = () => { save.disabled = !title.value.trim() || !ta.value.trim(); };
    title.oninput = sync;
    ta.oninput = sync;
    sync();
    save.onclick = () => this.submit(
      target, title.value.trim(), ta.value.trim(), box ? box.checked : false, files.slice(),
      prioSel.value as CommentPriority, typeSel.value as ChangeType,
    );
    btns.append(cancel, save);
    row.append(btns);
    c.append(label, title, ta, attach, meta, row);

    // Position near the click, clamped to the viewport.
    const w = 320, h = 380;
    const left = Math.min(Math.max(8, x + 12), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, y + 12), window.innerHeight - h - 8);
    Object.assign(c.style, { display: "block", left: left + "px", top: top + "px" });
    // Do not grab focus on touch: it throws the on-screen keyboard up over the very page
    // the reporter is describing (and over our own form).
    if (!isTouchDevice()) ta.focus();
  }

  private closeComposer() {
    this.composer.style.display = "none";
    this.pending = null;
    this.pendingShot = undefined;
  }

  private async submit(
    target: ComposeTarget,
    title: string,
    body: string,
    withShot: boolean,
    files: File[],
    priority: CommentPriority = DEFAULT_PRIORITY,
    changeType: ChangeType = DEFAULT_CHANGE_TYPE,
  ) {
    if (!title || !body) return;
    const saveBtn = this.composer.querySelector(".primary") as HTMLButtonElement;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

    let anchor: Anchor, context: Comment["context"], offset: Comment["offset"];
    let screenshot: string | undefined;
    let recording: string | undefined;
    let region: RegionRect | undefined;
    let anchoredEl: Element | null = null;

    if (target.kind === "element") {
      const capture = this.cfg.captureScreenshot ?? captureScreenshot;
      screenshot = withShot ? await capture(target.element) : undefined;
      anchor = captureAnchor(target.element);
      context = captureElementContext(target.element);
      offset = this.targetOffset;
      anchoredEl = target.element;
    } else if (target.kind === "free") {
      // A page-level note: no element, no screenshot. Its position lives in
      // `offset` as a fraction of the document (see onFreeClick + position()).
      screenshot = undefined;
      anchor = pageAnchor(target.point);
      context = { html: "", styles: {} };
      offset = target.offset;
    } else {
      // A recording carries its own visuals; a plain region uses the background
      // screenshot (awaited only if it hasn't attached yet).
      recording = target.recording;
      screenshot = !recording && withShot ? (target.screenshot ?? await this.pendingShot) : undefined;
      region = target.region;
      offset = { x: 0, y: 0 };
      // Prefer the real center-element anchor (survives reflow + gives Claude a
      // real element); fall back to a synthetic region anchor when there's none.
      if (target.element) {
        anchor = captureAnchor(target.element);
        context = captureElementContext(target.element);
        anchoredEl = target.element;
      } else {
        anchor = regionAnchor(region);
        context = { html: regionNote(region), styles: {} };
      }
    }

    const comment: Comment = {
      id: uid(),
      projectKey: this.cfg.projectKey,
      url: this.url,
      author: this.cfg.user,
      title,
      body,
      status: "queue",
      priority,
      changeType,
      // Branch-aware threads: the host declares these once in `init()`, and the
      // panel's project manager can override the repo per browser.
      repo: this.effectiveRepo(),
      branch: this.cfg.branch,
      kind: target.kind,
      anchor,
      context,
      offset,
      region,
      screenshot,
      recording,
      attachments: await this.uploadAttachments(files),
      // The screen this was captured on, plus enough to tell a stale bundle from a real
      // bug when someone reports "it still doesn't work" (see Comment.viewport).
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        v: SDK_VERSION,
        touch: isTouchDevice(),
        coarse: coarsePointer(),
        gdm: canShareScreen(),
      },
      createdAt: new Date().toISOString(),
    };
    await this.store.save(comment);
    this.comments.push(comment);
    this.resolved.set(comment.id, anchoredEl);
    this.closeComposer();
    this.renderPins();
    this.renderList();
    this.flash(comment.id);
    // Loupe's own work joins the same feed an agent bridge writes to.
    this.addActivity({
      kind: "comment.create",
      label: `Created “${comment.title || comment.body.split("\n")[0] || "comment"}”`,
      detail: [normalizePriority(comment.priority), comment.kind ?? "element", comment.repo].filter(Boolean).join(" · "),
      files: comment.repo ? [`${comment.repo}/${shortPath(comment.url)}`] : [],
    });
  }

  /** Upload the reporter's picked files. A file that fails is skipped, not fatal. */
  private async uploadAttachments(files: File[]): Promise<Attachment[] | undefined> {
    if (!files.length) return undefined;
    const out: Attachment[] = [];
    for (const f of files) {
      try {
        out.push(await this.store.upload(this.cfg.projectKey, f));
      } catch (e) {
        console.warn("[loupe] attachment upload failed", f.name, e);
      }
    }
    return out.length ? out : undefined;
  }

  // ---- pins + re-anchoring --------------------------------------------------

  private renderPins() {
    // Remove pins for deleted comments.
    for (const [id, pin] of this.pins) {
      if (!this.comments.find((c) => c.id === id)) { pin.remove(); this.pins.delete(id); }
    }
    this.comments.forEach((c, i) => {
      let pin = this.pins.get(c.id);
      if (!pin) {
        pin = el("button", "pin") as HTMLButtonElement;
        pin.onclick = () => { this.openDock(); this.flash(c.id); };
        this.overlay.appendChild(pin);
        this.pins.set(c.id, pin);
      }
      pin.textContent = String(i + 1);
      pin.classList.toggle("done", isResolved(c));
      pin.classList.toggle("free", c.kind === "free");
    });
    this.updateCount();
    this.position();
  }

  private updateCount(shown = this.comments.length) {
    this.countEl.textContent = String(shown);
    const n = this.comments.length;
    this.fabBadge.textContent = n ? String(n) : "";
  }

  /** Reposition every pin, re-resolving anchors whose element has gone. */
  private position = () => {
    for (const c of this.comments) {
      const pin = this.pins.get(c.id);
      if (!pin) continue;

      if (c.kind === "free") {
        // Page-level note: position from the stored document-fraction offset.
        const docW = Math.max(1, document.documentElement.scrollWidth);
        const docH = Math.max(1, document.documentElement.scrollHeight);
        const px = c.offset.x * docW - window.scrollX;
        const py = c.offset.y * docH - window.scrollY;
        const onScreen = px > -24 && px < window.innerWidth + 24 && py > -24 && py < window.innerHeight + 24;
        Object.assign(pin.style, { left: px + "px", top: py + "px", display: onScreen ? "grid" : "none" });
        pin.classList.remove("detached");
        continue;
      }

      let elx = this.resolved.get(c.id) ?? null;
      if (!elx || !elx.isConnected) {
        // A malformed stored anchor (older client, or a row someone hand-wrote)
        // must detach that one pin, not abort the render for every other comment.
        let r: ResolveResult | null = null;
        try { r = resolveAnchor(c.anchor); } catch { r = null; }
        elx = r?.element ?? null;
        this.resolved.set(c.id, elx);
      }

      if (c.kind === "region") {
        // Compute the region's live viewport rect from its anchor element; fall
        // back to stored document coords (older data / no anchor found).
        const box = this.regionRect(c, elx);
        if (box) {
          const onScreen = box.x + box.w > 0 && box.x < window.innerWidth && box.y + box.h > 0 && box.y < window.innerHeight;
          Object.assign(pin.style, { left: box.x + "px", top: box.y + "px", display: onScreen ? "grid" : "none" });
          pin.classList.toggle("detached", !elx && !c.region?.rel);
        } else {
          pin.style.display = "none";
          pin.classList.add("detached");
        }
        continue;
      }

      if (elx) {
        const rect = elx.getBoundingClientRect();
        const px = rect.left + c.offset.x * rect.width;
        const py = rect.top + c.offset.y * rect.height;
        const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
        Object.assign(pin.style, { left: px + "px", top: py + "px", display: onScreen ? "grid" : "none" });
        pin.classList.remove("detached");
      } else {
        pin.style.display = "none";
        pin.classList.add("detached");
      }
    }

    // Keep the highlighted region outline glued to its live rect while scrolling.
    if (this.activeRegionId) {
      const c = this.comments.find((x) => x.id === this.activeRegionId);
      const box = c && this.regionRect(c, this.resolved.get(c.id) ?? null);
      if (box) {
        Object.assign(this.regionBox.style, {
          display: "block", left: box.x + "px", top: box.y + "px", width: box.w + "px", height: box.h + "px",
        });
      }
    }
  };

  /**
   * The current viewport rect for a region comment. Prefers the element-relative
   * fractions (so it tracks reflow across viewports); falls back to the stored
   * document coordinates minus scroll. Returns null if neither is available.
   */
  private regionRect(c: Comment, elx: Element | null): { x: number; y: number; w: number; h: number } | null {
    const rel = c.region?.rel;
    if (elx && rel) {
      const r = elx.getBoundingClientRect();
      return { x: r.left + rel.fx * r.width, y: r.top + rel.fy * r.height, w: rel.fw * r.width, h: rel.fh * r.height };
    }
    if (c.region) {
      return { x: c.region.x - window.scrollX, y: c.region.y - window.scrollY, w: c.region.w, h: c.region.h };
    }
    return null;
  }

  private observe() {
    const reposition = () => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.position);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("resize", this.onWinResize);
    let debounce = 0;
    this.mo = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => { this.position(); this.renderList(); }, 120);
    });
    this.mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    // Safety net for animated / late-loading layouts.
    this.tick = window.setInterval(this.position, 800);
  }

  // ---- dock: open / close / mode / theme ------------------------------------

  private openDock() {
    this.open = true;
    this.fabExpanded = false; // the panel replaces the quick actions
    this.saveState();
    this.applyDockLayout();
    this.renderList();
  }

  private closeDock() {
    this.open = false;
    this.setMode("off");
    this.closeComposer();
    this.saveState();
    this.applyDockLayout();
  }

  private setDock(mode: DockMode) {
    this.dockMode = mode;
    this.open = true;
    this.saveState();
    this.applyDockLayout();
  }

  /** Switch the sidebar page (Home ↔ Comments ↔ Connect Claude). */
  private setTab(tab: Tab) {
    if (this.tab === tab) return;
    // Leaving the Comments page cancels any active picking tool.
    if (tab !== "comments") this.setMode("off");
    this.tab = tab;
    this.hintFor = null; // a fresh view is a fresh chance for its hint card
    this.saveState();
    if (tab === "home") {
      this.renderHome();
      if (this.scope === "all" && !this.allComments.length) void this.loadAllComments();
    }
    if (tab === "comments") this.renderList();
    if (tab === "activity") this.renderActivity();
    this.applyDockLayout();
  }

  private toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.saveState();
    this.applyDockLayout();
  }

  private onWinResize = () => this.applyDockLayout();

  // ---- panel shell: popovers, minimize, accent ------------------------------

  private toggleMenu(menu: HTMLElement) {
    const wasOpen = menu.classList.contains("open");
    this.closeMenus();
    if (!wasOpen) menu.classList.add("open");
  }

  private closeMenus() {
    this.posMenu?.classList.remove("open");
    this.settingsMenu?.classList.remove("open");
  }

  private setAccent(id: string) {
    if (!ACCENT_IDS.includes(id)) return;
    this.accent = id;
    this.saveState();
    this.applyDockLayout();
  }

  private setMinimized(v: boolean) {
    this.minimized = v;
    this.closeMenus();
    this.saveState();
    this.applyDockLayout();
  }

  /** Flip one of the "Show …" settings and repaint whatever it governs. */
  private toggleSetting(key: "markersHidden" | "hoverHints" | "showPaths") {
    if (key === "markersHidden") this.markersHidden = !this.markersHidden;
    else if (key === "hoverHints") this.hoverHints = !this.hoverHints;
    else this.showPaths = !this.showPaths;
    this.saveState();
    if (key === "markersHidden") this.renderPins();
    if (key === "showPaths") { this.renderList(); this.renderHome(); }
    if (key === "hoverHints") this.hintFor = null; // the visible card must go too
    this.applyDockLayout();
  }

  /** Reflect the current state into the settings menu (never rebuild it). */
  private renderSettings() {
    if (!this.settingsMenu) return;
    const on: Record<string, boolean> = {
      hoverHints: this.hoverHints,
      markersHidden: !this.markersHidden,
      showPaths: this.showPaths,
    };
    this.settingsMenu.querySelectorAll<HTMLElement>("[data-set]").forEach((b) => {
      const key = b.dataset.set!;
      if (key in on) b.setAttribute("aria-pressed", String(on[key]));
    });
    this.settingsMenu.querySelectorAll<HTMLElement>("[data-accent]").forEach((b) =>
      b.classList.toggle("on", b.dataset.accent === this.accent));
  }

  /**
   * The contextual hint card for the active view. Shown at most once per view and
   * never again after that — dismissed, or switched off wholesale with "Turn off
   * hints" (the same switch as Settings → Hover hints).
   */
  private renderHints() {
    if (!this.homeEl) return;
    if (this.hintFor === this.tab) return;
    this.hintFor = this.tab;
    const slots: Record<string, HTMLElement | null> = {
      home: this.homeEl.querySelector("#loupe-hhint"),
      comments: this.commentsHint ?? null,
      activity: this.activityHint ?? null,
    };
    for (const [id, slot] of this.customHintSlots) slots[id] = slot;
    const slot = slots[this.tab];
    if (!slot) return;
    slot.innerHTML = "";
    const hint = this.hintForTab(this.tab);
    if (!hint || !this.hoverHints || this.minimized || this.hintsSeen.has(this.tab)) return;

    // Mark it seen the moment it is painted, so a reload does not replay it.
    this.hintsSeen.add(this.tab);
    this.saveState();
    slot.innerHTML =
      `<div class="hint"><div class="hint-t">${escapeHtml(hint.title)}</div>` +
      `<div class="hint-b">${escapeHtml(hint.body)}</div>` +
      `<button class="hint-off" data-role="hint-off">Turn off hints</button>` +
      `<button class="hint-x" aria-label="Dismiss hint">✕</button></div>`;
    (slot.querySelector('[data-role="hint-off"]') as HTMLElement).onclick = () => {
      this.hoverHints = false;
      // Force the next paint to re-evaluate this view, otherwise the early-return
      // above would leave the card it was clicked from on screen.
      this.hintFor = null;
      this.saveState();
      this.applyDockLayout();
    };
    (slot.querySelector(".hint-x") as HTMLElement).onclick = () => { slot.innerHTML = ""; };
  }

  /** Which view's hint has been handled this session (so it is not re-painted). */
  private hintFor: Tab | null = null;

  /** The built-in hints, plus any a registered tab declared for itself. */
  private hintForTab(id: string): { title: string; body: string } | undefined {
    if (id in HINTS) return HINTS[id as BuiltinTab];
    return (this.cfg.tabs ?? []).find((t) => t.id === id)?.hint;
  }

  // ---- guided tour ----------------------------------------------------------

  private startTour() {
    this.tourStep = 0;
    this.open = true;
    this.minimized = false;
    this.applyDockLayout();
    this.renderTour();
  }

  private stopTour() {
    this.tourStep = -1;
    this.tourDone = true;
    this.saveState();
    this.tourEl.classList.remove("open");
    this.applyDockLayout();
  }

  private gotoTour(step: number) {
    if (step < 0) { this.stopTour(); return; }
    this.tourStep = step;
    this.renderTour();
  }

  /** Position the spotlight over the current step's target and lay out the card. */
  private renderTour() {
    if (this.tourStep < 0 || this.tourStep >= TOUR.length) {
      this.tourEl.classList.remove("open");
      return;
    }
    const step = TOUR[this.tourStep]!;
    if (this.tab !== step.tab) this.setTab(step.tab);
    this.tourEl.classList.add("open");

    const pad = 4;
    const target = this.shadow.querySelector(step.sel) as HTMLElement | null;
    const box = target?.getBoundingClientRect();
    const r = box && box.width
      ? { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
      // No on-screen target (panel closed, or the view is hidden) — centre the card.
      : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    this.tourSpot.style.left = `${r.left}px`;
    this.tourSpot.style.top = `${r.top}px`;
    this.tourSpot.style.width = `${r.width}px`;
    this.tourSpot.style.height = `${r.height}px`;

    const last = this.tourStep === TOUR.length - 1;
    this.tourCard.innerHTML =
      `<div class="tour-title">${escapeHtml(step.title)}</div>` +
      `<div class="tour-body">${escapeHtml(step.body)}</div>` +
      `<div class="tour-foot">` +
      `<span class="tour-dots">${TOUR.map((_, i) => `<i class="${i === this.tourStep ? "on" : ""}"></i>`).join("")}</span>` +
      (this.tourStep > 0 ? `<button class="t-back">Back</button>` : "") +
      `<button class="t-skip">Skip</button>` +
      `<button class="t-next">${last ? "Done" : "Next"}</button>` +
      `</div>`;

    // Place the card below the spotlight, else above, else beside it — rejecting any
    // spot that would land on the very thing it points at, and clamping the rest
    // into the viewport. (Clamping alone used to push the card back onto the target.)
    const W = 252;
    const H = this.tourCard.offsetHeight || 130;
    const overlapsTarget = (x: number, y: number) =>
      x < r.left + r.width + 8 && x + W > r.left - 8 && y < r.top + r.height + 8 && y + H > r.top - 8;
    const candidates: [number, number][] = [
      [r.left + r.width / 2 - W / 2, r.top + r.height + 12],  // below
      [r.left + r.width / 2 - W / 2, r.top - H - 12],        // above
      [r.left - W - 12, r.top + r.height / 2 - H / 2],       // beside (left)
      [r.left + r.width + 12, r.top + r.height / 2 - H / 2], // beside (right)
    ];
    let cx = clampPx(candidates[0]![0], 8, Math.max(8, window.innerWidth - W - 8));
    let cy = clampPx(candidates[0]![1], 8, Math.max(8, window.innerHeight - H - 8));
    for (const [x, y] of candidates) {
      const px = clampPx(x, 8, Math.max(8, window.innerWidth - W - 8));
      const py = clampPx(y, 8, Math.max(8, window.innerHeight - H - 8));
      cx = px; cy = py;
      if (!overlapsTarget(px, py)) break;
    }
    this.tourCard.style.left = `${cx}px`;
    this.tourCard.style.top = `${cy}px`;

    (this.tourCard.querySelector(".t-back") as HTMLElement | null)?.addEventListener("click", () => this.gotoTour(this.tourStep - 1));
    (this.tourCard.querySelector(".t-skip") as HTMLElement)!.addEventListener("click", () => this.stopTour());
    (this.tourCard.querySelector(".t-next") as HTMLElement)!.addEventListener("click", () => {
      if (last) this.stopTour(); else this.gotoTour(this.tourStep + 1);
    });
  }

  /** Narrow viewports render the panel as a bottom sheet, not a side/float dock. */
  private isMobile() { return window.innerWidth <= 640; }

  private loadState() {
    try {
      const s = localStorage.getItem("loupe:dock");
      if (!s) return;
      const p = JSON.parse(s);
      if (DOCK_MODES.includes(p?.mode)) this.dockMode = p.mode;
      if (typeof p?.open === "boolean") this.open = p.open;
      if (p?.theme === "light" || p?.theme === "dark") this.theme = p.theme;
      const known = [...BUILTIN_TABS.map((t) => t.id), ...(this.cfg.tabs ?? []).map((t) => t.id)];
      if (typeof p?.tab === "string" && known.includes(p.tab)) this.tab = p.tab;
      if (p?.scope === "page" || p?.scope === "all") this.scope = p.scope;
      if (typeof p?.statFilter === "string") this.statFilter = p.statFilter as StatFilter;
      if (typeof p?.repoFilter === "string") this.repoFilter = p.repoFilter;
      if (p?.float && typeof p.float.w === "number") this.floatRect = { ...this.floatRect, ...p.float };
      if (typeof p?.markersHidden === "boolean") this.markersHidden = p.markersHidden;
      if (p?.accent && ACCENT_IDS.includes(p.accent)) this.accent = p.accent;
      if (typeof p?.minimized === "boolean") this.minimized = p.minimized;
      if (typeof p?.hoverHints === "boolean") this.hoverHints = p.hoverHints;
      if (typeof p?.showPaths === "boolean") this.showPaths = p.showPaths;
      if (typeof p?.tourDone === "boolean") this.tourDone = p.tourDone;
      if (Array.isArray(p?.hintsSeen)) this.hintsSeen = new Set(p.hintsSeen.filter((x: unknown) => typeof x === "string"));
    } catch { /* storage unavailable → defaults */ }
  }

  private saveState() {
    try {
      localStorage.setItem("loupe:dock", JSON.stringify({
        mode: this.dockMode, open: this.open, theme: this.theme, tab: this.tab, float: this.floatRect,
        markersHidden: this.markersHidden,
        scope: this.scope, statFilter: this.statFilter, repoFilter: this.repoFilter,
        accent: this.accent, minimized: this.minimized, hoverHints: this.hoverHints,
        showPaths: this.showPaths, tourDone: this.tourDone, hintsSeen: [...this.hintsSeen],
      }));
    } catch { /* ignore */ }
  }

  /** Reflect all control-panel state (theme, dock mode, geometry, launcher) into the DOM. */
  private applyDockLayout() {
    this.root.classList.toggle("theme-light", this.theme === "light");
    this.themeBtn.title = this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    this.themeBtn.innerHTML = this.theme === "dark" ? I_SUN : I_MOON;

    // The accent is an inline custom property on the host, so it beats both token
    // blocks and follows the theme.
    const accent = ACCENTS.find((a) => a.id === this.accent) ?? ACCENTS[0]!;
    this.root.style.setProperty("--accent", this.theme === "light" ? accent.light : accent.dark);
    this.root.style.setProperty("--accent-soft", accent.soft);

    const d = this.dock;
    d.classList.toggle("open", this.open);
    for (const m of DOCK_MODES) d.classList.toggle("mode-" + m, this.dockMode === m);
    d.classList.toggle("minimized", this.minimized);
    // The minimize bar keeps the panel's context — and a way back — on one line.
    const openCount = this.comments.filter((c) => !isResolved(c)).length;
    this.minBar.innerHTML =
      `<span class="logo">◎</span>` +
      `<span class="mtext"><b>${openCount}</b> open ${this.scope === "all" ? "in this project" : "on this page"}</span>` +
      `<span class="mrestore" aria-hidden="true">▸</span>`;
    for (const t of this.tabList) d.classList.toggle(`tab-${t.id}`, this.tab === t.id);
    for (const [id, view] of this.viewEls) view.classList.toggle("on", id === this.tab);
    this.renderHome();
    d.querySelectorAll<HTMLElement>(".tabs .tab").forEach((b) =>
      b.classList.toggle("on", b.dataset.tab === this.tab));
    this.posMenu.querySelectorAll<HTMLElement>("[data-pos]").forEach((b) =>
      b.classList.toggle("on", b.dataset.pos === this.dockMode));
    this.renderSettings();
    this.renderHints();

    if (this.dockMode === "float") {
      const vw = window.innerWidth, vh = window.innerHeight;
      let { x, y, w, h } = this.floatRect;
      w = clampPx(w, 280, Math.min(760, vw - 24));
      h = clampPx(h, 220, vh - 24);
      if (x <= 0 && y <= 0) { x = Math.max(12, vw - w - 24); y = 64; } // first placement
      x = clampPx(x, 8, Math.max(8, vw - w - 8));
      y = clampPx(y, 8, Math.max(8, vh - h - 8));
      this.floatRect = { x, y, w, h };
      Object.assign(d.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px", right: "auto", bottom: "auto" });
    } else {
      for (const p of ["left", "top", "right", "bottom", "width", "height"] as const) d.style[p] = "";
    }

    d.querySelectorAll<HTMLElement>(".dctl [data-dock]").forEach((b) =>
      b.classList.toggle("on", b.dataset.dock === this.dockMode));

    // FAB cluster: visible only while the panel is closed and always on the same
    // side as the dock edge, so reopening it feels like the panel sliding back in.
    this.fabCluster.classList.toggle("show", !this.open);
    const leftSide = this.dockMode === "left";
    this.fabCluster.style.left = leftSide ? "20px" : "auto";
    this.fabCluster.style.right = leftSide ? "auto" : "20px";
    this.applyFab();

    this.pushPage();
  }

  /**
   * Push the host page over so the docked panel never covers content (like real
   * DevTools). We shrink the <html> box with a margin on the docked edge — the
   * panel is `position: fixed` (relative to the viewport), so it sits in the
   * gutter the margin frees up. Float mode and the closed state reserve nothing.
   * Only inline styles are touched, so clearing them restores the host exactly.
   */
  private pushPage() {
    const de = document.documentElement;
    de.style.marginLeft = de.style.marginRight = de.style.marginBottom = "";
    // On mobile the panel is a bottom-sheet overlay (see styles) — reserving page
    // space would squeeze content to a sliver, so we never push there.
    if (!this.open || this.dockMode === "float" || this.isMobile()) return;
    const r = this.dock.getBoundingClientRect();
    if (this.dockMode === "left") de.style.marginLeft = r.width + "px";
    else if (this.dockMode === "right") de.style.marginRight = r.width + "px";
    else if (this.dockMode === "bottom") de.style.marginBottom = r.height + "px";
  }

  // ---- float-mode drag + resize ---------------------------------------------

  private onHeadPointerDown = (e: PointerEvent) => {
    if (this.dockMode !== "float" || e.button !== 0 || this.isMobile()) return;
    if ((e.target as HTMLElement)?.closest(".dctl")) return; // let control buttons work
    this.floatDrag = { px: e.clientX, py: e.clientY, ox: this.floatRect.x, oy: this.floatRect.y };
    this.dock.classList.add("dragging");
    window.addEventListener("pointermove", this.onHeadPointerMove);
    window.addEventListener("pointerup", this.onHeadPointerUp);
  };
  private onHeadPointerMove = (e: PointerEvent) => {
    if (!this.floatDrag) return;
    e.preventDefault();
    this.floatRect.x = this.floatDrag.ox + (e.clientX - this.floatDrag.px);
    this.floatRect.y = this.floatDrag.oy + (e.clientY - this.floatDrag.py);
    this.applyDockLayout();
  };
  private onHeadPointerUp = () => {
    if (!this.floatDrag) return;
    this.floatDrag = null;
    this.dock.classList.remove("dragging");
    window.removeEventListener("pointermove", this.onHeadPointerMove);
    window.removeEventListener("pointerup", this.onHeadPointerUp);
    this.saveState();
  };

  private onResizeDown = (e: PointerEvent) => {
    if (this.dockMode !== "float") return;
    e.preventDefault(); e.stopPropagation();
    this.floatResize = { px: e.clientX, py: e.clientY, ow: this.floatRect.w, oh: this.floatRect.h };
    window.addEventListener("pointermove", this.onResizeMove);
    window.addEventListener("pointerup", this.onResizeUp);
  };
  private onResizeMove = (e: PointerEvent) => {
    if (!this.floatResize) return;
    e.preventDefault();
    this.floatRect.w = this.floatResize.ow + (e.clientX - this.floatResize.px);
    this.floatRect.h = this.floatResize.oh + (e.clientY - this.floatResize.py);
    this.applyDockLayout();
  };
  private onResizeUp = () => {
    if (!this.floatResize) return;
    this.floatResize = null;
    window.removeEventListener("pointermove", this.onResizeMove);
    window.removeEventListener("pointerup", this.onResizeUp);
    this.saveState();
  };

  // ---- comment list ---------------------------------------------------------

  private renderList() {
    this.listEl.innerHTML = "";
    const q = this.search.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let items = this.visibleComments.filter((c) => {
      const stage = normalizeStatus(c.status);
      if (this.statFilter === "open" && stage === "resolved") return false;
      if (this.statFilter === "needs_you" && stage !== "in_review") return false;
      if (this.statFilter === "resolved" && stage !== "resolved") return false;
      if (this.statFilter === "stale" && (stage === "resolved" || !(Date.parse(c.createdAt) < weekAgo))) return false;
      if (this.repoFilter && c.repo !== this.repoFilter) return false;
      return !q || `${c.title ?? ""} ${c.body} ${c.author?.name ?? ""}`.toLowerCase().includes(q);
    });

    // The project scope is a timeline — newest first, grouped by day. The page
    // scope keeps file order, which follows the pins down the page.
    if (this.scope === "all") items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    this.renderRepoFilter();
    this.renderReviewBar();

    if (!items.length) {
      this.listEl.appendChild(el("div", "empty",
        this.statFilter
          ? "Nothing in this bucket."
          : q
            ? "No comments match your search."
            : this.scope === "all"
              ? "No feedback in this project yet."
              : "No comments yet. Use Inspect to pick an element, or Note to drop a comment anywhere on the page."));
    }

    let lastDay = "";
    items.forEach((c, i) => {
      if (this.scope === "all") {
        const day = dayLabel(c.createdAt);
        if (day !== lastDay) {
          this.listEl.appendChild(el("div", "daylabel", day));
          lastDay = day;
        }
      }
      this.listEl.appendChild(this.itemView(c, i));
    });
    this.updateCount(items.length);
  }

  /** Repo filter — only offered in the project scope, where it means something. */
  private renderRepoFilter() {
    if (!this.repoSel) return;
    const repos = [...new Set(this.visibleComments.map((c) => c.repo).filter((r): r is string => !!r))].sort();
    this.repoSel.style.display = this.scope === "all" && repos.length > 1 ? "" : "none";
    const current = this.repoFilter;
    this.repoSel.innerHTML = `<option value="">All repos</option>` +
      repos.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    this.repoSel.value = current;
  }

  private itemView(c: Comment, i: number): HTMLElement {
    const detached = this.pins.get(c.id)?.classList.contains("detached") && !isResolved(c);
    const open = this.expanded.has(c.id);
    const item = el("div", "item" + (open ? "" : " collapsed"));
    const top = el("div", "top");
    const num = el("span", "num" + (isResolved(c) ? " done" : detached ? " detached" : ""), String(i + 1));
    // No author identity is shown in the widget list (privacy — see the dashboard for triage).
    top.append(num);
    if (c.recording) top.appendChild(el("span", "rectag", "⏺ recording"));
    const vw = c.viewport?.w;
    if (vw) {
      const kind = vw < 768 ? "mobile" : vw < 1024 ? "tablet" : "desktop";
      const icon = vw < 768 ? "📱" : vw < 1024 ? "▦" : "🖥";
      top.appendChild(el("span", "device", `${icon} ${kind}`));
    }
    if (isResolved(c)) top.appendChild(el("span", "badge done", "resolved"));
    else if (detached) {
      // Short label, full explanation on hover — the long form ate a third of the
      // row on its own and pushed the lifecycle chips past the card edge.
      const b = el("span", "badge detached", "moved");
      b.title = "element moved or removed";
      top.appendChild(b);
    }

    // Where this thread's change has got to: sent to an agent, in a PR, or waiting
    // on a review. A thread with nothing attached stays unbadged.
    const lc = lifecycle(c);
    if (lc) {
      // A resolved thread already wears the "resolved" badge, so a second green pill
      // saying "Reviewed" is noise. Its PR chip and checks meter are still worth
      // showing — that is the part you cannot read off the badge.
      if (lc.stage !== "reviewed") top.appendChild(el("span", `lifechip st-${lc.stage}`, lc.label));
      if (lc.pr) {
        const pr = el(lc.pr.url ? "a" : "span", `prchip${lc.pr.state ? ` st-${lc.pr.state}` : ""}`, `#${lc.pr.number}`);
        pr.title = `Pull request #${lc.pr.number}${lc.pr.state ? ` — ${lc.pr.state}` : ""}`;
        if (lc.pr.url) {
          (pr as HTMLAnchorElement).href = lc.pr.url;
          pr.setAttribute("target", "_blank");
          pr.setAttribute("rel", "noreferrer");
          pr.addEventListener("click", (e) => e.stopPropagation());
        }
        top.appendChild(pr);
      }
      if (lc.checks) {
        const meter = el("span", "checks");
        meter.title = `Checks — ${lc.checks.text} passed`;
        meter.innerHTML =
          `<span class="checks-n">${escapeHtml(lc.checks.text)}</span>` +
          `<span class="checks-bar"><i style="width:${Math.round(lc.checks.ratio * 100)}%"></i></span>`;
        top.appendChild(meter);
      }
    }

    // Page paths only mean something once the list spans more than one page.
    if (this.showPaths && this.scope === "all" && c.url) {
      top.appendChild(el("span", "pathtag", shortPath(c.url)));
    }
    top.appendChild(el("span", "caret", open ? "▾" : "▸"));
    item.appendChild(top);

    // Collapsed, the item is a single summary line; expanding reveals the detail.
    const summary = c.title || (c.body.split("\n")[0] ?? "").slice(0, 140) || "(no description)";
    item.appendChild(el("div", "summary", summary));

    const detail = el("div", "detail");
    // A thread in review leads with its banner: this is the one place a human is
    // being asked to decide something, so it goes above everything else.
    if (c.status === "in_review") detail.appendChild(this.reviewBanner(c));
    // Claude's proposed change, with the original request beside it on demand.
    if (c.proposal) detail.appendChild(this.proposalView(c));
    // With a title, the body is the full description; without one the first line is
    // already the summary, so only multi-line bodies repeat it here.
    if (c.title || c.body.includes("\n")) detail.appendChild(el("div", "body", c.body));
    detail.appendChild(el("div", "meta", describeAnchor(c)));

    if (c.recording) {
      const v = el("video", "shot") as HTMLVideoElement;
      v.src = c.recording;
      v.controls = true;
      v.playsInline = true;
      if (c.screenshot) v.poster = c.screenshot;
      detail.appendChild(v);
    } else if (c.screenshot) {
      const img = el("img", "shot") as HTMLImageElement;
      img.src = c.screenshot;
      detail.appendChild(img);
    }

    // Files the reporter attached (images and videos).
    for (const a of c.attachments ?? []) {
      if (a.kind === "video") {
        const v = el("video", "shot") as HTMLVideoElement;
        v.src = a.url;
        v.controls = true;
        v.playsInline = true;
        detail.appendChild(v);
      } else {
        const img = el("img", "shot") as HTMLImageElement;
        img.src = a.url;
        img.alt = a.name ?? "attachment";
        detail.appendChild(img);
      }
    }

    const actions = el("div", "actions");
    const doneBtn = el("button", "", isResolved(c) ? "Reopen" : "Resolve") as HTMLButtonElement;
    doneBtn.onclick = async (e) => {
      e.stopPropagation();
      const status = isResolved(c) ? "queue" : "resolved";
      c.status = status; await this.store.update(c.id, { status });
      this.renderPins(); this.renderList();
      this.addActivity({
        kind: status === "resolved" ? "comment.resolve" : "comment.reopen",
        label: `${status === "resolved" ? "Resolved" : "Reopened"} “${c.title || c.body.split("\n")[0] || "comment"}”`,
      });
    };
    const del = el("button", "", "Delete") as HTMLButtonElement;
    del.onclick = async (e) => {
      e.stopPropagation();
      await this.store.remove(c.id);
      this.comments = this.comments.filter((x) => x.id !== c.id);
      this.resolved.delete(c.id);
      this.renderPins(); this.renderList();
      this.addActivity({
        kind: "comment.delete",
        label: `Deleted “${c.title || c.body.split("\n")[0] || "comment"}”`,
        level: "warn",
      });
    };
    actions.append(doneBtn, del);
    detail.appendChild(actions);
    item.appendChild(detail);

    item.onclick = () => {
      if (open) this.expanded.delete(c.id);
      else this.expanded.add(c.id);
      this.renderList();
    };
    return item;
  }

  /**
   * The review banner. This is the one place the panel asks a human to decide
   * something, so it sits above everything else in the detail.
   *
   * Approving resolves the thread. That asymmetry is the rule the whole flow rests
   * on: an agent moves work to In Review, only a person closes it.
   */
  private reviewBanner(c: Comment): HTMLElement {
    const label = c.title || c.body.split("\n")[0] || "this thread";
    const banner = el("div", "revbanner");
    banner.innerHTML = `<span class="rev-dot"></span><span class="rev-t">Waiting on your review</span><span class="rev-spacer"></span>`;

    const approve = el("button", "rev-approve", "Approve") as HTMLButtonElement;
    approve.onclick = async (e) => {
      e.stopPropagation();
      approve.disabled = true;
      approve.textContent = "Approving…";
      await this.store.update(c.id, { status: "resolved" });
      c.status = "resolved";
      this.renderPins();
      this.renderList();
      this.renderHome();
      this.addActivity({ kind: "review.approve", label: `Approved “${label}”` });
    };

    const discuss = el("button", "rev-comment", "Add comment") as HTMLButtonElement;
    discuss.onclick = (e) => {
      e.stopPropagation();
      // Comment on the same element when it is still on the page; otherwise drop a
      // page-level note rather than refusing the action.
      const target = this.resolved.get(c.id);
      if (target && target.isConnected) {
        const r = target.getBoundingClientRect();
        this.openComposer({ kind: "element", element: target }, r.left + r.width / 2, r.top + r.height);
      } else {
        this.setMode("free");
      }
    };

    banner.append(approve, discuss);

    // The origin toggle only means something once there is a change to compare to.
    if (c.proposal) {
      const origin = el("button", "rev-origin", "Show original") as HTMLButtonElement;
      origin.onclick = (e) => {
        e.stopPropagation();
        const view = banner.parentElement?.querySelector(".origin") as HTMLElement | null;
        if (!view) return;
        const shown = view.classList.toggle("show");
        view.style.display = shown ? "" : "none";
        origin.textContent = shown ? "Hide original" : "Show original";
      };
      banner.appendChild(origin);
    }
    return banner;
  }

  /**
   * The original request beside Claude's proposed change. Hidden until the review
   * banner's toggle asks for it — a reviewer who does not care should not pay for
   * the markup.
   */
  private proposalView(c: Comment): HTMLElement {
    const p = c.proposal!;
    const wrap = el("div", "origin");
    wrap.style.display = "none";
    wrap.innerHTML =
      `<div class="or-col"><div class="or-h">Original request</div>` +
      `<div class="or-b">${escapeHtml(c.title ? `${c.title}\n\n${c.body}` : c.body)}</div>` +
      (c.context?.html ? `<pre class="or-code">${escapeHtml(c.context.html)}</pre>` : "") +
      `</div>` +
      `<div class="or-col"><div class="or-h">Proposed change${p.author ? ` · ${escapeHtml(p.author)}` : ""}</div>` +
      (p.notes ? `<div class="or-b">${escapeHtml(p.notes)}</div>` : "") +
      (p.html ? `<pre class="or-code">${escapeHtml(p.html)}</pre>` : "") +
      (p.css ? `<pre class="or-code">${escapeHtml(p.css)}</pre>` : "") +
      `</div>`;
    return wrap;
  }

  /** The strips above the list: how many threads are waiting on a human. */
  private renderReviewBar() {
    if (!this.reviewBar) return;
    const waiting = awaitingReview(this.visibleComments);
    if (!waiting.length) {
      this.reviewBar.innerHTML = "";
      this.reviewBar.style.display = "none";
      return;
    }
    const on = this.statFilter === "needs_you";
    this.reviewBar.style.display = "";
    this.reviewBar.innerHTML =
      `<span class="rb-dot"></span>` +
      `<span class="rb-t"><b>${waiting.length}</b> waiting on your review</span>` +
      `<button class="rb-b" data-role="rb-toggle">${on ? "Show all" : "Review"}</button>`;
    (this.reviewBar.querySelector('[data-role="rb-toggle"]') as HTMLElement).onclick = () => {
      this.statFilter = on ? "" : "needs_you";
      this.renderList();
      this.renderHome();
    };
  }

  private flash(id: string) {
    const c = this.comments.find((x) => x.id === id);
    const pin = this.pins.get(id);

    if (c?.kind === "free") {
      for (const p of this.pins.values()) p.classList.remove("active");
      pin?.classList.add("active");
      const docW = Math.max(1, document.documentElement.scrollWidth);
      const docH = Math.max(1, document.documentElement.scrollHeight);
      window.scrollTo({
        top: Math.max(0, c.offset.y * docH - window.innerHeight / 2),
        left: Math.max(0, c.offset.x * docW - window.innerWidth / 2),
        behavior: "smooth",
      });
      this.position();
      return;
    }

    if (c?.kind === "region" && c.region) {
      for (const p of this.pins.values()) p.classList.remove("active");
      pin?.classList.add("active");
      // Show the outline, keep it tracking scroll, then fade it out.
      this.activeRegionId = id;
      window.clearTimeout(this.regionTimer);
      this.regionTimer = window.setTimeout(() => {
        this.activeRegionId = null;
        this.regionBox.style.display = "none";
      }, 2400);
      // Scroll to the anchor element when we have it (correct across reflow),
      // otherwise to the stored document position.
      const elx = this.resolved.get(id);
      if (elx) elx.scrollIntoView({ behavior: "smooth", block: "center" });
      else window.scrollTo({ top: Math.max(0, c.region.y - 120), left: Math.max(0, c.region.x - 120), behavior: "smooth" });
      this.position();
      return;
    }

    if (!pin || pin.classList.contains("detached")) return;
    for (const p of this.pins.values()) p.classList.remove("active");
    pin.classList.add("active");
    const elx = this.resolved.get(id);
    if (elx) elx.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  destroy() {
    this.stopRecording?.();
    this.setMode("off");
    this.mo?.disconnect();
    if (this.tick) clearInterval(this.tick);
    window.clearTimeout(this.regionTimer);
    window.removeEventListener("resize", this.onWinResize);
    window.removeEventListener("pointermove", this.onHeadPointerMove);
    window.removeEventListener("pointerup", this.onHeadPointerUp);
    window.removeEventListener("pointermove", this.onResizeMove);
    window.removeEventListener("pointerup", this.onResizeUp);
    document.removeEventListener("keydown", this.onKey, true);
    // Release the page-push margins we set for docked modes.
    const de = document.documentElement;
    de.style.marginLeft = de.style.marginRight = de.style.marginBottom = "";
    this.root?.remove();
  }
}

// ---- tiny DOM helpers -------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
function clamp(n: number) { return Math.max(0, Math.min(1, n)); }
/** "just now" / "3m ago" / "2d ago" for the Home feed. */
function fmtAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
/** "https://x.test/a/b?q=1" → "/a/b" — what the page-path tag shows. */
function shortPath(url: string): string {
  try { return new URL(url, location.origin).pathname || "/"; } catch { return url; }
}
/**
 * Validate and normalize an environment URL. Only absolute http(s) URLs qualify —
 * a bare "staging.example.com" is a typo, not an environment, and normalizing away
 * a trailing slash keeps two spellings of the same place from both being listed.
 */
function normalizeEnvUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    const path = u.pathname.replace(/\/+$/, "");
    return u.origin + path;
  } catch {
    return null;
  }
}
/** The day bucket a comment falls in, for the All-scope timeline grouping. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function clampPx(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
/** An `<option>`. Built as an element rather than `new Option(...)`, which some
 *  DOM implementations (and the test environment) do not provide. */
function optionEl(text: string, value: string, selected: boolean): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  o.selected = selected;
  return o;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
/** Escape for a double-quoted attribute value (escapeHtml already covers the rest). */
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ---- inline icons (font-independent, currentColor) --------------------------

const svg = (inner: string) =>
  `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">${inner}</svg>`;
const DOCK_FRAME = `<rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" stroke-width="1.3"/>`;
const I_DOCK_LEFT = svg(`${DOCK_FRAME}<rect x="2.2" y="3.2" width="4" height="9.6" rx="1" fill="currentColor"/>`);
const I_DOCK_RIGHT = svg(`${DOCK_FRAME}<rect x="9.8" y="3.2" width="4" height="9.6" rx="1" fill="currentColor"/>`);
const I_DOCK_BOTTOM = svg(`${DOCK_FRAME}<rect x="2.2" y="9" width="11.6" height="3.8" rx="1" fill="currentColor"/>`);
const I_FLOAT = svg(
  `<rect x="2.5" y="3.5" width="11" height="9" rx="1.6" stroke="currentColor" stroke-width="1.3"/>` +
  `<path d="M2.5 6.1h11" stroke="currentColor" stroke-width="1.3"/>`);
const I_SUN = svg(
  `<circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/>` +
  `<g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">` +
  `<path d="M8 1.4v1.7"/><path d="M8 12.9v1.7"/><path d="M1.4 8h1.7"/><path d="M12.9 8h1.7"/>` +
  `<path d="M3.3 3.3l1.2 1.2"/><path d="M11.5 11.5l1.2 1.2"/><path d="M12.7 3.3l-1.2 1.2"/><path d="M4.5 11.5l-1.2 1.2"/></g>`);
const I_MOON = svg(
  `<path d="M13 9.4A5.3 5.3 0 1 1 6.6 3 4.3 4.3 0 0 0 13 9.4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`);
const I_CLOSE = svg(
  `<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`);
const I_GEAR = svg(
  `<circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/>` +
  `<path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
const I_MINIMIZE = svg(
  `<path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);

/** FAB cluster quick-action icons (font-independent, currentColor). */
const I_COMMENT = svg(
  `<path d="M2 3.1h12v7.4H6.5l-3.3 2.6v-2.6H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
  `<path d="M8 5.1v3.4M6.3 6.8h3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`);
/** A sticky note for the "Note" quick action — deliberately unlike the comment bubble. */
const I_NOTE = svg(
  `<path d="M2.6 2.6h10.8v7.2l-3.6 3.6H2.6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
  `<path d="M13.4 9.8h-3.6v3.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`);
const I_EYE = svg(
  `<path d="M1.4 8S3.9 4 8 4s6.6 4 6.6 4-2.5 4-6.6 4S1.4 8 1.4 8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
  `<circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>`);
const I_PLUG = svg(
  `<path d="M6 1.8v3.1M10 1.8v3.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>` +
  `<path d="M4.4 4.9h7.2v2.3a3.6 3.6 0 0 1-7.2 0z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
  `<path d="M8 10.8v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`);
/** Points up when collapsed, flips down (via CSS) when the actions are out. */
const I_FAB_CHEVRON =
  `<span class="lchev">${svg(`<path d="M4.4 9.6 8 6l3.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`)}</span>`;

/** Dashed marquee icon for the "Region" button — inline SVG so it never depends on a font. */
const REGION_ICON =
  `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
  `<rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/>` +
  `</svg>`;

/** Speech-bubble icon for the free-"Note" button. */
const NOTE_ICON =
  `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
  `<path d="M2 2.5h11v7.5H6l-3 2.5v-2.5H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
  `</svg>`;

/** Camera/record icon for the "Record" button — dashed marquee with a record dot. */
const RECORD_ICON =
  `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
  `<rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/>` +
  `<circle cx="7.5" cy="7.5" r="2.4" fill="currentColor"/>` +
  `</svg>`;

/** Video icon for the "Video" button — attach a screen recording made on the phone. */
const VIDEO_ICON =
  `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
  `<rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>` +
  `<path d="M6.3 5.5l3.9 2.2-3.9 2.2z" fill="currentColor"/>` +
  `</svg>`;

// ---- integration icons (brand marks for the "Integrates with" footer) -------
const I_GITHUB =
  `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
  `<path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.07-2.67-1.07-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.056 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.76-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.02 2.2-.8 2.2-.8.44 1.1.16 1.9.08 2.1.5.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.28.24.54.72.54 1.46v2.16c0 .21.14.46.55.38A8 8 0 0 0 8 .2z"/>` +
  `</svg>`;
const I_SLACK =
  `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
  `<path d="M3.4 10.1a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4zM5.8 3.4a1.6 1.6 0 1 1 1.6-1.6v1.6H5.8zm0 .8a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4zm6.7 1.6a1.6 1.6 0 1 1 1.6 1.6h-1.6V5.8zm-.8 0a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4zm-1.6 6.7a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4z"/>` +
  `</svg>`;
const I_TELEGRAM =
  `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
  `<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.7 5.4-1.24 5.85c-.09.41-.34.51-.69.32l-1.9-1.4-.92.88c-.1.1-.19.19-.38.19l.14-1.93 3.5-3.17c.15-.13-.03-.2-.24-.07l-4.32 2.72-1.86-.58c-.4-.13-.41-.4.09-.6l7.26-2.8c.34-.12.63.08.52.6z"/>` +
  `</svg>`;
const I_LINEAR =
  `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
  `<path d="M.6 9.2a7.4 7.4 0 0 0 6.2 6.2c.3.04.44-.33.22-.55L1.15 9a.33.33 0 0 0-.55.22zM.5 6.9c-.01.13.04.25.13.34l8.13 8.13c.09.09.21.14.34.13a7.4 7.4 0 0 0 1.3-.26c.28-.08.36-.43.15-.63L1.4 5.45c-.2-.2-.55-.13-.63.15-.12.42-.21.86-.26 1.3zM2.05 4c-.1.13-.09.32.03.44l9.48 9.48c.12.12.31.13.44.03.3-.23.58-.48.85-.75.15-.15.15-.4 0-.55L3.35 3.15a.39.39 0 0 0-.55 0c-.27.27-.52.55-.75.85zM4.5 1.9a.35.35 0 0 0-.04.53l9.11 9.11c.16.16.42.13.53-.04A7.4 7.4 0 1 0 4.5 1.9z"/>` +
  `</svg>`;

/** Synthesize an Anchor for a free page-level note so downstream (dashboard/MCP) stays happy. */
function pageAnchor(point: { x: number; y: number }): Anchor {
  return {
    tag: "page",
    cssPath: "page",
    xpath: "",
    testid: null,
    text: "",
    attrs: {},
    nthOfType: 1,
    rect: { x: Math.round(point.x), y: Math.round(point.y), w: 0, h: 0 },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

/** Synthesize an Anchor for a free region so downstream (dashboard/MCP) stays happy. */
function regionAnchor(region: RegionRect): Anchor {
  return {
    tag: "region",
    cssPath: `region ${Math.round(region.w)}×${Math.round(region.h)}`,
    xpath: "",
    testid: null,
    text: "",
    attrs: {},
    nthOfType: 1,
    rect: { x: Math.round(region.x), y: Math.round(region.y), w: Math.round(region.w), h: Math.round(region.h) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}
function regionNote(region: RegionRect): string {
  return `<!-- Loupe free-region annotation: ${Math.round(region.w)}×${Math.round(region.h)}px at document (${Math.round(region.x)}, ${Math.round(region.y)}). No single DOM element — see the attached screenshot. -->`;
}

function describe(elx: Element): string {
  const testid = elx.getAttribute("data-testid") || elx.getAttribute("data-test");
  const tag = elx.tagName.toLowerCase();
  if (testid) return `${tag}[data-testid="${testid}"]`;
  if (elx.id) return `${tag}#${elx.id}`;
  const txt = (elx.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
  return txt ? `${tag} · “${txt}”` : tag;
}
function describeAnchor(c: Comment): string {
  if (c.kind === "free") return "Free note · page-level";
  return c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;
}

/**
 * A comment is done only at the last stage. Normalizing first means a row still
 * carrying a legacy status (`done`) reads correctly without a data migration.
 */
function isResolved(c: Comment): boolean {
  return normalizeStatus(c.status) === "resolved";
}
