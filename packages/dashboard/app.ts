// Loupe feedback board — reads the backend API and renders a Kanban of comments.
// Vanilla TS to match the SDK's zero-framework footprint.
import {
  CHANGE_TYPE_LABELS,
  CHANGE_TYPES,
  COMMENT_PRIORITIES,
  COMMENT_STAGES,
  normalizeChangeType,
  normalizePriority,
  normalizeStatus,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  STAGE_LABELS,
} from "@loupekit/shared";
import type { ChangeType, Comment, CommentPriority, CommentStatus as Status } from "@loupekit/shared";

// Config resolution. A host that embeds the board behind its own authenticated
// session (e.g. the Laravel package) injects `window.__LOUPE__` server-side;
// otherwise fall back to query params for the standalone demo/server.
const injected = (window as any).__LOUPE__ as
  | { api?: string; project?: string; csrf?: string }
  | undefined;
const params = new URLSearchParams(location.search);
const API = (injected?.api || params.get("api") || location.origin).replace(/\/$/, "");
const PROJECT = injected?.project || params.get("project") || "pk_demo_acme";
// Two auth paths:
// - session mode (injected.csrf present): the request rides the host's session
//   cookie; we only add the CSRF token so writes pass the framework's guard.
// - admin mode (standalone): the project secret is passed via ?key= (persisted)
//   and sent as X-Loupe-Admin.
const CSRF = injected?.csrf || "";
const ADMIN = params.get("key") || localStorage.getItem("loupe_admin") || "";
if (params.get("key")) localStorage.setItem("loupe_admin", params.get("key")!);

// The board is the canonical stage order — one source of truth in @loupekit/shared
// so the dashboard, the SDK and the Laravel mirror cannot drift apart.
const COLUMNS: { key: Status; label: string }[] = COMMENT_STAGES.map((key) => ({ key, label: STAGE_LABELS[key] }));
const ORDER: Status[] = [...COMMENT_STAGES];

let comments: Comment[] = [];
let pageFilter = "";
let search = "";
let kindFilter = "";   // "" | element | region | free
let deviceFilter = ""; // "" | desktop | tablet | mobile
let priorityFilter = ""; // "" | critical | high | medium | low
let typeFilter = "";     // "" | frontend | backend | api | other
let repoFilter = "";
let branchFilter = "";
let sortOrder: "newest" | "oldest" | "priority" = "newest";

/**
 * Saved views: a named filter combination on top of the manual filters, so a
 * team can jump to "what needs a human" without rebuilding a filter each time.
 */
type View = "all" | "needs_you" | "unassigned" | "critical";
const VIEW_KEY = "loupe_board_view";
const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All feedback" },
  { key: "needs_you", label: "Needs you (In Review)" },
  { key: "critical", label: "Critical only" },
  { key: "unassigned", label: "Not linked to a repo" },
];
let view: View = "all";

function loadView(): View {
  // The URL wins (a shared link), then the last choice, then everything.
  const fromUrl = new URLSearchParams(location.search).get("view");
  const raw = fromUrl || localStorage.getItem(VIEW_KEY) || "all";
  return (VIEWS.some((v) => v.key === raw) ? raw : "all") as View;
}

function saveView(v: View) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  const u = new URL(location.href);
  if (v === "all") u.searchParams.delete("view");
  else u.searchParams.set("view", v);
  history.replaceState(null, "", u.toString());
}

/** Does a comment belong to the active saved view? */
function matchesView(c: Comment): boolean {
  switch (view) {
    case "needs_you": return normalizeStatus(c.status) === "in_review";
    case "critical": return normalizePriority(c.priority) === "critical";
    case "unassigned": return !c.repo;
    default: return true;
  }
}
/** Ids of cards the user expanded — cards are collapsed to a summary by default. */
const expanded = new Set<string>();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const boardEl = $("#board");
const statusEl = $("#status");

