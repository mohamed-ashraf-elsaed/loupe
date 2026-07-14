import { STYLES } from "./styles.js";
import { captureAnchor, resolveAnchor } from "./fingerprint.js";
import { captureElementContext, captureScreenshot, captureRegionScreenshot } from "./capture.js";
import { LocalStorageAdapter } from "./store.js";
import { HttpAdapter } from "./http-adapter.js";
import type { Anchor, Comment, LoupeConfig, RegionRect, StorageAdapter } from "./types.js";

type Mode = "off" | "inspect" | "region" | "free";
/** What the composer is about to attach a comment to. */
type ComposeTarget =
  | { kind: "element"; element: Element }
  | { kind: "region"; region: RegionRect; element: Element | null; screenshot?: string }
  | { kind: "free"; offset: { x: number; y: number }; point: { x: number; y: number } };

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
  private toolbar!: HTMLElement;
  private composer!: HTMLElement;
  private panel!: HTMLElement;
  private countEl!: HTMLElement;

  private comments: Comment[] = [];
  /** comment.id → currently resolved element (or null when detached). */
  private resolved = new Map<string, Element | null>();
  /** comment.id → pin element. */
  private pins = new Map<string, HTMLElement>();

  private mode: Mode = "off";
  private collapsed = false;
  private lastUrl = "";
  /** In-flight region screenshot, captured in the background while the composer is open. */
  private pendingShot?: Promise<string | undefined>;
  private targetOffset = { x: 0.5, y: 0.5 };
  private pending: ComposeTarget | null = null;
  private dragStart: { x: number; y: number } | null = null;
  /** region comment whose outline is currently highlighted (tracks scroll). */
  private activeRegionId: string | null = null;
  private regionTimer?: number;

  /** Free-move toolbar position as viewport fractions, or null → default (bottom-center). */
  private barPos: { fx: number; fy: number } | null = null;
  /** In-flight drag of the toolbar by its ◎ handle. */
  private barDrag: { px: number; py: number; ix: number; iy: number } | null = null;
  /** True right after a drag so the trailing click doesn't also toggle collapse. */
  private justDragged = false;

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
    this.loadBarPos();
    this.buildDom();
    this.layoutBar();
    this.lastUrl = this.url;
    this.comments = await this.store.list(this.cfg.projectKey, this.url);
    this.renderPins();
    this.renderPanel();
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
      this.renderPanel();
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

    this.panel = el("div", "panel");
    this.shadow.appendChild(this.panel);

    this.toolbar = this.buildToolbar();
    this.shadow.appendChild(this.toolbar);
  }

  private buildToolbar(): HTMLElement {
    const bar = el("div", "toolbar");
    // Every item shares the same "<icon><label>" structure so they line up
    // consistently (and the label can be hidden on mobile to go icon-only).
    // The brand doubles as a collapse/expand toggle.
    const brand = el("span", "brand");
    brand.innerHTML = `<span class="ico">◎</span><span class="label">Loupe</span>`;
    brand.title = "Drag to move · click to collapse / expand";
    brand.setAttribute("role", "button");
    // Click collapses/expands; a press-and-drag moves the whole bar (see the
    // pointer handlers). The justDragged guard stops a drag ending in a toggle.
    brand.onclick = () => { if (this.justDragged) { this.justDragged = false; return; } this.toggleCollapsed(); };
    brand.addEventListener("pointerdown", this.onBarPointerDown);

    const inspectBtn = this.toolBtn("✛", "Inspect & comment", "inspect");
    inspectBtn.onclick = () => this.setMode(this.mode === "inspect" ? "off" : "inspect");

    const freeBtn = this.toolBtn(NOTE_ICON, "Note", "free");
    freeBtn.title = "Drop a note anywhere on the page — no element, no screenshot";
    freeBtn.onclick = () => this.setMode(this.mode === "free" ? "off" : "free");

    const regionBtn = this.toolBtn(REGION_ICON, "Region shot", "region");
    regionBtn.title = "Drag a free-size box, screenshot it, and comment";
    regionBtn.onclick = () => this.setMode(this.mode === "region" ? "off" : "region");

    const listBtn = this.toolBtn("☰", "Comments", "comments");
    this.countEl = el("span", "count", "0");
    listBtn.appendChild(this.countEl);
    listBtn.onclick = () => this.togglePanel();

    bar.append(brand, sep(), inspectBtn, freeBtn, regionBtn, listBtn);
    return bar;
  }

  /** A toolbar button with a uniform icon + label layout. `icon` may be an SVG string. */
  private toolBtn(icon: string, label: string, role: string): HTMLButtonElement {
    const b = el("button") as HTMLButtonElement;
    b.dataset.role = role;
    b.title = label;
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
    this.mode = mode;
    this.hl.style.display = "none";
    this.selbox.style.display = "none";
    this.cancelDrag();
    document.body.style.cursor = mode === "off" ? "" : "crosshair";
    (this.toolbar.querySelector('[data-role="inspect"]') as HTMLElement)?.classList.toggle("on", mode === "inspect");
    (this.toolbar.querySelector('[data-role="free"]') as HTMLElement)?.classList.toggle("on", mode === "free");
    (this.toolbar.querySelector('[data-role="region"]') as HTMLElement)?.classList.toggle("on", mode === "region");

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
    this.renderPanel();
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
        pin.onclick = () => { this.openPanel(); this.flash(c.id); };
        this.overlay.appendChild(pin);
        this.pins.set(c.id, pin);
      }
      pin.textContent = String(i + 1);
      pin.classList.toggle("done", c.status === "done");
      pin.classList.toggle("free", c.kind === "free");
    });
    this.countEl.textContent = String(this.comments.length);
    this.position();
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
    window.addEventListener("resize", this.onResizeBar);
    let debounce = 0;
    this.mo = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => { this.position(); this.renderPanel(); }, 120);
    });
    this.mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    // Safety net for animated / late-loading layouts.
    this.tick = window.setInterval(this.position, 800);
  }

  // ---- panel ----------------------------------------------------------------

  private openPanel() { this.panel.classList.add("open"); this.renderPanel(); }
  private togglePanel() { this.panel.classList.toggle("open"); this.renderPanel(); }

  /** Collapse the toolbar to just the logo (or expand it back). */
  private toggleCollapsed() {
    this.collapsed = !this.collapsed;
    this.toolbar.classList.toggle("collapsed", this.collapsed);
    if (this.collapsed) {
      // Leave any active mode, close the panel/composer, and hide the pins.
      this.setMode("off");
      this.panel.classList.remove("open");
      this.closeComposer();
      this.overlay.style.display = "none";
    } else {
      this.overlay.style.display = "";
      this.renderPins();
    }
    this.layoutBar();
  }

  // ---- draggable, edge-aware floating toolbar --------------------------------

  private onResizeBar = () => this.layoutBar();

  private loadBarPos() {
    try {
      const s = localStorage.getItem("loupe:bar");
      if (s) { const p = JSON.parse(s); if (typeof p?.fx === "number" && typeof p?.fy === "number") this.barPos = p; }
    } catch { /* storage unavailable → default position */ }
  }
  private saveBarPos() {
    try { if (this.barPos) localStorage.setItem("loupe:bar", JSON.stringify(this.barPos)); } catch { /* ignore */ }
  }

  private onBarPointerDown = (e: PointerEvent) => {
    if (typeof e.button === "number" && e.button !== 0) return;
    const brand = this.brandEl();
    const r = brand.getBoundingClientRect();
    this.barDrag = { px: e.clientX, py: e.clientY, ix: r.left, iy: r.top };
    this.justDragged = false;
    try { brand.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    brand.addEventListener("pointermove", this.onBarPointerMove);
    brand.addEventListener("pointerup", this.onBarPointerUp);
    brand.addEventListener("pointercancel", this.onBarPointerUp);
  };

  private onBarPointerMove = (e: PointerEvent) => {
    if (!this.barDrag) return;
    const dx = e.clientX - this.barDrag.px;
    const dy = e.clientY - this.barDrag.py;
    if (!this.justDragged && Math.hypot(dx, dy) < 5) return; // ignore tiny jitters (it's a click)
    this.justDragged = true;
    e.preventDefault();
    const vw = window.innerWidth, vh = window.innerHeight;
    const bar = this.toolbar;
    const brand = this.brandEl();
    const iw = brand.offsetWidth || 44, ih = brand.offsetHeight || 44;
    const ix = clampPx(this.barDrag.ix + dx, 6, vw - iw - 6);
    const iy = clampPx(this.barDrag.iy + dy, 6, vh - ih - 6);
    // While dragging, anchor by the top-left for smooth motion; orientation is
    // resolved on drop by layoutBar().
    bar.classList.add("floating", "dragging");
    bar.classList.remove("orient-v", "flow-rev");
    bar.classList.add("orient-h");
    Object.assign(bar.style, { transform: "none", left: ix + "px", top: iy + "px", right: "auto", bottom: "auto" });
    this.barPos = { fx: ix / vw, fy: iy / vh };
  };

  private onBarPointerUp = (e: PointerEvent) => {
    const brand = this.brandEl();
    brand.removeEventListener("pointermove", this.onBarPointerMove);
    brand.removeEventListener("pointerup", this.onBarPointerUp);
    brand.removeEventListener("pointercancel", this.onBarPointerUp);
    try { brand.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const dragged = this.justDragged;
    this.barDrag = null;
    this.toolbar.classList.remove("dragging");
    if (dragged) { this.saveBarPos(); this.layoutBar(); } // justDragged stays true so the trailing click is swallowed
  };

  private brandEl(): HTMLElement { return this.toolbar.querySelector(".brand") as HTMLElement; }

  /**
   * Position the toolbar for its stored spot and make it expand *inward* so it's
   * always fully on-screen: docked to a left/right edge → vertical; to a
   * top/bottom edge or a corner → horizontal. No stored spot → default
   * (bottom-center, governed by CSS).
   */
  private layoutBar() {
    const bar = this.toolbar;
    if (!this.barPos) {
      bar.classList.remove("floating", "orient-h", "orient-v", "flow-rev");
      for (const p of ["left", "top", "right", "bottom", "transform"] as const) bar.style[p] = "";
      return;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const brand = this.brandEl();
    const iw = brand.offsetWidth || 44, ih = brand.offsetHeight || 44;
    const ix = clampPx(this.barPos.fx * vw, 6, Math.max(6, vw - iw - 6));
    const iy = clampPx(this.barPos.fy * vh, 6, Math.max(6, vh - ih - 6));
    const cx = ix + iw / 2, cy = iy + ih / 2;
    const horizontalSide = cx < vw / 2 ? "left" : "right";
    const verticalSide = cy < vh / 2 ? "top" : "bottom";
    // Nearest edge decides orientation. Ties (corners) fall to horizontal.
    const vertical = Math.min(cx, vw - cx) < Math.min(cy, vh - cy);

    bar.classList.add("floating");
    bar.classList.remove("dragging");
    bar.classList.toggle("orient-v", vertical);
    bar.classList.toggle("orient-h", !vertical);
    bar.classList.toggle("flow-rev", vertical ? verticalSide === "bottom" : horizontalSide === "right");
    bar.style.transform = "none";

    // Anchor by the icon's nearest corner so the ◎ stays put and items grow inward.
    if (horizontalSide === "left") { bar.style.left = ix + "px"; bar.style.right = "auto"; }
    else { bar.style.right = (vw - (ix + iw)) + "px"; bar.style.left = "auto"; }
    if (verticalSide === "top") { bar.style.top = iy + "px"; bar.style.bottom = "auto"; }
    else { bar.style.bottom = (vh - (iy + ih)) + "px"; bar.style.top = "auto"; }

    // Extreme case (icon dropped near center): the expanded bar could overflow the
    // far edge — snap it back so it's never clipped.
    const r = bar.getBoundingClientRect();
    if (r.right > vw - 6 && bar.style.left !== "auto") { bar.style.left = "auto"; bar.style.right = "6px"; }
    if (r.left < 6 && bar.style.right !== "auto") { bar.style.right = "auto"; bar.style.left = "6px"; }
    if (r.bottom > vh - 6 && bar.style.top !== "auto") { bar.style.top = "auto"; bar.style.bottom = "6px"; }
    if (r.top < 6 && bar.style.bottom !== "auto") { bar.style.bottom = "auto"; bar.style.top = "6px"; }
  }

  private renderPanel() {
    const p = this.panel;
    p.innerHTML = "";
    const head = el("div", "phead");
    head.append(document.createTextNode(`Comments · ${this.comments.length}`));
    const x = el("button", "x", "×") as HTMLButtonElement;
    x.onclick = () => p.classList.remove("open");
    head.appendChild(x);
    p.appendChild(head);

    const list = el("div", "list");
    if (!this.comments.length) {
      list.appendChild(el("div", "empty", "No comments yet. Click “Inspect & comment” and pick an element, or “Note” to drop a comment anywhere."));
    }
    this.comments.forEach((c, i) => list.appendChild(this.itemView(c, i)));
    p.appendChild(list);
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
      this.renderPins(); this.renderPanel();
    };
    const claudeBtn = el("button", "", "Copy for Claude") as HTMLButtonElement;
    claudeBtn.onclick = async (e) => { e.stopPropagation(); await this.copyForClaude(c); claudeBtn.textContent = "Copied ✓"; };
    const del = el("button", "", "Delete") as HTMLButtonElement;
    del.onclick = async (e) => {
      e.stopPropagation();
      await this.store.remove(c.id);
      this.comments = this.comments.filter((x) => x.id !== c.id);
      this.resolved.delete(c.id);
      this.renderPins(); this.renderPanel();
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
    window.removeEventListener("resize", this.onResizeBar);
    document.removeEventListener("keydown", this.onKey, true);
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
function sep() { return el("span", "sep"); }
function clamp(n: number) { return Math.max(0, Math.min(1, n)); }
function clampPx(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

/** Dashed marquee icon for the "Region shot" button — inline SVG so it never depends on a font. */
const REGION_ICON =
  `<svg class="ico" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
  `<rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 1.8"/>` +
  `</svg>`;

/** Speech-bubble icon for the free-"Note" button. */
const NOTE_ICON =
  `<svg class="ico" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">` +
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
