// Loupe feedback board — reads the backend API and renders a Kanban of comments.
// Vanilla TS to match the SDK's zero-framework footprint.
import type { Comment, CommentStatus as Status } from "@loupekit/shared";

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

const COLUMNS: { key: Status; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];
const ORDER: Status[] = ["open", "in_progress", "done"];

let comments: Comment[] = [];
let pageFilter = "";

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

async function load() {
  try {
    const res = await api(`/v1/comments?projectKey=${encodeURIComponent(PROJECT)}`);
    if (res.status === 401 || res.status === 404) {
      throw new Error("AUTH");
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    comments = (await res.json()) as Comment[];
    statusEl.style.display = "none";
    boardEl.style.display = "grid";
    renderPageFilter();
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

function render() {
  $("#project").textContent = PROJECT;
  const visible = comments.filter((c) => !pageFilter || c.url === pageFilter);
  boardEl.innerHTML = "";
  for (const col of COLUMNS) {
    const items = visible
      .filter((c) => c.status === col.key)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const colEl = document.createElement("section");
    colEl.className = `col ${col.key}`;
    colEl.innerHTML =
      `<div class="col-head"><span class="swatch"></span><h2>${col.label}</h2><span class="n">${items.length}</span></div>`;
    const stack = document.createElement("div");
    stack.className = "stack";
    if (!items.length) {
      const e = document.createElement("div");
      e.className = "col-empty";
      e.textContent = col.key === "open" ? "No open feedback" : "Nothing here";
      stack.appendChild(e);
    } else {
      items.forEach((c) => stack.appendChild(card(c)));
    }
    colEl.appendChild(stack);
    boardEl.appendChild(colEl);
  }
}

function card(c: Comment): HTMLElement {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = c.id;

  const target = c.kind === "free"
    ? "Free note · page-level"
    : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath || "—";
  const initials = c.author.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const device = deviceBadge(c);

  const body = document.createElement("div");
  body.className = "cbody";
  body.innerHTML =
    `<div class="row1"><span class="avatar">${escapeHtml(initials)}</span>` +
    `<span class="who">${escapeHtml(c.author.name)}</span>` +
    (device ? `<span class="device" title="Captured on ${escapeAttr(device.title)}">${device.icon} ${escapeHtml(device.kind)}</span>` : "") +
    `<span class="when">${fmtTime(c.createdAt)}</span></div>` +
    `<p class="ctext">${escapeHtml(c.body)}</p>` +
    `<span class="target" title="${escapeAttr(target)}">${escapeHtml(target)}</span>` +
    `<span class="page">${escapeHtml(c.url)}</span>`;
  el.appendChild(body);

  if (c.screenshot) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.title = "Open full screenshot";
    t.innerHTML = `<img src="${c.screenshot}" alt="screenshot of the commented element" />`;
    t.onclick = () => openImage(c.screenshot!);
    el.appendChild(t);
  }

  const idx = ORDER.indexOf(c.status);
  const actions = document.createElement("div");
  actions.className = "actions";

  const move = document.createElement("div");
  move.className = "move";
  const left = iconBtn("‹", "Move back", idx <= 0, () => setStatus(c, ORDER[idx - 1]!));
  const right = iconBtn("›", "Move forward", idx >= ORDER.length - 1, () => setStatus(c, ORDER[idx + 1]!));
  move.append(left, right);

  const grow = document.createElement("span");
  grow.className = "grow";

  const copy = linkBtn("Copy for Claude", false, async (btn) => {
    await copyForClaude(c);
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = "Copy for Claude"), 1500);
  });

  const del = linkBtn("Delete", true, (btn) => {
    if (btn.dataset.armed) { remove(c); return; }
    btn.dataset.armed = "1";
    btn.textContent = "Confirm?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Delete"; }, 3000);
  });

  actions.append(move, grow, copy, del);
  el.appendChild(actions);
  return el;
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

async function copyForClaude(c: Comment) {
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
      `**Request:** ${c.body}`,
      `**Page:** ${c.url}`,
      `**Target element:** \`${c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath}\``,
      ``,
      `## Target element HTML`,
      "```html",
      c.context.html,
      "```",
      ``,
      `## Computed styles`,
      "```json",
      JSON.stringify(c.context.styles, null, 2),
      "```",
    ];
  const prompt = lines.join("\n");
  try { await navigator.clipboard.writeText(prompt); } catch { console.log(prompt); }
}

function openImage(dataUrl: string) {
  const w = window.open("");
  if (w) w.document.write(`<img src="${dataUrl}" style="max-width:100%">`);
}

// ---- helpers ----
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
$("#refresh").addEventListener("click", load);
setInterval(load, 4000); // live board
load();