async function api(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as any) };
  if (ADMIN) headers["X-Loupe-Admin"] = ADMIN;
  if (CSRF) headers["X-CSRF-TOKEN"] = CSRF;
  // Session mode needs the cookie sent with the request.
  const credentials: RequestCredentials | undefined = CSRF ? "same-origin" : undefined;
  return fetch(`${API}${path}`, { ...init, headers, ...(credentials ? { credentials } : {}) });
}

/** True until the first successful fetch, so the board can show a loading state. */
let loadedOnce = false;

async function load() {
  try {
    // First paint has nothing to show yet — say so rather than an empty board.
    if (!loadedOnce) {
      statusEl.className = "loading";
      statusEl.textContent = "Loading feedback…";
      statusEl.style.display = "block";
    }
    const res = await api(`/v1/comments?projectKey=${encodeURIComponent(PROJECT)}`);
    if (res.status === 401 || res.status === 404) {
      throw new Error("AUTH");
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    comments = (await res.json()) as Comment[];
    loadedOnce = true;
    statusEl.style.display = "none";
    boardEl.style.display = "grid";
    renderPageFilter();
    renderRepoFilter();
    renderBranchFilter();
    render();
  } catch (err) {
    boardEl.style.display = "none";
    statusEl.style.display = "block";
    statusEl.className = "error";
    statusEl.textContent = (err as Error).message === "AUTH"
      ? CSRF
        ? `You don't have access to this dashboard.`
        : `Not authorized. Open this page with ?key=<project secret> (from \`npm run seed\`).`
      : `Can't reach the API at ${API}. Is the backend running? (${(err as Error).message})`;
  }
}

function renderPageFilter() {
  const sel = $<HTMLSelectElement>("#pageFilter");
  const pages = Array.from(new Set(comments.map((c) => c.url))).sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">All pages (${comments.length})</option>` +
    pages.map((p) => {
      const n = comments.filter((c) => c.url === p).length;
      return `<option value="${escapeAttr(p)}">${escapeHtml(p)} (${n})</option>`;
    }).join("");
  sel.value = current;
}

/** Repo filter — options come from the data, so a newly connected repo appears. */
function renderRepoFilter() {
  const sel = document.getElementById("repoFilter") as HTMLSelectElement | null;
  if (!sel) return;
  const current = sel.value;
  const repos = [...new Set(comments.map((c) => c.repo).filter((r): r is string => !!r))];
  sel.innerHTML = `<option value="">All repos</option>` +
    repos.sort().map((r) => {
      const n = comments.filter((c) => c.repo === r).length;
      return `<option value="${escapeAttr(r)}">${escapeHtml(r)} (${n})</option>`;
    }).join("");
  sel.value = current;
}

/** Branch filter — same idea, for branch-aware threads. */
function renderBranchFilter() {
  const sel = document.getElementById("branchFilter") as HTMLSelectElement | null;
  if (!sel) return;
  const current = sel.value;
  const branches = [...new Set(comments.map((c) => c.branch).filter((b): b is string => !!b))];
  sel.innerHTML = `<option value="">All branches</option>` +
    branches.sort().map((b) => {
      const n = comments.filter((c) => c.branch === b).length;
      return `<option value="${escapeAttr(b)}">${escapeHtml(b)} (${n})</option>`;
    }).join("");
  sel.value = current;
}

/** The saved-view switcher: built once from VIEWS, then kept in sync. */
function renderViewFilter() {
  const sel = document.getElementById("viewFilter") as HTMLSelectElement | null;
  if (!sel) return;
  if (!sel.options.length) {
    sel.innerHTML = VIEWS.map((v) => `<option value="${v.key}">${escapeHtml(v.label)}</option>`).join("");
  }
  sel.value = view;
}

function render() {
  $("#project").textContent = PROJECT;
  const q = search.trim().toLowerCase();
  const visible = comments.filter((c) =>
    (!pageFilter || c.url === pageFilter) &&
    (!kindFilter || (c.kind ?? "element") === kindFilter) &&
    (!deviceFilter || deviceKey(c) === deviceFilter) &&
    (!priorityFilter || normalizePriority(c.priority) === priorityFilter) &&
    (!typeFilter || normalizeChangeType(c.changeType) === typeFilter) &&
    (!repoFilter || c.repo === repoFilter) &&
    (!branchFilter || c.branch === branchFilter) &&
    matchesView(c) &&
    (!q || `${c.title ?? ""} ${c.body} ${c.author?.name ?? ""}`.toLowerCase().includes(q)),
  );
  boardEl.innerHTML = "";
  for (const col of COLUMNS) {
    const items = visible
      .filter((c) => normalizeStatus(c.status) === col.key)
      .sort((a, b) => {
        // "Priority" is its own sort: most urgent first, then newest within a priority.
        if (sortOrder === "priority") {
          const d = PRIORITY_RANK[normalizePriority(a.priority)] - PRIORITY_RANK[normalizePriority(b.priority)];
          if (d !== 0) return d;
          return b.createdAt.localeCompare(a.createdAt);
        }
        return sortOrder === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt);
      });
    const colEl = document.createElement("section");
    colEl.className = `col stage-${col.key}`;
    colEl.innerHTML =
      `<div class="col-head"><span class="swatch"></span><h2>${col.label}</h2><span class="n">${items.length}</span></div>`;
    const stack = document.createElement("div");
    stack.className = "stack";
    if (!items.length) {
      const e = document.createElement("div");
      e.className = "col-empty";
      e.textContent = col.key === "queue" ? "No new feedback" : "Nothing here";
      stack.appendChild(e);
    } else {
      items.forEach((c) => stack.appendChild(card(c)));
    }
    colEl.appendChild(stack);
    boardEl.appendChild(colEl);
  }
}

