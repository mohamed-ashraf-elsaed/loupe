<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="{{ csrf_token() }}" />
  <title>Loupe — Feedback board</title>
  @verbatim
  <style>
    :root {
      --accent: #4a55d6; --accent-ink: #3742b8; --pin: #ff5842;
      --ground: #f5f6fa; --surface: #ffffff; --surface-2: #eef0f6;
      --line: #e2e5ee; --line-strong: #d3d8e4;
      --ink: #16181f; --ink-2: #545a6b; --ink-3: #868ca0;
      --open: #5b6472; --prog: #b5820b; --done: #10935a;
      /* Five-stage board swatches — distinct hues so the columns read apart at a glance. */
      --stage-queue: #5b6472; --stage-todo: #6d4bd0; --stage-prog: #b5820b; --stage-review: #0d7f9c; --stage-done: #10935a;
      --shadow: 0 1px 2px rgba(20,24,40,.05), 0 6px 20px rgba(20,24,40,.06);
      --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --ground: #0d0e13; --surface: #14161d; --surface-2: #1b1e27;
        --line: #262a35; --line-strong: #363b49;
        --ink: #e9ebf1; --ink-2: #a9afc0; --ink-3: #6e7486;
        --accent: #7d88f0; --accent-ink: #aab2f7;
        --open: #8891a3; --prog: #e0a92c; --done: #34c281;
        --stage-queue: #8891a3; --stage-todo: #a58bf5; --stage-prog: #e0a92c; --stage-review: #35b6d6; --stage-done: #34c281;
        --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
      }
    }
    :root[data-theme="light"] {
      --ground: #f5f6fa; --surface: #ffffff; --surface-2: #eef0f6; --line: #e2e5ee;
      --line-strong: #d3d8e4; --ink: #16181f; --ink-2: #545a6b; --ink-3: #868ca0;
      --accent: #4a55d6; --accent-ink: #3742b8; --open: #5b6472; --prog: #b5820b; --done: #10935a;
      --stage-queue: #5b6472; --stage-todo: #6d4bd0; --stage-prog: #b5820b; --stage-review: #0d7f9c; --stage-done: #10935a;
      --shadow: 0 1px 2px rgba(20,24,40,.05), 0 6px 20px rgba(20,24,40,.06);
    }
    :root[data-theme="dark"] {
      --ground: #0d0e13; --surface: #14161d; --surface-2: #1b1e27; --line: #262a35;
      --line-strong: #363b49; --ink: #e9ebf1; --ink-2: #a9afc0; --ink-3: #6e7486;
      --accent: #7d88f0; --accent-ink: #aab2f7; --open: #8891a3; --prog: #e0a92c; --done: #34c281;
      --stage-queue: #8891a3; --stage-todo: #a58bf5; --stage-prog: #e0a92c; --stage-review: #35b6d6; --stage-done: #34c281;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
    }

    * { box-sizing: border-box; }
    body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--sans); -webkit-font-smoothing: antialiased; }

    header.top {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      padding: 14px 24px; background: var(--surface); border-bottom: 1px solid var(--line);
      position: sticky; top: 0; z-index: 10;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 750; letter-spacing: -.02em; font-size: 16px; }
    .brand .mark { width: 22px; height: 22px; border-radius: 6px; background: var(--accent); position: relative; }
    .brand .mark::after { content:""; position:absolute; width:8px; height:8px; border:2.5px solid #fff; border-radius:50%; top:4px; left:4px; }
    .brand .mark::before { content:""; position:absolute; width:3px; height:7px; background:var(--pin); border-radius:2px; bottom:2px; right:4px; transform:rotate(35deg); }
    .project { font-family: var(--mono); font-size: 12px; color: var(--ink-2); background: var(--surface-2); padding: 4px 9px; border-radius: 6px; }
    .spacer { flex: 1; }
    .control { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--ink-2); }
    select, button.btn {
      font-family: var(--sans); font-size: 13px; color: var(--ink); background: var(--surface);
      border: 1px solid var(--line-strong); border-radius: 8px; padding: 7px 10px; cursor: pointer;
    }
    button.btn:hover { border-color: var(--accent); }
    .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-3); }
    .live .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--done); box-shadow: 0 0 0 0 rgba(16,147,90,.5); animation: pulse 2s infinite; }
    @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(16,147,90,.4)} 70%{box-shadow:0 0 0 6px rgba(16,147,90,0)} 100%{box-shadow:0 0 0 0 rgba(16,147,90,0)} }
    @media (prefers-reduced-motion: reduce) { .live .dot { animation: none; } }

    main { padding: 20px 24px 60px; }
    .board { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 16px; align-items: start; }
    @media (max-width: 1280px) { .board { grid-template-columns: repeat(3, minmax(0,1fr)); } }
    @media (max-width: 860px) { .board { grid-template-columns: 1fr; } }

    .col { background: transparent; }
    .col-head { display: flex; align-items: center; gap: 8px; padding: 4px 6px 12px; }
    .col-head .swatch { width: 10px; height: 10px; border-radius: 3px; }
    .col-head h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; margin: 0; font-weight: 700; }
    .col-head .n { font-family: var(--mono); font-size: 12px; color: var(--ink-3); background: var(--surface-2); padding: 1px 8px; border-radius: 999px; }
    .col.stage-queue .swatch { background: var(--stage-queue); } .col.stage-todo .swatch { background: var(--stage-todo); } .col.stage-in_progress .swatch { background: var(--stage-prog); } .col.stage-in_review .swatch { background: var(--stage-review); } .col.stage-resolved .swatch { background: var(--stage-done); }
    .stack { display: flex; flex-direction: column; gap: 12px; min-height: 60px; }
    .col-empty { border: 1.5px dashed var(--line-strong); border-radius: 12px; padding: 20px; text-align: center; color: var(--ink-3); font-size: 13px; }

    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
    .card .cbody { padding: 12px 13px; }
    .card .row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
    .who { font-size: 12.5px; font-weight: 600; }
    .when { font-size: 11px; color: var(--ink-3); margin-left: auto; font-variant-numeric: tabular-nums; }
    .device { font-size: 10.5px; color: var(--ink-2); background: var(--surface-2); border-radius: 999px; padding: 1px 8px; margin-left: 6px; white-space: nowrap; }
    .ctext { font-size: 14px; line-height: 1.45; margin: 0 0 10px; }
    .target { font-family: var(--mono); font-size: 11px; color: var(--accent-ink); background: var(--surface-2); border-radius: 6px; padding: 5px 8px; display: block; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .page { font-size: 11px; color: var(--ink-3); font-family: var(--mono); }
    .thumb { display: block; width: 100%; border-top: 1px solid var(--line); background: var(--surface-2); cursor: zoom-in; }
    .thumb img { display: block; width: 100%; max-height: 150px; object-fit: cover; object-position: top; }
    .actions { display: flex; align-items: center; gap: 6px; padding: 9px 11px; border-top: 1px solid var(--line); background: var(--surface); }
    .actions .move { display: flex; gap: 4px; }
    .iconbtn { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2); border-radius: 7px; width: 30px; height: 28px; font-size: 13px; cursor: pointer; display:grid; place-items:center; }
    .iconbtn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-ink); }
    .iconbtn:disabled { opacity: .35; cursor: default; }
    .actions .grow { flex: 1; }
    .linkbtn { border: 0; background: none; color: var(--accent-ink); font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
    .linkbtn:hover { background: var(--surface-2); }
    .linkbtn.danger { color: var(--pin); }
    /* Priority + change-type chips on the card face. */
    .chips { display: flex; align-items: center; gap: 6px; margin-top: 7px; }
    .chip { font-size: 10.5px; font-weight: 700; letter-spacing: .02em; border-radius: 999px; padding: 2px 8px; white-space: nowrap; background: var(--surface-2); color: var(--ink-2); }
    .chip.prio-critical { background: #fde7e4; color: #b3261e; }
    .chip.prio-high { background: #fdeedc; color: #a2570a; }
    .chip.prio-medium { background: #e8ecfb; color: #3742b8; }
    .chip.prio-low { background: var(--surface-2); color: var(--ink-3); }
    /* Compact selects in the card's action row. */
    select.mini {
      font-size: 11.5px; padding: 5px 6px; border-radius: 7px;
      border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2);
    }
    select.mini:hover { border-color: var(--accent); }
    @media (prefers-color-scheme: dark) {
      .chip.prio-critical { background: #3a1a19; color: #ff9a90; }
      .chip.prio-high { background: #372312; color: #f0b76a; }
      .chip.prio-medium { background: #1e2440; color: #aab2f7; }
    }
    :root[data-theme="dark"] .chip.prio-critical { background: #3a1a19; color: #ff9a90; }
    :root[data-theme="dark"] .chip.prio-high { background: #372312; color: #f0b76a; }
    :root[data-theme="dark"] .chip.prio-medium { background: #1e2440; color: #aab2f7; }

    /* ---- search + filters ---- */
    .top .search {
      font-family: var(--sans); font-size: 13px; color: var(--ink); background: var(--surface);
      border: 1px solid var(--line-strong); border-radius: 8px; padding: 7px 10px; min-width: 220px; outline: none;
    }
    .top .search:focus { border-color: var(--accent); }

    /* ---- collapsible cards: a title summary + a hidden detail ---- */
    .card { cursor: pointer; }
    .ctitle { font-size: 14px; font-weight: 700; line-height: 1.4; margin: 0 0 6px; }
    .caret { color: var(--ink-3); font-size: 11px; margin-left: 4px; }
    .card.collapsed .detail { display: none; }

    .loading, .error { padding: 40px; text-align: center; color: var(--ink-3); }
    .error { color: var(--pin); }

    /* ---- app shell: sidebar + content ---- */
    .shell { display: flex; align-items: stretch; min-height: 100vh; }
    .sidebar {
      width: 216px; flex: none; background: var(--surface); border-right: 1px solid var(--line);
      padding: 16px 12px; position: sticky; top: 0; height: 100vh;
      display: flex; flex-direction: column; gap: 4px;
    }
    .sidebar .brand { padding: 6px 8px 14px; }
    .nav { display: flex; flex-direction: column; gap: 4px; }
    .navitem {
      display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; border: 0;
      background: transparent; color: var(--ink-2); font: inherit; font-size: 13px; font-weight: 600;
      padding: 9px 10px; border-radius: 8px; cursor: pointer;
    }
    .navitem:hover { background: var(--surface-2); color: var(--ink); }
    .navitem.on { background: var(--surface-2); color: var(--accent-ink); }
    .navitem .ni { width: 16px; height: 16px; flex: none; display: grid; place-items: center; }
    .sidebar .sidefoot { margin-top: auto; padding: 12px 8px 4px; }
    .sidefoot .ilabel { font-size: 10px; letter-spacing: .12em; color: var(--ink-3); font-weight: 700; margin-bottom: 8px; }
    .sidefoot .irow { display: flex; gap: 12px; color: var(--ink-3); }
    .sidefoot .irow svg { display: block; }
    .content { flex: 1; min-width: 0; }
    .page[hidden] { display: none; }

    /* ---- connect-claude page ---- */
    .connect { max-width: 760px; margin: 0 auto; padding: 32px 24px 60px; }
    .connect .chero { text-align: center; margin-bottom: 28px; }
    .connect .chero .mark { width: 40px; height: 40px; margin: 0 auto 12px; }
    .connect h1 { font-size: 24px; letter-spacing: -.02em; margin: 0 0 8px; }
    .connect .sub { color: var(--ink-2); font-size: 14px; line-height: 1.5; margin: 0 auto; max-width: 520px; }
    .steps { list-style: none; counter-reset: s; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
    .steps li { display: grid; grid-template-columns: 30px 1fr; gap: 12px; }
    .steps li::before {
      counter-increment: s; content: counter(s); width: 26px; height: 26px; border-radius: 50%;
      background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; display: grid; place-items: center;
    }
    .steps .st { font-size: 14px; font-weight: 700; }
    .steps .sd { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin-top: 3px; }
    .codeblock {
      position: relative; margin-top: 10px; background: var(--surface-2); border: 1px solid var(--line);
      border-radius: 10px; padding: 12px 14px; font-family: var(--mono); font-size: 12px; line-height: 1.5;
      color: var(--ink); white-space: pre; overflow-x: auto;
    }
    .copychip {
      position: absolute; top: 8px; right: 8px; font-size: 11px; font-weight: 600; cursor: pointer;
      border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2);
      border-radius: 6px; padding: 3px 8px;
    }
    .copychip:hover { border-color: var(--accent); color: var(--accent-ink); }

    /* ---- recording video + proposal in a card ---- */
    .card video.rec { display: block; width: 100%; max-height: 220px; background: #000; border-top: 1px solid var(--line); }
    .proposal { border-top: 1px solid var(--line); }
    .proposal > summary {
      list-style: none; cursor: pointer; padding: 9px 13px; font-size: 12.5px; font-weight: 700;
      color: var(--accent-ink); display: flex; align-items: center; gap: 6px;
    }
    .proposal > summary::-webkit-details-marker { display: none; }
    .proposal > summary::after { content: "▸"; margin-left: auto; font-size: 10px; color: var(--ink-3); }
    .proposal[open] > summary::after { content: "▾"; }
    .proposal .pbody { padding: 0 13px 13px; }
    .pnotes { font-size: 12.5px; color: var(--ink-2); line-height: 1.45; margin: 0 0 10px; }
    .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
    @media (max-width: 520px) { .compare { grid-template-columns: 1fr; } }
    .compare .cap { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); font-weight: 700; margin-bottom: 4px; }
    .compare .frame { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--surface-2); height: 150px; }
    .compare .frame img, .compare .frame iframe { width: 100%; height: 100%; border: 0; object-fit: cover; object-position: top; background: #fff; }
    .compare .frame.empty { display: grid; place-items: center; color: var(--ink-3); font-size: 11px; }
    .codehead { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); font-weight: 700; margin: 8px 0 4px; display: flex; align-items: center; gap: 8px; }
    .propcode { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font-family: var(--mono); font-size: 11px; line-height: 1.45; color: var(--ink); white-space: pre; overflow-x: auto; margin: 0; max-height: 200px; overflow-y: auto; }

    @media (max-width: 720px) {
      .shell { flex-direction: column; }
      .sidebar { width: auto; height: auto; position: static; flex-direction: row; align-items: center; gap: 8px; overflow-x: auto; }
      .sidebar .brand { padding: 6px 8px; }
      .nav { flex-direction: row; }
      .sidebar .sidefoot { display: none; }
    }
  </style>
  @endverbatim
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="mark"></span> Loupe</div>
      <nav class="nav">
        <button class="navitem on" data-page="comments"><span class="ni">▤</span> Comments</button>
        <button class="navitem" data-page="connect"><span class="ni">◎</span> Connect Claude</button>
      </nav>
      <div class="sidefoot">
        <div class="ilabel">INTEGRATES WITH</div>
        <div class="irow" id="integrations"></div>
      </div>
    </aside>

    <div class="content">
      <section class="page" id="page-comments">
        <header class="top">
          <span class="project" id="project">—</span>
          <input id="search" class="search" type="search" placeholder="Search title, text, author…" />
          <span class="spacer"></span>
          <label class="control">View
            <select id="viewFilter"></select>
          </label>
          <label class="control">Page
            <select id="pageFilter"><option value="">All pages</option></select>
          </label>
          <label class="control">Repo
            <select id="repoFilter"><option value="">All repos</option></select>
          </label>
          <label class="control">Branch
            <select id="branchFilter"><option value="">All branches</option></select>
          </label>
          <label class="control">Kind
            <select id="kindFilter">
              <option value="">All</option>
              <option value="element">Element</option>
              <option value="region">Region</option>
              <option value="free">Note</option>
            </select>
          </label>
          <label class="control">Device
            <select id="deviceFilter">
              <option value="">All</option>
              <option value="desktop">Desktop</option>
              <option value="tablet">Tablet</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <label class="control">Priority
            <select id="priorityFilter">
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="control">Type
            <select id="typeFilter">
              <option value="">All</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="api">API</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label class="control">Sort
            <select id="sortOrder">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <span class="live"><span class="dot"></span><span id="liveText">live</span></span>
          <button class="btn" id="refresh">Refresh</button>
        </header>
        <main>
          <div id="board" class="board"></div>
          <div id="status" class="loading">Loading feedback…</div>
        </main>
      </section>

      <section class="page" id="page-connect" hidden>
        <div class="connect" id="connect"></div>
      </section>
    </div>
  </div>

  <script>
    window.__LOUPE__ = {
      api: @json($api),
      project: @json($project),
      csrf: @json(csrf_token()),
    };
  </script>
  <script type="module" src="{{ $appSrc }}"></script>
</body>
</html>
