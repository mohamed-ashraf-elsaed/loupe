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
        --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
      }
    }
    :root[data-theme="light"] {
      --ground: #f5f6fa; --surface: #ffffff; --surface-2: #eef0f6; --line: #e2e5ee;
      --line-strong: #d3d8e4; --ink: #16181f; --ink-2: #545a6b; --ink-3: #868ca0;
      --accent: #4a55d6; --accent-ink: #3742b8; --open: #5b6472; --prog: #b5820b; --done: #10935a;
      --shadow: 0 1px 2px rgba(20,24,40,.05), 0 6px 20px rgba(20,24,40,.06);
    }
    :root[data-theme="dark"] {
      --ground: #0d0e13; --surface: #14161d; --surface-2: #1b1e27; --line: #262a35;
      --line-strong: #363b49; --ink: #e9ebf1; --ink-2: #a9afc0; --ink-3: #6e7486;
      --accent: #7d88f0; --accent-ink: #aab2f7; --open: #8891a3; --prog: #e0a92c; --done: #34c281;
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
    .board { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; align-items: start; }
    @media (max-width: 860px) { .board { grid-template-columns: 1fr; } }

    .col { background: transparent; }
    .col-head { display: flex; align-items: center; gap: 8px; padding: 4px 6px 12px; }
    .col-head .swatch { width: 10px; height: 10px; border-radius: 3px; }
    .col-head h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; margin: 0; font-weight: 700; }
    .col-head .n { font-family: var(--mono); font-size: 12px; color: var(--ink-3); background: var(--surface-2); padding: 1px 8px; border-radius: 999px; }
    .col.open .swatch { background: var(--open); } .col.in_progress .swatch { background: var(--prog); } .col.done .swatch { background: var(--done); }
    .stack { display: flex; flex-direction: column; gap: 12px; min-height: 60px; }
    .col-empty { border: 1.5px dashed var(--line-strong); border-radius: 12px; padding: 20px; text-align: center; color: var(--ink-3); font-size: 13px; }

    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
    .card .cbody { padding: 12px 13px; }
    .card .row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
    .who { font-size: 12.5px; font-weight: 600; }
    .when { font-size: 11px; color: var(--ink-3); margin-left: auto; font-variant-numeric: tabular-nums; }
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

    .loading, .error { padding: 40px; text-align: center; color: var(--ink-3); }
    .error { color: var(--pin); }
  </style>
  @endverbatim
</head>
<body>
  <header class="top">
    <div class="brand"><span class="mark"></span> Loupe</div>
    <span class="project" id="project">—</span>
    <span class="spacer"></span>
    <label class="control">Page
      <select id="pageFilter"><option value="">All pages</option></select>
    </label>
    <span class="live"><span class="dot"></span><span id="liveText">live</span></span>
    <button class="btn" id="refresh">Refresh</button>
  </header>
  <main>
    <div id="board" class="board"></div>
    <div id="status" class="loading">Loading feedback…</div>
  </main>

  <script>
    window.__LOUPE__ = {
      api: @json($api),
      project: @json($project),
      csrf: @json(csrf_token()),
    };
  </script>
  <script type="module" src="{{ asset('vendor/loupe/dashboard/app.js') }}"></script>
</body>
</html>
