import type { Delivery, Member, OrgWithRole, Organization, Project, Role } from "./store.ts";

/** Escape text for HTML element bodies and double-quoted attributes. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const CSS = `
:root{--bg:#fff;--fg:#1c1d22;--muted:#6b6f7b;--line:#e3e4e8;--accent:#4a55d6;--ok:#1d7a46;--bad:#b3261e;--code:#f4f5f7}
@media (prefers-color-scheme:dark){:root{--bg:#141519;--fg:#e8e9ed;--muted:#9a9eab;--line:#2b2d34;--accent:#8a93ff;--ok:#5fcf8f;--bad:#ff8a80;--code:#1f2127}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
header .logo{font-size:22px;color:var(--accent)}header a{color:inherit;text-decoration:none;font-weight:600}
header .me{margin-left:auto;display:flex;gap:10px;align-items:center;color:var(--muted);font-size:13px}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
a{color:var(--accent)}.muted{color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:14px}
td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
form.inline{display:inline}form.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
input,select,button{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
input{min-width:0;flex:1 1 200px}button{cursor:pointer;background:var(--accent);color:#fff;border-color:var(--accent)}
button.link{background:none;color:var(--accent);border:0;padding:0}code,.secret{font-family:ui-monospace,monospace;font-size:13px;background:var(--code);padding:2px 6px;border-radius:4px;word-break:break-all}
.card{border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:12px 0}.warn{border-color:var(--accent)}
.ok{color:var(--ok)}.failed,.error{color:var(--bad)}
`;

export function layout(title: string, body: string, me?: { email: string } | null): string {
  const who = me
    ? `<span class="me">${esc(me.email)}<form class="inline" method="post" action="/logout"><button class="link">Sign out</button></form></span>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Loupe Hub</title><style>${CSS}</style></head><body>
<header><span class="logo">◎</span><a href="/">Loupe Hub</a>${who}</header><main>${body}</main></body></html>`;
}

export function signInPage(clientId: string | undefined, error?: string): string {
  const err = error ? `<p class="error">${esc(error)}</p>` : "";
  if (!clientId) {
    return layout("Sign in", `<h1>Sign in</h1>${err}<p class="error">GOOGLE_CLIENT_ID is not configured on this server.</p>`);
  }
  return layout(
    "Sign in",
    `<h1>Sign in</h1>${err}<p class="muted">Sign in with your Google account to manage organizations and projects.</p>
<div id="g_id_onload" data-client_id="${esc(clientId)}" data-callback="loupeHubSignIn" data-auto_prompt="false"></div>
<div class="g_id_signin" data-type="standard" data-theme="outline" data-size="large" data-text="signin_with"></div>
<p id="msg" class="error"></p>
<script>
function loupeHubSignIn(r){fetch("/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential:r.credential})})
.then(function(res){return res.json().then(function(j){if(res.ok)location.href="/";else document.getElementById("msg").textContent=j.error||"Sign-in failed";});});}
</script>
<script src="https://accounts.google.com/gsi/client" async></script>`,
  );
}

export function homePage(me: { email: string }, orgs: OrgWithRole[]): string {
  const list = orgs.length
    ? `<table><tr><th>Organization</th><th>Your role</th></tr>${orgs
        .map((o) => `<tr><td><a href="/orgs/${esc(o.id)}">${esc(o.name)}</a></td><td>${esc(o.role)}</td></tr>`)
        .join("")}</table>`
    : `<p class="muted">You are not a member of any organization yet.</p>`;
  return layout(
    "Organizations",
    `<h1>Organizations</h1>${list}
<h2>New organization</h2>
<form class="row" method="post" action="/orgs">
<input name="name" placeholder="Name" required maxlength="100">
<input name="allowed_domain" placeholder="Allowed email domain (optional), e.g. acme.com" maxlength="253">
<button>Create</button></form>`,
    me,
  );
}

export function orgPage(me: { email: string }, org: Organization, role: Role, members: Member[], projects: Project[], error?: string): string {
  const owner = role === "owner";
  const err = error ? `<p class="error">${esc(error)}</p>` : "";
  const memberRows = members
    .map(
      (m) => `<tr><td>${esc(m.email)}</td><td>${esc(m.role)}</td><td>${
        owner
          ? `<form class="inline" method="post" action="/orgs/${esc(org.id)}/members/remove"><input type="hidden" name="email" value="${esc(m.email)}"><button class="link">Remove</button></form>`
          : ""
      }</td></tr>`,
    )
    .join("");
  const projectRows = projects.length
    ? `<table><tr><th>Project</th><th>Project ID</th><th>Webhook</th></tr>${projects
        .map(
          (p) => `<tr><td><a href="/projects/${esc(p.id)}">${esc(p.name)}</a></td><td><code>${esc(p.id)}</code></td><td>${esc(p.webhook_url)}</td></tr>`,
        )
        .join("")}</table>`
    : `<p class="muted">No projects yet.</p>`;

  const ownerForms = owner
    ? `<form class="row" method="post" action="/orgs/${esc(org.id)}/members">
<input name="email" type="email" placeholder="Google email" required>
<select name="role"><option value="member">member</option><option value="owner">owner</option></select>
<button>Add member</button></form>
<form class="row" method="post" action="/orgs/${esc(org.id)}/domain">
<input name="allowed_domain" placeholder="Allowed domain, e.g. acme.com (empty to clear)" value="${esc(org.allowed_domain ?? "")}">
<button>Save domain</button></form>`
    : "";
  const newProject = owner
    ? `<h2>New project</h2><form class="row" method="post" action="/orgs/${esc(org.id)}/projects">
<input name="name" placeholder="Project name" required maxlength="100">
<input name="webhook_url" type="url" placeholder="Webhook URL (https://…)" required>
<button>Create project</button></form>`
    : "";

  return layout(
    org.name,
    `<p><a href="/">← Organizations</a></p><h1>${esc(org.name)}</h1>${err}
<p class="muted">Organization ID <code>${esc(org.id)}</code> · your role: ${esc(role)}</p>
<h2>Allowed members</h2>
<p class="muted">Issues are accepted from these Google emails${
      org.allowed_domain ? `, and from any <code>@${esc(org.allowed_domain)}</code> email` : ""
    }.</p>
<table><tr><th>Email</th><th>Role</th><th></th></tr>${memberRows}</table>${ownerForms}
<h2>Projects</h2>${projectRows}${newProject}`,
    me,
  );
}

/** Shown exactly once, right after a secret is generated. */
export function secretsCard(values: { label: string; value: string }[]): string {
  return `<div class="card warn"><strong>Copy now. These secrets are shown only once.</strong>${values
    .map((v) => `<p>${esc(v.label)}<br><span class="secret">${esc(v.value)}</span></p>`)
    .join("")}</div>`;
}

