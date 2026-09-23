process.env.HUB_PG_DIR = "memory://";
process.env.HUB_SESSION_SECRET = "test-session-secret";
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { handler } from "../index.ts";
import { db, migrate } from "../db.ts";
import * as store from "../store.ts";
import { sign, verifySignature } from "../crypto.ts";
import { transport } from "../webhook.ts";
import { auth } from "../google.ts";

let hub: Server;
let base: string;
let hook: Server;
let hookUrl: string;
let hookReplies: number[] = [];
let hookReceived: { headers: IncomingHttpHeaders; body: string }[] = [];
const verifyCalls: { token: string; clientId: string }[] = [];

beforeAll(async () => {
  hub = createServer(handler);
  await new Promise<void>((r) => hub.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(hub.address() as any).port}`;

  hook = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hookReceived.push({ headers: req.headers, body });
      res.writeHead(hookReplies.shift() ?? 200).end();
    });
  });
  await new Promise<void>((r) => hook.listen(0, "127.0.0.1", () => r()));
  hookUrl = `http://127.0.0.1:${(hook.address() as any).port}/hook`;

  transport.sleep = async () => {};
  // Fake Google: tokens look like "tok:<email>"; "bad" is rejected.
  auth.verify = async (token, clientId) => {
    verifyCalls.push({ token, clientId });
    if (!token.startsWith("tok:")) throw new Error("Wrong number of segments in token");
    return { email: token.slice(4), name: "Test User" };
  };
});
afterAll(async () => {
  await new Promise<void>((r) => hub.close(() => r()));
  await new Promise<void>((r) => hook.close(() => r()));
});
beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("TRUNCATE deliveries, projects, org_members, organizations CASCADE");
  hookReplies = [];
  hookReceived = [];
  verifyCalls.length = 0;
});

// ---- helpers ----

const issue = (over: Record<string, unknown> = {}) => ({
  id: "c_1", projectKey: "app", url: "/checkout", body: "Button is misaligned", status: "open", kind: "element",
  author: { id: "7", name: "Sara" }, anchor: { tag: "button" }, context: { html: "<button/>", styles: {} },
  offset: { x: 0.5, y: 0.5 }, createdAt: "2026-09-23T00:00:00.000Z", ...over,
});

async function setup(domain: string | null = "acme.com") {
  const org = await store.createOrg("Acme", "owner@acme.com", domain);
  await store.addMember(org.id, "guest@gmail.com", "member");
  const project = await store.createProject(org.id, "Web", hookUrl);
  return { org, project };
}

