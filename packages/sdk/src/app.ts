import { STYLES } from "./styles.js";
import { captureAnchor, resolveAnchor } from "./fingerprint.js";
import { captureElementContext, captureScreenshot } from "./capture.js";
import { LocalStorageAdapter } from "./store.js";
import { HttpAdapter } from "./http-adapter.js";
import type { Comment, LoupeConfig, StorageAdapter } from "./types.js";

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
  private toolbar!: HTMLElement;
  private composer!: HTMLElement;
  private panel!: HTMLElement;
  private countEl!: HTMLElement;

  private comments: Comment[] = [];
  /** comment.id → currently resolved element (or null when detached). */
  private resolved = new Map<string, Element | null>();
  /** comment.id → pin element. */
  private pins = new Map<string, HTMLElement>();

  private inspecting = false;
  private target: Element | null = null;
  private targetOffset = { x: 0.5, y: 0.5 };
  private activeId: string | null = null;

  private raf = 0;
  private mo?: MutationObserver;
  private tick?: number;

  constructor(cfg: LoupeConfig) {
    this.cfg = cfg;
    // apiBase set → talk to the backend; otherwise persist locally (prototype).
    this.store = cfg.apiBase
      ? new HttpAdapter(cfg.apiBase, cfg.user, cfg.userHmac)
      : new LocalStorageAdapter();
  }

  private get url() { return location.pathname + location.search; }

  async start() {
    this.buildDom();
    this.comments = await this.store.list(this.cfg.projectKey, this.url);
    this.renderPins();
    this.renderPanel();
    this.observe();
    if (this.cfg.autoOpen) this.setInspecting(true);
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
    this.overlay.appendChild(this.hl);
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
    const brand = el("span", "brand", "◎ Loupe");
    const inspectBtn = el("button", "", "✛ Inspect & comment") as HTMLButtonElement;
    inspectBtn.dataset.role = "inspect";
    inspectBtn.onclick = () => this.setInspecting(!this.inspecting);
    const listBtn = el("button", "", "☰ Comments") as HTMLButtonElement;
    this.countEl = el("span", "count", "0");
    listBtn.appendChild(this.countEl);
    listBtn.onclick = () => this.togglePanel();
    bar.append(brand, sep(), inspectBtn, listBtn);
    return bar;
  }

  // ---- inspector ------------------------------------------------------------

  private onMove = (e: MouseEvent) => {
    if (!this.inspecting) return;
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
    if (!this.inspecting) return;
    const target = this.pick(e.clientX, e.clientY);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const r = target.getBoundingClientRect();
    this.targetOffset = {
      x: r.width ? clamp((e.clientX - r.left) / r.width) : 0.5,
      y: r.height ? clamp((e.clientY - r.top) / r.height) : 0.5,
    };
    this.target = target;
    this.setInspecting(false);
    this.openComposer(target, e.clientX, e.clientY);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { this.setInspecting(false); this.closeComposer(); }
  };

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

  private setInspecting(on: boolean) {
    this.inspecting = on;
    this.hl.style.display = "none";
    document.body.style.cursor = on ? "crosshair" : "";
    const btn = this.toolbar.querySelector('[data-role="inspect"]') as HTMLElement;
    btn.classList.toggle("on", on);
    if (on) {
      document.addEventListener("mousemove", this.onMove, true);
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("keydown", this.onKey, true);
      this.closeComposer();
    } else {
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
    }
  }

  // ---- composer -------------------------------------------------------------

  private openComposer(target: Element, x: number, y: number) {
    const c = this.composer;
    c.innerHTML = "";
    const label = el("div", "target", describe(target));
    const ta = el("textarea") as HTMLTextAreaElement;
    ta.placeholder = "What should change here?";
    const row = el("div", "row");
    const chk = el("label", "chk") as HTMLLabelElement;
    const box = document.createElement("input"); box.type = "checkbox"; box.checked = true;
    chk.append(box, document.createTextNode("Attach screenshot"));
    const btns = el("div", "btns");
    const cancel = el("button", "ghost", "Cancel") as HTMLButtonElement;
    cancel.onclick = () => this.closeComposer();
    const save = el("button", "primary", "Comment") as HTMLButtonElement;
    save.disabled = true;
    ta.oninput = () => { save.disabled = !ta.value.trim(); };
    save.onclick = () => this.submit(target, ta.value.trim(), box.checked);
    btns.append(cancel, save);
    row.append(chk, btns);
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
    this.target = null;
  }

  private async submit(target: Element, body: string, withShot: boolean) {
    if (!body) return;
    const saveBtn = this.composer.querySelector(".primary") as HTMLButtonElement;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

    const capture = this.cfg.captureScreenshot ?? captureScreenshot;
    const screenshot = withShot ? await capture(target) : undefined;
    const comment: Comment = {
      id: uid(),
      projectKey: this.cfg.projectKey,
      url: this.url,
      author: this.cfg.user,
      body,
      status: "open",
      anchor: captureAnchor(target),
      context: captureElementContext(target),
      offset: this.targetOffset,
      screenshot,
      createdAt: new Date().toISOString(),
    };
    await this.store.save(comment);
    this.comments.push(comment);
    this.resolved.set(comment.id, target);
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
    });
    this.countEl.textContent = String(this.comments.length);
    this.position();
  }

  /** Reposition every pin, re-resolving anchors whose element has gone. */
  private position = () => {
    for (const c of this.comments) {
      const pin = this.pins.get(c.id);
      if (!pin) continue;
      let elx = this.resolved.get(c.id) ?? null;
      if (!elx || !elx.isConnected) {
        const r = resolveAnchor(c.anchor);
        elx = r?.element ?? null;
        this.resolved.set(c.id, elx);
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
  };

  private observe() {
    const reposition = () => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.position);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
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
      list.appendChild(el("div", "empty", "No comments yet. Click “Inspect & comment”, then click any element."));
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
    const prompt = [
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
    ].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(prompt); } catch { console.log("[loupe] copy failed; prompt:\n" + prompt); }
  }

  private flash(id: string) {
    const pin = this.pins.get(id);
    if (!pin || pin.classList.contains("detached")) return;
    for (const p of this.pins.values()) p.classList.remove("active");
    pin.classList.add("active");
    const elx = this.resolved.get(id);
    if (elx) elx.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  destroy() {
    this.setInspecting(false);
    this.mo?.disconnect();
    if (this.tick) clearInterval(this.tick);
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

function describe(elx: Element): string {
  const testid = elx.getAttribute("data-testid") || elx.getAttribute("data-test");
  const tag = elx.tagName.toLowerCase();
  if (testid) return `${tag}[data-testid="${testid}"]`;
  if (elx.id) return `${tag}#${elx.id}`;
  const txt = (elx.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
  return txt ? `${tag} · “${txt}”` : tag;
}
function describeAnchor(c: Comment): string {
  return c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;
}