/** The device class a comment was captured on ("" when the viewport is unknown). */
function deviceKey(c: Comment): string {
  const w = c.viewport?.w;
  return !w ? "" : w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";
}

function card(c: Comment): HTMLElement {
  const el = document.createElement("article");
  const open = expanded.has(c.id);
  el.className = "card" + (open ? "" : " collapsed");
  el.dataset.id = c.id;

  const target = c.kind === "free"
    ? "Free note · page-level"
    : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath || "—";
  const initials = c.author.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const device = deviceBadge(c);
  const prio = normalizePriority(c.priority);
  const ctype = normalizeChangeType(c.changeType);

  // The card leads with the captured pixels when there are any — the screenshot,
  // or a recording's poster frame. Clicking opens it full size. Compact density
  // hides this strip (see the CSS) so a long board stays scannable.
  if (c.screenshot || c.recording) {
    const thumb = document.createElement("div");
    thumb.className = "cthumb";
    if (c.screenshot) {
      thumb.title = "Open full screenshot";
      thumb.innerHTML = `<img src="${escapeAttr(c.screenshot)}" alt="screenshot of the commented element" />`;
      const shot = c.screenshot;
      thumb.onclick = (e) => { e.stopPropagation(); openImage(shot); };
    } else {
      thumb.classList.add("cthumb-video");
      thumb.title = "Includes a screen recording — expand the card to play it";
      thumb.innerHTML = `<span class="cthumb-play">▶</span>`;
    }
    if (c.recording) {
      const badge = document.createElement("span");
      badge.className = "cthumb-badge";
      badge.textContent = "⏺";
      badge.title = "Includes a screen recording";
      thumb.appendChild(badge);
    }
    el.appendChild(thumb);
  }

  const body = document.createElement("div");
  body.className = "cbody";
  // The title is the always-visible summary; everything else is in `.detail`.
  body.innerHTML =
    `<div class="row1"><span class="avatar">${escapeHtml(initials)}</span>` +
    `<span class="who">${escapeHtml(c.author.name)}</span>` +
    (device ? `<span class="device" title="Captured on ${escapeAttr(device.title)}">${device.icon} ${escapeHtml(device.kind)}</span>` : "") +
    `<span class="caret">${open ? "▾" : "▸"}</span>` +
    `<span class="when">${fmtTime(c.createdAt)}</span></div>` +
    `<p class="ctitle">${escapeHtml(c.title || firstLine(c.body))}</p>` +
    `<div class="chips">` +
    `<span class="chip prio prio-${prio}" title="Priority">${PRIORITY_LABELS[prio]}</span>` +
    `<span class="chip ctype" title="Change type">${CHANGE_TYPE_LABELS[ctype]}</span>` +
    (c.repo ? `<span class="chip cref" title="Repository${c.branch ? " and branch" : ""}">${escapeHtml(c.repo)}${c.branch ? ` @ ${escapeHtml(c.branch)}` : ""}</span>` : "") +
    `</div>`;

  const detail = document.createElement("div");
  detail.className = "detail";
  detail.innerHTML =
    `<p class="ctext">${escapeHtml(c.body)}</p>` +
    `<span class="target" title="${escapeAttr(target)}">${escapeHtml(target)}</span>` +
    `<span class="page">${escapeHtml(c.url)}</span>`;
  body.appendChild(detail);
  el.appendChild(body);

  // The screenshot already leads the card, so expanding reveals the recording
  // player (and any attachments) rather than repeating the same image.
  if (c.recording) {
    const v = document.createElement("video");
    v.className = "rec";
    v.src = c.recording;
    v.controls = true;
    v.playsInline = true;
    if (c.screenshot) v.poster = c.screenshot;
    detail.appendChild(v);
  }

  // Files the reporter attached (images render as thumbs, videos with a player).
  for (const a of c.attachments ?? []) {
    if (a.kind === "video") {
      const v = document.createElement("video");
      v.className = "rec";
      v.src = a.url;
      v.controls = true;
      v.playsInline = true;
      detail.appendChild(v);
    } else {
      const t = document.createElement("div");
      t.className = "thumb";
      t.title = a.name || "Open attachment";
      t.innerHTML = `<img src="${escapeAttr(a.url)}" alt="${escapeAttr(a.name || "attachment")}" />`;
      t.onclick = () => openImage(a.url);
      detail.appendChild(t);
    }
  }

  if (c.proposal) detail.appendChild(proposalView(c));

  const idx = ORDER.indexOf(normalizeStatus(c.status));
  const actions = document.createElement("div");
  actions.className = "actions";

  const move = document.createElement("div");
  move.className = "move";
  const left = iconBtn("‹", "Move back", idx <= 0, () => setStatus(c, ORDER[idx - 1]!));
  const right = iconBtn("›", "Move forward", idx >= ORDER.length - 1, () => setStatus(c, ORDER[idx + 1]!));
  move.append(left, right);

  const grow = document.createElement("span");
  grow.className = "grow";

  const del = linkBtn("Delete", true, (btn) => {
    if (btn.dataset.armed) { remove(c); return; }
    btn.dataset.armed = "1";
    btn.textContent = "Confirm?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Delete"; }, 3000);
  });

  // Re-triage without opening the card.
  const prioSel = miniSelect(
    "Priority",
    COMMENT_PRIORITIES.map((p) => [p as string, PRIORITY_LABELS[p]] as [string, string]),
    prio,
    (v) => setPriority(c, v as CommentPriority),
  );
  const typeSel = miniSelect(
    "Change type",
    CHANGE_TYPES.map((t) => [t as string, CHANGE_TYPE_LABELS[t]] as [string, string]),
    ctype,
    (v) => setChangeType(c, v as ChangeType),
  );

  // Hand the whole thread to a coding agent in one click — the same package the
  // MCP `get_comment` tool returns, as pasteable Markdown.
  const copy = linkBtn("Copy for agent", false, async (btn) => {
    const ok = await copyText(agentPrompt(c));
    btn.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => { btn.textContent = "Copy for agent"; }, 1800);
  });

  actions.append(move, prioSel, typeSel, grow, copy, del);
  el.appendChild(actions);

  // Clicking the card (but not its controls/media) expands it.
  el.onclick = (e) => {
    if ((e.target as HTMLElement).closest("button, select, video, img, a, details, iframe")) return;
    toggleCard(c.id);
  };
  // Reachable and operable from the keyboard, and announced as a disclosure.
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-expanded", String(open));
  el.setAttribute("aria-label", `Feedback: ${c.title || firstLine(c.body)}`);
  el.onkeydown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if ((e.target as HTMLElement) !== el) return; // let the inner controls keep their keys
    e.preventDefault();
    toggleCard(c.id);
  };
  return el;
}

