/**
 * The local activity dashboard.
 *
 * Served by the bridge, opened by a person, and talking to the bridge's own endpoints.
 * Deliberately a single self-contained document with no build step and no dependencies:
 * it has to work when the agent is mid-task and nothing else is running, which is
 * exactly when a broken asset pipeline would be discovered.
 *
 * It is read-only. Nothing here changes agent state, so a stray click cannot affect the
 * work being watched.
 */

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loupe — agent activity</title>
<style>
  :root {
    --bg: #0c0d10; --panel: #14161b; --line: #23262e; --ink: #e8eaef; --muted: #8b91a0;
    --accent: #7c6cf5; --ok: #3ecf8e; --warn: #e0a92c; --err: #f2555a;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f7f8fa; --panel: #fff; --line: #e3e5ea; --ink: #14161b; --muted: #6b7280; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px;
    padding: 14px 20px; border-bottom: 1px solid var(--line); background: var(--bg);
  }
  h1 { font-size: 15px; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .dot.on { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 22%, transparent); }
  .spacer { flex: 1; }
  .stat { text-align: right; }
  .stat b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  main { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; padding: 18px 20px 40px; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 12px; font-weight: 600; }
  .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }
  .row { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: 0; }
  .when { font-family: var(--mono); font-size: 11px; color: var(--muted); flex: none; width: 62px; }
  .type { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); flex: none; }
  .type.tool_use { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .type.tool_result { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
  .type.notification { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
  .type.fail { color: var(--err); border-color: color-mix(in srgb, var(--err) 45%, transparent); }
  .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .bar b { font-family: var(--mono); font-size: 12px; font-weight: 500; width: 120px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar .track { flex: 1; height: 7px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .bar .fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .bar .n { font-family: var(--mono); font-size: 11px; color: var(--muted); width: 26px; text-align: right; flex: none; }
  .file { font-family: var(--mono); font-size: 12px; padding: 3px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sess { padding: 9px 0; border-bottom: 1px solid var(--line); }
  .sess:last-child { border-bottom: 0; }
  .sess .head { display: flex; align-items: center; gap: 8px; }
  .sess .id { font-family: var(--mono); font-size: 12px; }
  .sess .meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); }
  .pill.live { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  footer { padding: 0 20px 24px; color: var(--muted); font-size: 12px; }
  code { font-family: var(--mono); }
</style>
</head>
<body>
<header>
  <h1>Loupe · agent activity</h1>
  <span class="live"><span class="dot" id="dot"></span><span id="link">connecting…</span></span>
  <span class="spacer"></span>
  <span class="stat"><b id="s-tools">0</b><span>tool calls</span></span>
  <span class="stat"><b id="s-files">0</b><span>files</span></span>
  <span class="stat"><b id="s-err" style="color:var(--err)">0</b><span>failures</span></span>
</header>
<main>
  <section class="card">
    <h2>Live timeline</h2>
    <div id="timeline"><div class="empty">Nothing yet. Events appear here as the agent works.</div></div>
  </section>
  <div style="display:grid;gap:18px;align-content:start">
    <section class="card"><h2>Sessions</h2><div id="sessions"><div class="empty">No sessions yet.</div></div></section>
    <section class="card"><h2>Tool usage</h2><div id="tools"><div class="empty">No tool calls yet.</div></div></section>
    <section class="card"><h2>Files touched</h2><div id="files"><div class="empty">No files yet.</div></div></section>
  </div>
</main>
<footer>
  Read-only. Events come from the Claude Code hooks; nothing here changes agent state.
</footer>
<script>
(function () {
  var timeline = document.getElementById("timeline");
  var events = [];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clock(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "--:--:--" : d.toTimeString().slice(0, 8);
  }

  function renderTimeline() {
    timeline.textContent = "";
    if (!events.length) {
      timeline.appendChild(el("div", "empty", "Nothing yet. Events appear here as the agent works."));
      return;
    }
    events.slice(0, 120).forEach(function (e) {
      var row = el("div", "row");
      row.appendChild(el("span", "when", clock(e.at)));
      var failed = e.payload && e.payload.ok === false;
      row.appendChild(el("span", "type " + (failed ? "fail" : e.type), failed ? "failed" : e.type.replace(/_/g, " ")));
      var what = e.summary || e.tool || "";
      if (e.files && e.files.length) what += (what ? " · " : "") + e.files.join(", ");
      row.appendChild(el("span", "what", what));
      row.title = what;
      timeline.appendChild(row);
    });
  }

  function renderSummary(data) {
    document.getElementById("s-tools").textContent = data.totals.tools;
    document.getElementById("s-files").textContent = data.totals.files;
    document.getElementById("s-err").textContent = data.totals.failures;

    var sessions = document.getElementById("sessions");
    sessions.textContent = "";
    if (!data.sessions.length) sessions.appendChild(el("div", "empty", "No sessions yet."));
    data.sessions.slice(0, 5).forEach(function (s) {
      var box = el("div", "sess");
      var head = el("div", "head");
      head.appendChild(el("span", "id", s.id));
      head.appendChild(el("span", "pill" + (s.active ? " live" : ""), s.active ? "live" : "ended"));
      box.appendChild(head);
      box.appendChild(el("div", "meta", s.prompts + " prompts · " + s.tools + " tool calls · " + s.files.length + " files"));
      sessions.appendChild(box);
    });

    var tools = document.getElementById("tools");
    tools.textContent = "";
    if (!data.toolCounts.length) tools.appendChild(el("div", "empty", "No tool calls yet."));
    var max = data.toolCounts.length ? data.toolCounts[0].count : 1;
    data.toolCounts.slice(0, 10).forEach(function (t) {
      var bar = el("div", "bar");
      bar.appendChild(el("b", null, t.tool));
      var track = el("div", "track");
      var fill = el("div", "fill");
      fill.style.width = Math.max(3, Math.round((t.count / max) * 100)) + "%";
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(el("span", "n", String(t.count)));
      tools.appendChild(bar);
    });

    var files = document.getElementById("files");
    files.textContent = "";
    if (!data.files.length) files.appendChild(el("div", "empty", "No files yet."));
    data.files.slice(0, 40).forEach(function (f) {
      files.appendChild(el("div", "file", f));
    });
  }

  function connected(on) {
    document.getElementById("dot").className = "dot" + (on ? " on" : "");
    document.getElementById("link").textContent = on ? "live" : "reconnecting…";
  }

  function poll() {
    fetch("/monitor/api/events?limit=200").then(function (r) { return r.json(); }).then(function (d) {
      events = d.events || [];
      renderTimeline();
      connected(true);
    }).catch(function () { connected(false); });
    fetch("/monitor/api/summary").then(function (r) { return r.json(); }).then(renderSummary).catch(function () {});
  }

  poll();

  // The stream is the point — the poll is only there so a dropped connection still
  // shows something rather than an empty screen.
  try {
    var es = new EventSource("/events");
    es.onopen = function () { connected(true); };
    es.onerror = function () { connected(false); };
    // The bridge names its events ("event: activity"), so they arrive as a named event
    // and onmessage — which is only for unnamed ones — never fires.
    es.addEventListener("activity", function (msg) {
      var ev;
      try { ev = JSON.parse(msg.data); } catch (e) { return; }
      if (ev.data) { events.unshift(ev.data); renderTimeline(); }
      // The headline numbers come from the same aggregation the tools use, so the
      // page cannot disagree with what an agent would be told.
      fetch("/monitor/api/summary").then(function (r) { return r.json(); }).then(renderSummary).catch(function () {});
    });
    setInterval(function () { if (!es || es.readyState !== 1) poll(); }, 5000);
  } catch (e) {
    setInterval(poll, 3000);
  }
})();
</script>
</body>
</html>
`;
