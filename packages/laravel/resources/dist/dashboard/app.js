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
  const target = c.kind === "free" ? "Free note \xB7 page-level" : c.anchor.testid ? `[data-testid="${c.anchor.testid}"]` : c.anchor.cssPath || "\u2014";
  const initials = c.author.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const device = deviceBadge(c);
  const body = document.createElement("div");
  body.className = "cbody";
  body.innerHTML = `<div class="row1"><span class="avatar">${escapeHtml(initials)}</span><span class="who">${escapeHtml(c.author.name)}</span>` + (device ? `<span class="device" title="Captured on ${escapeAttr(device.title)}">${device.icon} ${escapeHtml(device.kind)}</span>` : "") + `<span class="when">${fmtTime(c.createdAt)}</span></div><p class="ctext">${escapeHtml(c.body)}</p><span class="target" title="${escapeAttr(target)}">${escapeHtml(target)}</span><span class="page">${escapeHtml(c.url)}</span>`;
  el.appendChild(body);
  if (c.recording) {
    const v = document.createElement("video");
    v.className = "rec";
    v.src = c.recording;
    v.controls = true;
    v.playsInline = true;
    if (c.screenshot) v.poster = c.screenshot;
    el.appendChild(v);
  } else if (c.screenshot) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.title = "Open full screenshot";
    t.innerHTML = `<img src="${c.screenshot}" alt="screenshot of the commented element" />`;
    t.onclick = () => openImage(c.screenshot);
    el.appendChild(t);
  }
  if (c.proposal) el.appendChild(proposalView(c));
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
  const lines = c.kind === "free" ? [
    `# Product feedback from ${c.author.name}`,
    ``,
    `**Note:** ${c.body}`,
    `**Page:** ${c.url}`,
    `**Type:** Free note \u2014 a page-level comment not tied to a specific element.`
  ] : [
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
    "```"
  ];
  const prompt = lines.join("\n");
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    console.log(prompt);
  }
}
function proposalView(c) {
  const p = c.proposal;
  const d = document.createElement("details");
  d.className = "proposal";
  d.open = true;
  const summary = document.createElement("summary");
  summary.innerHTML = `\u2728 Claude's proposed fix${p.author ? ` <span style="color:var(--ink-3);font-weight:600">\xB7 ${escapeHtml(p.author)}</span>` : ""}`;
  d.appendChild(summary);
  const body = document.createElement("div");
  body.className = "pbody";
  if (p.notes) {
    const n = document.createElement("p");
    n.className = "pnotes";
    n.textContent = p.notes;
    body.appendChild(n);
  }
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
  iframe.setAttribute("sandbox", "");
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
function codeBlock(lang, code) {
  const wrap = document.createElement("div");
  const head = document.createElement("div");
  head.className = "codehead";
  head.textContent = lang;
  const copy = document.createElement("button");
  copy.className = "copychip";
  copy.textContent = "Copy";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = "Copied \u2713";
      setTimeout(() => copy.textContent = "Copy", 1500);
    } catch {
    }
  };
  head.appendChild(copy);
  const pre = document.createElement("pre");
  pre.className = "propcode";
  pre.textContent = code;
  wrap.append(head, pre);
  return wrap;
}
function openImage(dataUrl) {
  const w = window.open("");
  if (w) w.document.write(`<img src="${dataUrl}" style="max-width:100%">`);
}
var INTEGRATION_ICONS = {
  GitHub: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.07-2.67-1.07-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.056 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.76-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.02 2.2-.8 2.2-.8.44 1.1.16 1.9.08 2.1.5.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.28.24.54.72.54 1.46v2.16c0 .21.14.46.55.38A8 8 0 0 0 8 .2z"/></svg>`,
  Slack: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M3.4 10.1a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 0 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4zM5.8 3.4a1.6 1.6 0 1 1 1.6-1.6v1.6H5.8zm0 .8a1.6 1.6 0 0 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4zm6.7 1.6a1.6 1.6 0 1 1 1.6 1.6h-1.6V5.8zm-.8 0a1.6 1.6 0 0 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4zm-1.6 6.7a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 0 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4z"/></svg>`,
  Telegram: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.7 5.4-1.24 5.85c-.09.41-.34.51-.69.32l-1.9-1.4-.92.88c-.1.1-.19.19-.38.19l.14-1.93 3.5-3.17c.15-.13-.03-.2-.24-.07l-4.32 2.72-1.86-.58c-.4-.13-.41-.4.09-.6l7.26-2.8c.34-.12.63.08.52.6z"/></svg>`,
  Linear: `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M.6 9.2a7.4 7.4 0 0 0 6.2 6.2c.3.04.44-.33.22-.55L1.15 9a.33.33 0 0 0-.55.22zM.5 6.9c-.01.13.04.25.13.34l8.13 8.13c.09.09.21.14.34.13a7.4 7.4 0 0 0 1.3-.26c.28-.08.36-.43.15-.63L1.4 5.45c-.2-.2-.55-.13-.63.15-.12.42-.21.86-.26 1.3zM2.05 4c-.1.13-.09.32.03.44l9.48 9.48c.12.12.31.13.44.03.3-.23.58-.48.85-.75.15-.15.15-.4 0-.55L3.35 3.15a.39.39 0 0 0-.55 0c-.27.27-.52.55-.75.85zM4.5 1.9a.35.35 0 0 0-.04.53l9.11 9.11c.16.16.42.13.53-.04A7.4 7.4 0 1 0 4.5 1.9z"/></svg>`
};
function renderIntegrations() {
  const row = document.getElementById("integrations");
  if (row) row.innerHTML = Object.entries(INTEGRATION_ICONS).map(([name, svg]) => `<span title="${name} \u2014 coming soon">${svg}</span>`).join("");
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
        env: { LOUPE_API: API, LOUPE_PROJECT_KEY: PROJECT, LOUPE_ADMIN_KEY: "<your project secret>" }
      }
    }
  }, null, 2);
  host.innerHTML = `<div class="chero"><span class="mark"></span><h1>Connect this project to Claude</h1><p class="sub">Loupe hands every pinned comment \u2014 with its screenshot, HTML and computed styles \u2014 to Claude Code over MCP. Claude rewrites the UI and sends the modified HTML/CSS back here for your dev team.</p></div><ol class="steps"><li><div><div class="st">Install the MCP server</div><div class="sd">It ships on npm as <code>@loupekit/mcp</code> \u2014 no clone needed.</div></div></li><li><div><div class="st">Add it to your Claude Code config</div><div class="sd">Drop this into your MCP settings, then restart Claude Code:</div><div class="codeblock"><button class="copychip" id="copyCfg">Copy</button>${escapeHtml(config)}</div></div></li><li><div><div class="st">Work the backlog with Claude</div><div class="sd">Ask Claude to <code>list_comments</code>, then <code>get_comment(id)</code> for full context (it even sees the screenshot). After it rewrites the UI it calls <code>propose_change</code> \u2014 the result appears on the comment card here, with a live preview.</div></div></li></ol>`;
  const btn = document.getElementById("copyCfg");
  if (btn) btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(config);
      btn.textContent = "Copied \u2713";
      setTimeout(() => btn.textContent = "Copy", 1500);
    } catch {
    }
  };
}
var currentPage = localStorage.getItem("loupe_page") === "connect" ? "connect" : "comments";
function setPage(page) {
  currentPage = page;
  localStorage.setItem("loupe_page", page);
  document.querySelectorAll(".navitem").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  const comments2 = document.getElementById("page-comments");
  const connect = document.getElementById("page-connect");
  if (comments2) comments2.hidden = page !== "comments";
  if (connect) connect.hidden = page !== "connect";
  if (page === "connect") renderConnect();
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
function deviceBadge(c) {
  const v = c.viewport;
  if (!v || !v.w) return null;
  const kind = v.w < 768 ? "mobile" : v.w < 1024 ? "tablet" : "desktop";
  const icon = kind === "mobile" ? "\u{1F4F1}" : kind === "tablet" ? "\u25A6" : "\u{1F5A5}";
  return { kind, icon, title: `${kind} \xB7 ${v.w}\xD7${v.h}` };
}
$("#pageFilter").addEventListener("change", (e) => {
  pageFilter = e.target.value;
  render();
});
$("#refresh").addEventListener("click", load);
document.querySelectorAll(".navitem").forEach((b) => b.addEventListener("click", () => setPage(b.dataset.page || "comments")));
renderIntegrations();
setPage(currentPage);
setInterval(load, 4e3);
load();
//# sourceMappingURL=app.js.map