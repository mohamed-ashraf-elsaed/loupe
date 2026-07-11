// app.ts
var injected = window.__LOUPE__;
var params = new URLSearchParams(location.search);
var API = (injected?.api || params.get("api") || location.origin).replace(/\/$/, "");
var PROJECT = injected?.project || params.get("project") || "pk_demo_acme";
var CSRF = injected?.csrf || "";
var ADMIN = params.get("key") || localStorage.getItem("loupe_admin") || "";
if (params.get("key")) localStorage.setItem("loupe_admin", params.get("key"));
var COLUMNS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" }
];
var ORDER = ["open", "in_progress", "done"];
var comments = [];
var pageFilter = "";
var $ = (sel) => document.querySelector(sel);
var boardEl = $("#board");
var statusEl = $("#status");
async function api(path, init) {
  const headers = { "Content-Type": "application/json", ...init?.headers };
  if (ADMIN) headers["X-Loupe-Admin"] = ADMIN;
  if (CSRF) headers["X-CSRF-TOKEN"] = CSRF;
  const credentials = CSRF ? "same-origin" : void 0;
  return fetch(`${API}${path}`, { ...init, headers, ...credentials ? { credentials } : {} });
}
async function load() {
  try {
    const res = await api(`/v1/comments?projectKey=${encodeURIComponent(PROJECT)}`);
    if (res.status === 401 || res.status === 404) {
      throw new Error("AUTH");
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    comments = await res.json();
    statusEl.style.display = "none";
    boardEl.style.display = "grid";
    renderPageFilter();
    render();
  } catch (err) {
    boardEl.style.display = "none";
    statusEl.style.display = "block";
    statusEl.className = "error";
    statusEl.textContent = err.message === "AUTH" ? CSRF ? `You don't have access to this dashboard.` : `Not authorized. Open this page with ?key=<project secret> (from \`npm run seed\`).` : `Can't reach the API at ${API}. Is the backend running? (${err.message})`;
  }
}
function renderPageFilter() {
  const sel = $("#pageFilter");
  const pages = Array.from(new Set(comments.map((c) => c.url))).sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">All pages (${comments.length})</option>` + pages.map((p) => {
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
    const items = visible.filter((c) => c.status === col.key).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const colEl = document.createElement("section");
    colEl.className = `col ${col.key}`;
    colEl.innerHTML = `<div class="col-head"><span class="swatch"></span><h2>${col.label}</h2><span class="n">${items.length}</span></div>`;
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
function card(c) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = c.id;
  const target = c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath || "\u2014";
  const initials = c.author.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const body = document.createElement("div");
  body.className = "cbody";
  body.innerHTML = `<div class="row1"><span class="avatar">${escapeHtml(initials)}</span><span class="who">${escapeHtml(c.author.name)}</span><span class="when">${fmtTime(c.createdAt)}</span></div><p class="ctext">${escapeHtml(c.body)}</p><span class="target" title="${escapeAttr(target)}">${escapeHtml(target)}</span><span class="page">${escapeHtml(c.url)}</span>`;
  el.appendChild(body);
  if (c.screenshot) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.title = "Open full screenshot";
    t.innerHTML = `<img src="${c.screenshot}" alt="screenshot of the commented element" />`;
    t.onclick = () => openImage(c.screenshot);
    el.appendChild(t);
  }
  const idx = ORDER.indexOf(c.status);
  const actions = document.createElement("div");
  actions.className = "actions";
  const move = document.createElement("div");
  move.className = "move";
  const left = iconBtn("\u2039", "Move back", idx <= 0, () => setStatus(c, ORDER[idx - 1]));
  const right = iconBtn("\u203A", "Move forward", idx >= ORDER.length - 1, () => setStatus(c, ORDER[idx + 1]));
  move.append(left, right);
  const grow = document.createElement("span");
  grow.className = "grow";
  const copy = linkBtn("Copy for Claude", false, async (btn) => {
    await copyForClaude(c);
    btn.textContent = "Copied \u2713";
    setTimeout(() => btn.textContent = "Copy for Claude", 1500);
  });
  const del = linkBtn("Delete", true, (btn) => {
    if (btn.dataset.armed) {
      remove(c);
      return;
    }
    btn.dataset.armed = "1";
    btn.textContent = "Confirm?";
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = "Delete";
    }, 3e3);
  });
  actions.append(move, grow, copy, del);
  el.appendChild(actions);
  return el;
}
function iconBtn(label, title, disabled, onClick) {
  const b = document.createElement("button");
  b.className = "iconbtn";
  b.textContent = label;
  b.title = title;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}
function linkBtn(label, danger, onClick) {
  const b = document.createElement("button");
  b.className = "linkbtn" + (danger ? " danger" : "");
  b.textContent = label;
  b.onclick = () => onClick(b);
  return b;
}
async function setStatus(c, status) {
  const prev = c.status;
  c.status = status;
  render();
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  if (!res.ok) {
    c.status = prev;
    render();
  }
}
async function remove(c) {
  comments = comments.filter((x) => x.id !== c.id);
  renderPageFilter();
  render();
  await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: "DELETE" });
}
async function copyForClaude(c) {
  const target = c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath;
  const prompt = [
    `# Product feedback from ${c.author.name}`,
    ``,
    `**Request:** ${c.body}`,
    `**Page:** ${c.url}`,
    `**Target element:** \`${target}\``,
    ``,
    `## Target element HTML`,
    "```html",
    c.context.html,
    "```",
    ``,
    `## Computed styles`,
    "```json",
    JSON.stringify(c.context.styles, null, 2),
    "```"
  ].join("\n");
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    console.log(prompt);
  }
}
function openImage(dataUrl) {
  const w = window.open("");
  if (w) w.document.write(`<img src="${dataUrl}" style="max-width:100%">`);
}
function fmtTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1e3;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
$("#pageFilter").addEventListener("change", (e) => {
  pageFilter = e.target.value;
  render();
});
$("#refresh").addEventListener("click", load);
setInterval(load, 4e3);
load();
//# sourceMappingURL=app.js.map