function postIssue(project: { id: string; secret: string }, body: unknown, opts: { ts?: number; secret?: string; sig?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  return fetch(`${base}/v1/issues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Loupe-Project": project.id,
      "X-Loupe-Timestamp": ts,
      "X-Loupe-Signature": opts.sig ?? sign(ts, raw, opts.secret ?? project.secret),
    },
    body: raw,
  });
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${base}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ credential: `tok:${email}` }),
  });
  expect(r.status).toBe(200);
  const set = r.headers.get("set-cookie")!;
  expect(set).toMatch(/HttpOnly/);
  expect(set).toMatch(/Secure/);
  expect(set).toMatch(/SameSite=Lax/);
  return set.split(";")[0]!;
}

function page(path: string, cookie?: string) {
  return fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
}

function form(path: string, cookie: string | undefined, fields: Record<string, string>, origin: string | null = base) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  return fetch(`${base}${path}`, { method: "POST", headers, body: new URLSearchParams(fields).toString(), redirect: "manual" });
}

// ---- ingest ----

describe("POST /v1/issues", () => {
  it("accepts an explicit member, forwards a signed payload and logs the delivery", async () => {
    const { org, project } = await setup(null);
    const r = await postIssue(project, { user: { email: "Guest@Gmail.com", name: "Guest" }, issue: issue() });
    expect(r.status).toBe(202);
    const out = (await r.json()) as { id: string; delivery: string };
    expect(out).toEqual({ id: expect.stringMatching(/^dlv_/), delivery: "ok" });

    expect(hookReceived).toHaveLength(1);
    const { headers, body } = hookReceived[0]!;
    const check = verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), project.webhook_secret);
    expect(check).toEqual({ ok: true });
    // Signed with the webhook secret, not the project secret.
    expect(verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), project.secret).ok).toBe(false);
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({
      project_id: project.id,
      organization_id: org.id,
      user: { email: "guest@gmail.com", name: "Guest" },
      issue: issue(),
    });
    expect(new Date(payload.received_at).toString()).not.toBe("Invalid Date");

    const log = await store.listDeliveries(project.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ id: out.id, issue_id: "c_1", status: "ok", http_status: 200, attempts: 1, last_error: null });
  });

  it("accepts any email on the org's allowed domain (and omits an empty name)", async () => {
    const { project } = await setup("acme.com");
    const r = await postIssue(project, { user: { email: "new.hire@ACME.com", name: "" }, issue: issue() });
    expect(r.status).toBe(202);
    expect(JSON.parse(hookReceived[0]!.body).user).toEqual({ email: "new.hire@acme.com" });
  });

  it("returns 403 for a user outside the organization, and forwards nothing", async () => {
    const { project } = await setup("acme.com");
    for (const email of ["someone@gmail.com", "evil@notacme.com", "x@acme.com.evil.io"]) {
      const r = await postIssue(project, { user: { email }, issue: issue() });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: "user not in organization" });
    }
    expect(hookReceived).toHaveLength(0);
    expect(await store.listDeliveries(project.id)).toHaveLength(0);
  });

  it("rejects an invalid signature, a wrong secret and an expired timestamp", async () => {
    const { project } = await setup();
    const body = { user: { email: "owner@acme.com" }, issue: issue() };

    let r = await postIssue(project, body, { sig: "00".repeat(32) });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "invalid signature" });

    r = await postIssue(project, body, { secret: "psk_wrong" });
    expect(r.status).toBe(401);

    r = await postIssue(project, body, { ts: Math.floor(Date.now() / 1000) - 301 });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "timestamp out of range" });

    r = await postIssue(project, body, { ts: Math.floor(Date.now() / 1000) + 600 });
    expect(r.status).toBe(401);
    expect(hookReceived).toHaveLength(0);
  });

  it("rejects missing headers and unknown projects", async () => {
    let r = await fetch(`${base}/v1/issues`, { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
    expect(((await r.json()) as any).error).toMatch(/missing/);

    r = await postIssue({ id: "prj_nope", secret: "x" }, {});
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "unknown project" });
  });

  it("validates the body", async () => {
    const { project } = await setup();
    let r = await postIssue(project, "{not json");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid JSON" });

    r = await postIssue(project, { user: { email: "nope" }, issue: issue() });
    expect(await r.json()).toEqual({ error: "user.email required" });

    r = await postIssue(project, { user: { email: "owner@acme.com" }, issue: { body: "no id" } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "issue.id required" });

    r = await postIssue(project, { user: { email: "owner@acme.com" } });
    expect(r.status).toBe(400);
  });

  it("rejects oversized bodies and non-POST methods", async () => {
    const { project } = await setup();
    const r = await postIssue(project, "x".repeat(5_000_001));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "payload too large" });

    const g = await fetch(`${base}/v1/issues`);
    expect(g.status).toBe(405);
  });

  it("retries a failing webhook and records the failed delivery, still answering 202", async () => {
    const { project } = await setup();
    hookReplies = [500, 500, 500];
    const r = await postIssue(project, { user: { email: "owner@acme.com" }, issue: issue({ id: "c_fail" }) });
    expect(r.status).toBe(202);
    expect(((await r.json()) as any).delivery).toBe("failed");
    expect(hookReceived).toHaveLength(3);
    const [d] = await store.listDeliveries(project.id);
    expect(d).toMatchObject({ issue_id: "c_fail", status: "failed", http_status: 500, attempts: 3, last_error: "HTTP 500" });
  });

  it("health and unknown API routes", async () => {
    expect(await (await fetch(`${base}/v1/health`)).json()).toEqual({ ok: true });
    const r = await fetch(`${base}/v1/nope`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });
});

// ---- dashboard auth ----

describe("sign-in", () => {
  it("shows the Google sign-in page with our client ID when signed out", async () => {
    const r = await page("/");
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain("◎");
    expect(body).toContain('data-client_id="client-123.apps.googleusercontent.com"');
    expect(body).toContain("accounts.google.com/gsi/client");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("verifies the ID token against our client ID and sets a session", async () => {
    const cookie = await login("Owner@Acme.com");
    expect(verifyCalls).toEqual([{ token: "tok:Owner@Acme.com", clientId: "client-123.apps.googleusercontent.com" }]);
    const home = await (await page("/", cookie)).text();
    expect(home).toContain("owner@acme.com");
    expect(home).toContain("New organization");
  });

  it("rejects bad tokens, bad bodies and cross-origin sign-in", async () => {
    const post = (body: string, origin: string | null = base) =>
      fetch(`${base}/auth/google`, { method: "POST", headers: origin ? { Origin: origin } : {}, body });
    let r = await post(JSON.stringify({ credential: "bad" }));
    expect(r.status).toBe(401);
    expect(((await r.json()) as any).error).toMatch(/sign-in rejected/);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await post("nope")).status).toBe(400);
    expect((await post("{}")).status).toBe(400);
    expect((await post(JSON.stringify({ credential: "tok:a@b.co" }), "https://evil.example")).status).toBe(403);
    expect((await post(JSON.stringify({ credential: "tok:a@b.co" }), null)).status).toBe(403);
    expect((await post(JSON.stringify({ credential: "tok:a@b.co" }), "not a url")).status).toBe(403);
  });

  it("ignores forged session cookies and redirects signed-out pages home", async () => {
    const r = await page("/orgs/org_x", "hub_session=eyJlbWFpbCI6ImEifQ.forged");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/");
    const post = await form("/orgs", undefined, { name: "X" });
    expect(post.status).toBe(401);
  });

  it("signs out by clearing the cookie", async () => {
    const cookie = await login("owner@acme.com");
    const r = await form("/logout", cookie, {});
    expect(r.status).toBe(303);
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("503s sign-in when no client ID is configured", async () => {
    const id = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const r = await fetch(`${base}/auth/google`, { method: "POST", headers: { Origin: base }, body: "{}" });
      expect(r.status).toBe(503);
      expect(await (await page("/")).text()).toContain("GOOGLE_CLIENT_ID is not configured");
    } finally {
      process.env.GOOGLE_CLIENT_ID = id;
    }
  });
});

// ---- dashboard: orgs, members, projects, permissions ----

describe("organizations and projects", () => {
  it("creator becomes owner; owner adds members, sets the domain and creates a project with one-time secrets", async () => {
    const owner = await login("owner@acme.com");
    let r = await form("/orgs", owner, { name: "Acme <Inc>", allowed_domain: "@Acme.com" });
    expect(r.status).toBe(303);
    const orgPath = r.headers.get("location")!;
    const orgId = orgPath.split("/")[2]!;
    expect(await store.roleIn(orgId, "owner@acme.com")).toBe("owner");
    expect((await store.getOrg(orgId))!.allowed_domain).toBe("acme.com");

    const orgHtml = await (await page(orgPath, owner)).text();
    expect(orgHtml).toContain("Acme &#60;Inc&#62;"); // escaped
    expect(orgHtml).not.toContain("Acme <Inc>");

    expect((await form(`${orgPath}/members`, owner, { email: "Guest@Gmail.com", role: "member" })).status).toBe(303);
    expect(await store.roleIn(orgId, "guest@gmail.com")).toBe("member");
    expect((await form(`${orgPath}/domain`, owner, { allowed_domain: "" })).status).toBe(303);
    expect((await store.getOrg(orgId))!.allowed_domain).toBeNull();

    r = await form(`${orgPath}/projects`, owner, { name: "Web", webhook_url: hookUrl });
    expect(r.status).toBe(201);
    const created = await r.text();
    const [p] = await store.listProjects(orgId);
    expect(p!.id).toMatch(/^prj_/);
    expect(p!.secret).toMatch(/^psk_/);
    expect(p!.webhook_secret).toMatch(/^whs_/);
    expect(created).toContain(p!.secret);
    expect(created).toContain(p!.webhook_secret);

    // Shown once: a later view shows the ID but not the secrets.
    const later = await (await page(`/projects/${p!.id}`, owner)).text();
    expect(later).toContain(p!.id);
    expect(later).not.toContain(p!.secret);
    expect(later).not.toContain(p!.webhook_secret);
    expect(later).toContain("No deliveries yet");
  });

  it("owner rotates both secrets and edits the webhook URL", async () => {
    const { org, project } = await setup();
    const owner = await login("owner@acme.com");
    let r = await form(`/projects/${project.id}/rotate`, owner, { which: "secret" });
    expect(r.status).toBe(200);
    const after = (await store.getProject(project.id))!;
    expect(after.secret).not.toBe(project.secret);
    expect(await r.text()).toContain(after.secret);
    // The old secret no longer authenticates ingest.
    expect((await postIssue(project, { user: { email: "owner@acme.com" }, issue: issue() })).status).toBe(401);

    r = await form(`/projects/${project.id}/rotate`, owner, { which: "webhook_secret" });
    const after2 = (await store.getProject(project.id))!;
    expect(after2.webhook_secret).not.toBe(project.webhook_secret);
    expect(await r.text()).toContain(after2.webhook_secret);

    r = await form(`/projects/${project.id}/webhook`, owner, { webhook_url: "https://hooks.example.com/loupe" });
    expect(r.status).toBe(303);
    expect((await store.getProject(project.id))!.webhook_url).toBe("https://hooks.example.com/loupe");
    r = await form(`/projects/${project.id}/webhook`, owner, { webhook_url: "javascript:alert(1)" });
    expect(r.status).toBe(400);
    expect(org.id).toBeTruthy();
  });

  it("members can view but not change anything", async () => {
    const { org, project } = await setup();
    const member = await login("guest@gmail.com");
    const orgHtml = await (await page(`/orgs/${org.id}`, member)).text();
    expect(orgHtml).toContain("Web");
    expect(orgHtml).not.toContain("Add member");
    expect(orgHtml).not.toContain("Create project");
    const projHtml = await (await page(`/projects/${project.id}`, member)).text();
    expect(projHtml).not.toContain("Rotate project secret");
    expect(projHtml).not.toContain(project.secret);

    for (const [path, fields] of [
      [`/orgs/${org.id}/members`, { email: "me@gmail.com", role: "owner" }],
      [`/orgs/${org.id}/members/remove`, { email: "owner@acme.com" }],
      [`/orgs/${org.id}/domain`, { allowed_domain: "gmail.com" }],
      [`/orgs/${org.id}/projects`, { name: "X", webhook_url: hookUrl }],
      [`/projects/${project.id}/webhook`, { webhook_url: "https://evil.example" }],
      [`/projects/${project.id}/rotate`, { which: "secret" }],
    ] as const) {
      const r = await form(path, member, fields);
      expect(r.status, path).toBe(403);
    }
    expect(await store.roleIn(org.id, "me@gmail.com")).toBeNull();
    expect((await store.getProject(project.id))!.secret).toBe(project.secret);
    expect((await store.getOrg(org.id))!.allowed_domain).toBe("acme.com");
  });

  it("non-members see nothing (404) and only their own orgs are listed", async () => {
    const { org, project } = await setup();
    const stranger = await login("stranger@other.com");
    expect((await page(`/orgs/${org.id}`, stranger)).status).toBe(404);
    expect((await page(`/projects/${project.id}`, stranger)).status).toBe(404);
    expect((await form(`/orgs/${org.id}/members`, stranger, { email: "stranger@other.com" })).status).toBe(404);
    expect((await form(`/projects/${project.id}/rotate`, stranger, { which: "secret" })).status).toBe(404);
    expect((await page(`/projects/prj_missing`, stranger)).status).toBe(404);
    const home = await (await page("/", stranger)).text();
    expect(home).not.toContain("Acme");
    expect(home).toContain("not a member of any organization");

    // Even a domain-allowed submitter is not a dashboard member.
    const domainUser = await login("dev@acme.com");
    expect((await page(`/orgs/${org.id}`, domainUser)).status).toBe(404);
  });

  it("blocks cross-origin dashboard POSTs (CSRF)", async () => {
    const { org } = await setup();
    const owner = await login("owner@acme.com");
    expect((await form(`/orgs/${org.id}/members`, owner, { email: "x@y.co" }, "https://evil.example")).status).toBe(403);
    expect((await form(`/orgs/${org.id}/members`, owner, { email: "x@y.co" }, null)).status).toBe(403);
    expect(await store.roleIn(org.id, "x@y.co")).toBeNull();
  });

  it("validates dashboard input", async () => {
    const { org } = await setup();
    const owner = await login("owner@acme.com");
    expect((await form("/orgs", owner, { name: "" })).status).toBe(400);
    expect((await form("/orgs", owner, { name: "X", allowed_domain: "not a domain" })).status).toBe(400);
    let r = await form(`/orgs/${org.id}/members`, owner, { email: "nope" });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Enter a valid email");
    expect((await form(`/orgs/${org.id}/domain`, owner, { allowed_domain: "bad domain" })).status).toBe(400);
    expect((await form(`/orgs/${org.id}/projects`, owner, { name: "", webhook_url: hookUrl })).status).toBe(400);
    r = await form(`/orgs/${org.id}/projects`, owner, { name: "X", webhook_url: "ftp://x" });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Webhook URL must be an http(s) URL");
    expect((await form(`/orgs/${org.id}/projects`, owner, { name: "X", webhook_url: "not a url" })).status).toBe(400);
    expect((await form(`/orgs/${org.id}/projects`, owner, { name: "X", webhook_url: "https://x.co/" + "a".repeat(2000) })).status).toBe(400);
  });

  it("keeps at least one owner, but can remove members and extra owners", async () => {
    const { org } = await setup();
    const owner = await login("owner@acme.com");
    let r = await form(`/orgs/${org.id}/members/remove`, owner, { email: "owner@acme.com" });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("at least one owner");
    expect((await form(`/orgs/${org.id}/members/remove`, owner, { email: "guest@gmail.com" })).status).toBe(303);
    expect(await store.roleIn(org.id, "guest@gmail.com")).toBeNull();
    await form(`/orgs/${org.id}/members`, owner, { email: "co@acme.com", role: "owner" });
    expect((await form(`/orgs/${org.id}/members/remove`, owner, { email: "co@acme.com" })).status).toBe(303);
  });

  it("shows the last 20 deliveries, newest first, with status", async () => {
    const { project } = await setup();
    for (let i = 0; i < 22; i++) {
      await store.recordDelivery({
        id: `dlv_${String(i).padStart(2, "0")}`, project_id: project.id, issue_id: `c_${i}`,
        status: i % 2 ? "failed" : "ok", http_status: i % 2 ? 500 : 200, attempts: i % 2 ? 3 : 1, last_error: i % 2 ? "HTTP 500" : null,
      });
    }
    const list = await store.listDeliveries(project.id);
    expect(list).toHaveLength(20);
    const owner = await login("owner@acme.com");
    const htmlText = await (await page(`/projects/${project.id}`, owner)).text();
    expect(htmlText).toContain("Last 20 deliveries");
    expect(htmlText).toContain('class="failed"');
    expect(htmlText).toContain('class="ok"');
    expect(htmlText.match(/<code>c_\d+<\/code>/g)).toHaveLength(20);
  });

  it("404s unknown dashboard routes and methods", async () => {
    const { org, project } = await setup();
    const owner = await login("owner@acme.com");
    expect((await page("/nope", owner)).status).toBe(404);
    expect((await page(`/orgs/${org.id}/members`, owner)).status).toBe(404);
    expect((await page(`/projects/${project.id}/rotate`, owner)).status).toBe(404);
    expect((await form(`/orgs/${org.id}`, owner, {})).status).toBe(404);
    expect((await form(`/projects/${project.id}`, owner, {})).status).toBe(404);
  });
});