/** Card density: "compact" hides the thumbnail strip and tightens the padding. */
type Density = "comfortable" | "compact";
const DENSITY_KEY = "loupe_board_density";
let density: Density = "comfortable";

function loadDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function applyDensity() {
  boardEl.dataset.density = density;
  const b = document.getElementById("density");
  if (b) {
    b.textContent = density === "compact" ? "Comfortable" : "Compact";
    b.setAttribute("aria-pressed", String(density === "compact"));
  }
}

/** Expand / collapse a card. */
function toggleCard(id: string) {
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
  render();
}

/**
 * The thread as a self-contained brief for a coding agent — the same context the
 * MCP `get_comment` tool hands over, so the dashboard and MCP agree.
 */
function agentPrompt(c: Comment): string {
  const target = c.kind === "free"
    ? "page-level note (no element)"
    : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath || "—";
  const styles = Object.entries(c.context?.styles ?? {});
  return [
    `# Feedback #${c.id} — ${c.title || firstLine(c.body)}`,
    ``,
    `- **Stage:** ${STAGE_LABELS[normalizeStatus(c.status)]}`,
    `- **Priority:** ${PRIORITY_LABELS[normalizePriority(c.priority)]}`,
    `- **Change type:** ${CHANGE_TYPE_LABELS[normalizeChangeType(c.changeType)]}`,
    c.repo ? `- **Repo:** ${c.repo}${c.branch ? ` @ ${c.branch}` : ""}` : ``,
    `- **Page:** ${c.url}`,
    `- **Target:** ${target}`,
    c.screenshot ? `- **Screenshot:** ${c.screenshot}` : ``,
    c.recording ? `- **Recording:** ${c.recording}` : ``,
    ``,
    `## Request`,
    ``,
    c.body,
    ``,
    `## Target element HTML`,
    ``,
    "```html",
    c.context?.html ?? "",
    "```",
    ``,
    `## Computed styles`,
    ``,
    "```json",
    JSON.stringify(Object.fromEntries(styles), null, 2),
    "```",
  ].filter((line) => line !== undefined && line !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Copy text, preferring the async clipboard API with a textarea fallback. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function iconBtn(label: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "iconbtn";
  b.textContent = label;
  b.title = title;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}
function linkBtn(label: string, danger: boolean, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "linkbtn" + (danger ? " danger" : "");
  b.textContent = label;
  b.onclick = () => onClick(b);
  return b;
}

/** A compact labelled `<select>` for the card's action row (priority / change type). */
function miniSelect(
  label: string,
  options: [string, string][],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const s = document.createElement("select");
  s.className = "mini";
  s.title = label;
  s.setAttribute("aria-label", label);
  for (const [v, text] of options) {
    // Built as an element rather than `new Option(...)`, which the test DOM lacks.
    const o = document.createElement("option");
    o.value = v;
    o.textContent = text;
    o.selected = v === value;
    s.append(o);
  }
  s.onchange = () => onChange(s.value);
  return s;
}

async function setPriority(c: Comment, priority: CommentPriority) {
  if (normalizePriority(c.priority) === priority) return;
  const prev = c.priority;
  c.priority = priority; // optimistic
  render();
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ priority }) });
  if (!res.ok) { c.priority = prev; render(); }
}

