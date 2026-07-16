import { STYLES } from "./styles.js";
import { captureAnchor, resolveAnchor } from "./fingerprint.js";
import { captureElementContext, captureScreenshot, captureRegionScreenshot } from "./capture.js";
import { LocalStorageAdapter } from "./store.js";
import { HttpAdapter } from "./http-adapter.js";
import type { Anchor, Comment, LoupeConfig, RegionRect, StorageAdapter } from "./types.js";

type Mode = "off" | "inspect" | "region" | "free";
/** Where the control panel is anchored. */
type DockMode = "left" | "right" | "bottom" | "float";
/** What the composer is about to attach a comment to. */
type ComposeTarget =
  | { kind: "element"; element: Element }
  | { kind: "region"; region: RegionRect; element: Element | null; screenshot?: string }
  | { kind: "free"; offset: { x: number; y: number }; point: { x: number; y: number } };

const DOCK_MODES: DockMode[] = ["left", "right", "bottom", "float"];

const uid = () =>
  (crypto as any).randomUUID ? crypto.randomUUID() : "c_" + Math.abs(hash(String(performance.now()))).toString(36);
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

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

  /** The dockable control panel (header + tools + comment list). */
  private dock!: HTMLElement;
  /** The collapsed launcher button shown when the panel is closed. */
  private launcher!: HTMLElement;
  private themeBtn!: HTMLButtonElement;
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private launchCount!: HTMLElement;

  private comments: Comment[] = [];
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
    this.buildDom();
    if (this.cfg.autoOpen) this.open = true;
    this.applyDockLayout();
    this.lastUrl = this.url;
    this.comments = await this.store.list(this.cfg.projectKey, this.url);
    this.renderPins();
    this.renderList();
    this.observe();
    this.watchNavigation();
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
    this.launcher = this.buildLauncher();
    this.shadow.append(this.dock, this.launcher);
  }

  /** The dockable control panel: header (brand + dock controls) → tools → list. */
  private buildDock(): HTMLElement {
    const dock = el("div", "dock");

    // header ------------------------------------------------------------------
    const head = el("div", "dhead");
    const brand = el("div", "brand");
    brand.innerHTML = `<span class="logo">◎</span><span class="title"></span>`;
    (brand.querySelector(".title") as HTMLElement).textContent = this.cfg.label ?? "Loupe";
    head.addEventListener("pointerdown", this.onHeadPointerDown); // drag in float mode

    const ctl = el("div", "dctl");
    const dockBtn = (mode: DockMode, icon: string, title: string) => {
      const b = el("button") as HTMLButtonElement;
      b.dataset.dock = mode;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.innerHTML = icon;
      b.onclick = () => this.setDock(mode);
      return b;
    };
    // Order mirrors DevTools: dock-left, dock-bottom, dock-right, undock/float.
    ctl.append(
      dockBtn("left", I_DOCK_LEFT, "Dock to left"),
      dockBtn("bottom", I_DOCK_BOTTOM, "Dock to bottom"),
      dockBtn("right", I_DOCK_RIGHT, "Dock to right"),
      dockBtn("float", I_FLOAT, "Float"),
      el("span", "gap"),
    );
    this.themeBtn = el("button") as HTMLButtonElement;
    this.themeBtn.dataset.role = "theme";
    this.themeBtn.onclick = () => this.toggleTheme();
    const closeBtn = el("button") as HTMLButtonElement;
    closeBtn.dataset.role = "close";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = I_CLOSE;
    closeBtn.onclick = () => this.closeDock();
    ctl.append(this.themeBtn, closeBtn);

    head.append(brand, ctl);

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
    tools.append(inspectBtn, freeBtn, regionBtn);

    // list --------------------------------------------------------------------
    const listHead = el("div", "listhead");
    listHead.append(document.createTextNode("Comments"));
    this.countEl = el("span", "count", "0");
    listHead.appendChild(this.countEl);
    this.listEl = el("div", "list");

    const resize = el("div", "resize");
    resize.addEventListener("pointerdown", this.onResizeDown);

    dock.append(head, tools, listHead, this.listEl, resize);
    return dock;
  }

  private buildLauncher(): HTMLElement {
    const b = el("button", "launcher") as HTMLButtonElement;
    b.title = `Open ${this.cfg.label ?? "Loupe"}`;
    b.setAttribute("aria-label", "Open Loupe");
    b.innerHTML = `<span class="logo">◎</span><span class="lcount"></span>`;
    this.launchCount = b.querySelector(".lcount") as HTMLElement;
    b.onclick = () => this.openDock();
    return b;
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

  private onMove = (e: MouseEvent) => {
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

  private onRegionDown = (e: MouseEvent) => {
    if (this.mode !== "region" || e.button !== 0) return;
    // Ignore drags that start on our own UI (the panel overlays the page).
    const t = e.target as Element | null;
    if (t && (t.id === "loupe-root" || t.closest?.("#loupe-root"))) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragStart = { x: e.clientX, y: e.clientY };
    document.addEventListener("mousemove", this.onRegionMove, true);
    document.addEventListener("mouseup", this.onRegionUp, true);
    this.drawSelection(e.clientX, e.clientY);
  };

  private onRegionMove = (e: MouseEvent) => {
    if (!this.dragStart) return;
    e.preventDefault();
    this.drawSelection(e.clientX, e.clientY);
  };

  private onRegionUp = (e: MouseEvent) => {
    if (!this.dragStart) return;
    e.preventDefault();
    e.stopPropagation();
    const start = this.dragStart;
    this.cancelDrag();
    const vp: RegionRect = {
      x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y),
    };
    if (vp.w < 8 || vp.h < 8) { this.selbox.style.display = "none"; return; } // stray click
    this.setMode("off");
    this.finishRegion(vp);
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
    document.removeEventListener("mousemove", this.onRegionMove, true);
    document.removeEventListener("mouseup", this.onRegionUp, true);
  }

  /** Capture the selected viewport rect, then open the composer for a region comment. */
  private async finishRegion(vp: RegionRect) {
    // Anchor the region to the element under its center so it survives reflow.
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
    this.selbox.style.display = "none";
    // Document coords are the fallback; `rel` (element-relative) is preferred.
    const region: RegionRect = { x: vp.x + window.scrollX, y: vp.y + window.scrollY, w: vp.w, h: vp.h, rel };
    const target: ComposeTarget = { kind: "region", region, element: centerEl };
    // Open the composer immediately; capture the screenshot in the background so a
    // slow capture never blocks the UI. It attaches to the comment on submit.
    this.openComposer(target, vp.x + vp.w, vp.y);
    const capture = this.cfg.captureRegion ?? captureRegionScreenshot;
    this.pendingShot = capture(vp);
    void this.pendingShot.then((shot) => {
      if (shot && this.pending === target) target.screenshot = shot;
    }).catch(() => undefined);
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
    // Tools live inside the panel — entering a mode implies the panel is open.
    if (mode !== "off" && !this.open) { this.open = true; this.applyDockLayout(); }
    this.mode = mode;
    this.hl.style.display = "none";
    this.selbox.style.display = "none";
    this.cancelDrag();
    document.body.style.cursor = mode === "off" ? "" : "crosshair";
    (this.dock.querySelector('[data-role="inspect"]') as HTMLElement)?.classList.toggle("on", mode === "inspect");
    (this.dock.querySelector('[data-role="free"]') as HTMLElement)?.classList.toggle("on", mode === "free");
    (this.dock.querySelector('[data-role="region"]') as HTMLElement)?.classList.toggle("on", mode === "region");
    // On mobile this shrinks the bottom sheet to just header + tools (see styles)
    // so most of the page stays visible while picking an element/region.
    this.dock.classList.toggle("inspecting", mode !== "off");

    document.removeEventListener("mousemove", this.onMove, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("click", this.onFreeClick, true);
    document.removeEventListener("mousedown", this.onRegionDown, true);

    if (mode === "off") return;
    document.addEventListener("keydown", this.onKey, true);
    this.closeComposer();
    if (mode === "inspect") {
      document.addEventListener("mousemove", this.onMove, true);
      document.addEventListener("click", this.onClick, true);
    } else if (mode === "free") {
      document.addEventListener("click", this.onFreeClick, true);
    } else if (mode === "region") {
      document.addEventListener("mousedown", this.onRegionDown, true);
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

  private openComposer(target: ComposeTarget, x: number, y: number) {
    this.pending = target;
    const c = this.composer;
    c.innerHTML = "";
    const label = el("div", "target",
      target.kind === "element" ? describe(target.element)
        : target.kind === "region" ? `Region · ${Math.round(target.region.w)}×${Math.round(target.region.h)} px`
          : "Free note · anywhere on the page");
    const ta = el("textarea") as HTMLTextAreaElement;
    ta.placeholder = target.kind === "region" ? "What's the issue in this area?"
      : target.kind === "free" ? "Leave a note about this page…"
        : "What should change here?";
    const row = el("div", "row");
    // Free notes never carry a screenshot, so they skip the attach checkbox.
    let box: HTMLInputElement | null = null;
    if (target.kind !== "free") {
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
    ta.oninput = () => { save.disabled = !ta.value.trim(); };
    save.onclick = () => this.submit(target, ta.value.trim(), box ? box.checked : false);
    btns.append(cancel, save);
    row.append(btns);
    c.append(label, ta, row);

    // Position near the click, clamped to the viewport.
    const w = 300, h = 190;
    const left = Math.min(Math.max(8, x + 12), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, y + 12), window.innerHeight - h - 8);
    Object.assign(c.style, { display: "block", left: left + "px", top: top + "px" });
    ta.focus();
  }

  private closeComposer() {
    this.composer.style.display = "none";
    this.pending = null;
    this.pendingShot = undefined;
  }

  private async submit(target: ComposeTarget, body: string, withShot: boolean) {
    if (!body) return;
    const saveBtn = this.composer.querySelector(".primary") as HTMLButtonElement;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

    let anchor: Anchor, context: Comment["context"], offset: Comment["offset"];
    let screenshot: string | undefined;
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
      // Use the background capture; await it only if it hasn't attached yet.
      screenshot = withShot ? (target.screenshot ?? await this.pendingShot) : undefined;
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
      body,
      status: "open",
      kind: target.kind,
      anchor,
      context,
      offset,
      region,
      screenshot,
      // Record the screen the feedback was captured on (desktop / tablet / mobile).
      viewport: { w: window.innerWidth, h: window.innerHeight },
      createdAt: new Date().toISOString(),
    };
    await this.store.save(comment);
    this.comments.push(comment);
    this.resolved.set(comment.id, anchoredEl);
    this.closeComposer();
    this.renderPins();
    this.renderList();
    this.flash(comment.id);
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
      pin.classList.toggle("done", c.status === "done");
      pin.classList.toggle("free", c.kind === "free");
    });
    this.updateCount();
    this.position();
  }

  private updateCount() {
    const n = this.comments.length;
    this.countEl.textContent = String(n);
    this.launchCount.textContent = n ? String(n) : "";
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
        const r = resolveAnchor(c.anchor);
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

  private openDock() { this.open = true; this.saveState(); this.applyDockLayout(); this.renderList(); }

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

  private toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.saveState();
    this.applyDockLayout();
  }

  private onWinResize = () => this.applyDockLayout();

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
      if (p?.float && typeof p.float.w === "number") this.floatRect = { ...this.floatRect, ...p.float };
    } catch { /* storage unavailable → defaults */ }
  }

  private saveState() {
    try {
      localStorage.setItem("loupe:dock", JSON.stringify({
        mode: this.dockMode, open: this.open, theme: this.theme, float: this.floatRect,
      }));
    } catch { /* ignore */ }
  }

  /** Reflect all control-panel state (theme, dock mode, geometry, launcher) into the DOM. */
  private applyDockLayout() {
    this.root.classList.toggle("theme-light", this.theme === "light");
    this.themeBtn.title = this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    this.themeBtn.innerHTML = this.theme === "dark" ? I_SUN : I_MOON;

    const d = this.dock;
    d.classList.toggle("open", this.open);
    for (const m of DOCK_MODES) d.classList.toggle("mode-" + m, this.dockMode === m);

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

    // Launcher: visible only when closed; sits on the same side as the dock edge.
    this.launcher.classList.toggle("show", !this.open);
    const leftSide = this.dockMode === "left";
    this.launcher.style.left = leftSide ? "20px" : "auto";
    this.launcher.style.right = leftSide ? "auto" : "20px";

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
    if (!this.comments.length) {
      this.listEl.appendChild(el("div", "empty",
        "No comments yet. Use Inspect to pick an element, or Note to drop a comment anywhere on the page."));
    }
    this.comments.forEach((c, i) => this.listEl.appendChild(this.itemView(c, i)));
    this.updateCount();
  }

  private itemView(c: Comment, i: number): HTMLElement {
    const detached = this.pins.get(c.id)?.classList.contains("detached") && c.status !== "done";
    const item = el("div", "item");
    const top = el("div", "top");
    const num = el("span", "num" + (c.status === "done" ? " done" : detached ? " detached" : ""), String(i + 1));
    const who = el("span", "who", c.author.name);
    top.append(num, who);
    const vw = c.viewport?.w;
    if (vw) {
      const kind = vw < 768 ? "mobile" : vw < 1024 ? "tablet" : "desktop";
      const icon = vw < 768 ? "📱" : vw < 1024 ? "▦" : "🖥";
      top.appendChild(el("span", "device", `${icon} ${kind}`));
    }
    if (c.status === "done") top.appendChild(el("span", "badge done", "done"));
    else if (detached) top.appendChild(el("span", "badge detached", "element moved/removed"));
    item.appendChild(top);

    item.appendChild(el("div", "body", c.body));
    item.appendChild(el("div", "meta", describeAnchor(c)));

    if (c.screenshot) {
      const img = el("img", "shot") as HTMLImageElement;
      img.src = c.screenshot;
      item.appendChild(img);
    }

    const actions = el("div", "actions");
    const doneBtn = el("button", "", c.status === "done" ? "Reopen" : "Mark done") as HTMLButtonElement;
    doneBtn.onclick = async (e) => {
      e.stopPropagation();
      const status = c.status === "done" ? "open" : "done";
      c.status = status; await this.store.update(c.id, { status });
      this.renderPins(); this.renderList();
    };
    const claudeBtn = el("button", "", "Copy for Claude") as HTMLButtonElement;
    claudeBtn.onclick = async (e) => { e.stopPropagation(); await this.copyForClaude(c); claudeBtn.textContent = "Copied ✓"; };
    const del = el("button", "", "Delete") as HTMLButtonElement;
    del.onclick = async (e) => {
      e.stopPropagation();
      await this.store.remove(c.id);
      this.comments = this.comments.filter((x) => x.id !== c.id);
      this.resolved.delete(c.id);
      this.renderPins(); this.renderList();
    };
    actions.append(doneBtn, claudeBtn, del);
    item.appendChild(actions);

    item.onclick = () => this.flash(c.id);
    return item;
  }

  private async copyForClaude(c: Comment) {
    const lines = c.kind === "free"
      ? [
        `# Product feedback from ${c.author.name}`,
        ``,
        `**Note:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Type:** Free note — a page-level comment not tied to a specific element.`,
      ]
      : [
        `# Product feedback from ${c.author.name}`,
        ``,
        `**Comment:** ${c.body}`,
        `**Page:** ${c.url}`,
        `**Element:** \`${c.anchor.cssPath}\``,
        c.anchor.testid ? `**Stable id:** \`${c.anchor.testid}\`` : ``,
        ``,
        `## Target element`,
        "```html",
        c.context.html,
        "```",
        ``,
        `## Computed styles`,
        "```json",
        JSON.stringify(c.context.styles, null, 2),
        "```",
      ];
    const prompt = lines.filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(prompt); } catch { console.log("[loupe] copy failed; prompt:\n" + prompt); }
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
function clampPx(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

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