export function projectPage(
  me: { email: string },
  org: Organization,
  p: Project,
  role: Role,
  deliveries: Delivery[],
  opts: { reveal?: string; error?: string } = {},
): string {
  const owner = role === "owner";
  const err = opts.error ? `<p class="error">${esc(opts.error)}</p>` : "";
  const rows = deliveries.length
    ? `<table><tr><th>When</th><th>Issue</th><th>Status</th><th>HTTP</th><th>Attempts</th><th>Error</th></tr>${deliveries
        .map(
          (d) => `<tr><td>${esc(new Date(d.created_at).toISOString().replace("T", " ").slice(0, 19))}</td><td><code>${esc(d.issue_id)}</code></td>
<td class="${esc(d.status)}">${esc(d.status)}</td><td>${esc(d.http_status ?? "-")}</td><td>${esc(d.attempts)}</td><td>${esc(d.last_error ?? "")}</td></tr>`,
        )
        .join("")}</table>`
    : `<p class="muted">No deliveries yet.</p>`;
  const ownerForms = owner
    ? `<form class="row" method="post" action="/projects/${esc(p.id)}/webhook">
<input name="webhook_url" type="url" value="${esc(p.webhook_url)}" required><button>Save webhook URL</button></form>
<form class="row" method="post" action="/projects/${esc(p.id)}/rotate">
<input type="hidden" name="which" value="secret"><button>Rotate project secret</button></form>
<form class="row" method="post" action="/projects/${esc(p.id)}/rotate">
<input type="hidden" name="which" value="webhook_secret"><button>Rotate webhook secret</button></form>`
    : "";
  return layout(
    p.name,
    `<p><a href="/orgs/${esc(org.id)}">← ${esc(org.name)}</a></p><h1>${esc(p.name)}</h1>${err}${opts.reveal ?? ""}
<p>Project ID <code>${esc(p.id)}</code></p>
<p>Webhook URL <code>${esc(p.webhook_url)}</code></p>
<p class="muted">Secrets are hidden after creation. Rotate one to get a new value.</p>
${ownerForms}
<h2>Last 20 deliveries</h2>${rows}`,
    me,
  );
}

export function errorPage(status: number, message: string, me?: { email: string } | null): string {
  return layout(String(status), `<h1>${esc(status)}</h1><p>${esc(message)}</p><p><a href="/">Home</a></p>`, me);
}