async function setChangeType(c: Comment, changeType: ChangeType) {
  if (normalizeChangeType(c.changeType) === changeType) return;
  const prev = c.changeType;
  c.changeType = changeType; // optimistic
  render();
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ changeType }) });
  if (!res.ok) { c.changeType = prev; render(); }
}

async function setStatus(c: Comment, status: Status) {
  const prev = c.status;
  c.status = status; // optimistic
  render();
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  if (!res.ok) { c.status = prev; render(); }
}

async function remove(c: Comment) {
  comments = comments.filter((x) => x.id !== c.id); // optimistic
  renderPageFilter(); render();
  await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "DELETE" });
}

/**
 * Claude's proposed UI change for the dev team: notes + before/after + copyable code.
 * The "after" renders in a sandboxed iframe (no scripts) so devs see the result live.
 */
function proposalView(c: Comment): HTMLElement {
  const p = c.proposal!;
  const d = document.createElement("details");
  d.className = "proposal";
  d.open = true;
  const summary = document.createElement("summary");
  summary.innerHTML = `✨ Claude's proposed fix${p.author ? ` <span style="color:var(--ink-3);font-weight:600">· ${escapeHtml(p.author)}</span>` : ""}`;
  d.appendChild(summary);

  const body = document.createElement("div");
  body.className = "pbody";
  if (p.notes) {
    const n = document.createElement("p");
    n.className = "pnotes";
    n.textContent = p.notes;
    body.appendChild(n);
  }

  // Before (original screenshot) → After (live render of the proposed HTML/CSS).
  const compare = document.createElement("div");
  compare.className = "compare";
  const before = document.createElement("div");
  before.innerHTML = `<div class="cap">Before</div>`;
  const bframe = document.createElement("div");
  bframe.className = "frame" + (c.screenshot ? "" : " empty");
  if (c.screenshot) bframe.innerHTML = `<img src="${escapeAttr(c.screenshot)}" alt="before" />`;
  else bframe.textContent = "No screenshot";
  before.appendChild(bframe);

  const after = document.createElement("div");
  after.innerHTML = `<div class="cap">After (preview)</div>`;
  const aframe = document.createElement("div");
  aframe.className = "frame";
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", ""); // render HTML/CSS only — no scripts
  iframe.setAttribute("loading", "lazy");
  iframe.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{margin:8px;font-family:system-ui,sans-serif}${p.css || ""}</style>${p.html || ""}`;
  aframe.appendChild(iframe);
  after.appendChild(aframe);
  compare.append(before, after);
  body.appendChild(compare);

  body.appendChild(codeBlock("HTML", p.html || ""));
  if (p.css) body.appendChild(codeBlock("CSS", p.css));
  d.appendChild(body);
  return d;
}

/** A titled, copyable read-only code block. */
function codeBlock(lang: string, code: string): HTMLElement {
  const wrap = document.createElement("div");
  const head = document.createElement("div");
  head.className = "codehead";
  head.textContent = lang;
  const copy = document.createElement("button");
  copy.className = "copychip";
  copy.textContent = "Copy";
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = "Copied ✓"; setTimeout(() => (copy.textContent = "Copy"), 1500); } catch { /* ignore */ }
  };
  head.appendChild(copy);
  const pre = document.createElement("pre");
  pre.className = "propcode";
  pre.textContent = code;
  wrap.append(head, pre);
  return wrap;
}

function openImage(dataUrl: string) {
  const w = window.open("");
  if (w) w.document.write(`<img src="${dataUrl}" style="max-width:100%">`);
}

// ---- Connect Claude page + navigation ----

const INTEGRATION_ICONS: Record<string, string> = {
  GitHub: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.07-2.67-1.07-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.056 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.76-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.02 2.2-.8 2.2-.8.44 1.1.16 1.9.08 2.1.5.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.28.24.54.72.54 1.46v2.16c0 .21.14.46.55.38A8 8 0 0 0 8 .2z"/></svg>`,
  Slack: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M3.4 10.1a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4zM5.8 3.4a1.6 1.6 0 1 1 1.6-1.6v1.6H5.8zm0 .8a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4zm6.7 1.6a1.6 1.6 0 1 1 1.6 1.6h-1.6V5.8zm-.8 0a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4zm-1.6 6.7a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4z"/></svg>`,
  Telegram: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.7 5.4-1.24 5.85c-.09.41-.34.51-.69.32l-1.9-1.4-.92.88c-.1.1-.19.19-.38.19l.14-1.93 3.5-3.17c.15-.13-.03-.2-.24-.07l-4.32 2.72-1.86-.58c-.4-.13-.41-.4.09-.6l7.26-2.8c.34-.12.63.08.52.6z"/></svg>`,
  Linear: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M.6 9.2a7.4 7.4 0 0 0 6.2 6.2c.3.04.44-.33.22-.55L1.15 9a.33.33 0 0 0-.55.22zM.5 6.9c-.01.13.04.25.13.34l8.13 8.13c.09.09.21.14.34.13a7.4 7.4 0 0 0 1.3-.26c.28-.08.36-.43.15-.63L1.4 5.45c-.2-.2-.55-.13-.63.15-.12.42-.21.86-.26 1.3zM2.05 4c-.1.13-.09.32.03.44l9.48 9.48c.12.12.31.13.44.03.3-.23.58-.48.85-.75.15-.15.15-.4 0-.55L3.35 3.15a.39.39 0 0 0-.55 0c-.27.27-.52.55-.75.85zM4.5 1.9a.35.35 0 0 0-.04.53l9.11 9.11c.16.16.42.13.53-.04A7.4 7.4 0 1 0 4.5 1.9z"/></svg>`,
};

function renderIntegrations() {
  const row = document.getElementById("integrations");
  if (row) row.innerHTML = Object.entries(INTEGRATION_ICONS)
    .map(([name, svg]) => `<span title="${name} — coming soon">${svg}</span>`).join("");
}

function renderConnect() {
  const host = document.getElementById("connect");
  if (!host || host.dataset.ready) return;
  host.dataset.ready = "1";
  const config = JSON.stringify({
    mcpServers: {
      loupe: {
        command: "npx",
        args: ["-y", "@loupekit/mcp"],
        env: { LOUPE_API: API, LOUPE_PROJECT_KEY: PROJECT, LOUPE_ADMIN_KEY: "<your project secret>" },
      },
    },
  }, null, 2);
  host.innerHTML =
    `<div class="chero"><span class="mark"></span><h1>Connect this project to Claude</h1>` +
    `<p class="sub">Loupe hands every pinned comment — with its screenshot, HTML and computed styles — to Claude Code over MCP. Claude rewrites the UI and sends the modified HTML/CSS back here for your dev team.</p></div>` +
    `<ol class="steps">` +
    `<li><div><div class="st">Install the MCP server</div><div class="sd">It ships on npm as <code>@loupekit/mcp</code> — no clone needed.</div></div></li>` +
    `<li><div><div class="st">Add it to your Claude Code config</div><div class="sd">Drop this into your MCP settings, then restart Claude Code:</div>` +
    `<div class="codeblock"><button class="copychip" id="copyCfg">Copy</button>${escapeHtml(config)}</div></div></li>` +
    `<li><div><div class="st">Work the backlog with Claude</div><div class="sd">Ask Claude to <code>list_comments</code>, then <code>get_comment(id)</code> for full context (it even sees the screenshot). After it rewrites the UI it calls <code>propose_change</code> — the result appears on the comment card here, with a live preview.</div></div></li>` +
    `</ol>`;
  const btn = document.getElementById("copyCfg") as HTMLButtonElement | null;
  if (btn) btn.onclick = async () => {
    try { await navigator.clipboard.writeText(config); btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = "Copy"), 1500); } catch { /* ignore */ }
  };
}

let currentPage = localStorage.getItem("loupe_page") === "connect" ? "connect" : "comments";
function setPage(page: string) {
  currentPage = page;
  localStorage.setItem("loupe_page", page);
  document.querySelectorAll<HTMLButtonElement>(".navitem").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  const comments = document.getElementById("page-comments");
  const connect = document.getElementById("page-connect");
  if (comments) comments.hidden = page !== "comments";
  if (connect) connect.hidden = page !== "connect";
  if (page === "connect") renderConnect();
}

// ---- helpers ----
/** First line of the description — the card summary when there is no title. */
function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return (i >= 0 ? s.slice(0, i) : s).trim() || "(no description)";
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }
function deviceBadge(c: Comment): { kind: string; icon: string; title: string } | null {
  const v = c.viewport;
  if (!v || !v.w) return null;
  const kind = v.w < 768 ? "mobile" : v.w < 1024 ? "tablet" : "desktop";
  const icon = kind === "mobile" ? "📱" : kind === "tablet" ? "▦" : "🖥";
  return { kind, icon, title: `${kind} · ${v.w}×${v.h}` };
}

// ---- wire up ----
$<HTMLSelectElement>("#pageFilter").addEventListener("change", (e) => {
  pageFilter = (e.target as HTMLSelectElement).value;
  render();
});
const searchEl = document.getElementById("search") as HTMLInputElement | null;
if (searchEl) searchEl.addEventListener("input", () => { search = searchEl.value; render(); });
const kindEl = document.getElementById("kindFilter") as HTMLSelectElement | null;
if (kindEl) kindEl.addEventListener("change", () => { kindFilter = kindEl.value; render(); });
const deviceEl = document.getElementById("deviceFilter") as HTMLSelectElement | null;
if (deviceEl) deviceEl.addEventListener("change", () => { deviceFilter = deviceEl.value; render(); });
const sortEl = document.getElementById("sortOrder") as HTMLSelectElement | null;
if (sortEl) sortEl.addEventListener("change", () => {
  sortOrder = sortEl.value === "oldest" ? "oldest" : sortEl.value === "priority" ? "priority" : "newest";
  render();
});
const priorityEl = document.getElementById("priorityFilter") as HTMLSelectElement | null;
if (priorityEl) priorityEl.addEventListener("change", () => { priorityFilter = priorityEl.value; render(); });
const typeEl = document.getElementById("typeFilter") as HTMLSelectElement | null;
if (typeEl) typeEl.addEventListener("change", () => { typeFilter = typeEl.value; render(); });
const repoEl = document.getElementById("repoFilter") as HTMLSelectElement | null;
if (repoEl) repoEl.addEventListener("change", () => { repoFilter = repoEl.value; render(); });
const branchEl = document.getElementById("branchFilter") as HTMLSelectElement | null;
if (branchEl) branchEl.addEventListener("change", () => { branchFilter = branchEl.value; render(); });
const viewEl = document.getElementById("viewFilter") as HTMLSelectElement | null;
if (viewEl) viewEl.addEventListener("change", () => {
  view = viewEl.value as View;
  saveView(view);
  render();
});
$("#refresh").addEventListener("click", load);
const densityBtn = document.getElementById("density");
if (densityBtn) densityBtn.addEventListener("click", () => {
  density = density === "compact" ? "comfortable" : "compact";
  try { localStorage.setItem(DENSITY_KEY, density); } catch { /* storage unavailable */ }
  applyDensity();
});
document.querySelectorAll<HTMLButtonElement>(".navitem").forEach((b) =>
  b.addEventListener("click", () => setPage(b.dataset.page || "comments")));
view = loadView();
renderViewFilter();
density = loadDensity();
applyDensity();
renderIntegrations();
setPage(currentPage);
setInterval(load, 4000); // live board
load();
