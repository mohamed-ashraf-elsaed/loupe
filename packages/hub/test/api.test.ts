process.env.HUB_PG_DIR = "memory://";
process.env.HUB_SESSION_SECRET = "test-session-secret";
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
// The receivers below listen on 127.0.0.1; webhook.test.ts covers the guard itself.
process.env.HUB_ALLOW_PRIVATE_URLS = "1";

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

// ---- routing between projects ----

function getProjects(project: { id: string; secret: string }, opts: { ts?: number; secret?: string; omit?: string } = {}) {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "X-Loupe-Project": project.id,
    "X-Loupe-Timestamp": ts,
    "X-Loupe-Signature": sign(ts, "", opts.secret ?? project.secret),
  };
  if (opts.omit) delete headers[opts.omit];
  return fetch(`${base}/v1/projects`, { headers });
}

/** Acme with three projects: Web sends to Tracker, Tracker receives on the hook server, Admin does nothing. */
async function routed() {
  const { org, project: web } = await setup();
  const tracker = await store.createProject(org.id, "Tracker");
  await store.setInboundUrl(tracker.id, hookUrl.replace("/hook", "/inbound"));
  expect(await store.setDestination(web.id, tracker.id)).toBeNull();
  const admin = await store.createProject(org.id, "Admin");
  return { org, web: (await store.getProject(web.id))!, tracker: (await store.getProject(tracker.id))!, admin };
}

describe("routing between projects", () => {
  it("delivers to the destination's inbound URL, signed with the destination's own secret", async () => {
    const { org, web, tracker } = await routed();
    const r = await postIssue(web, { user: { email: "dev@acme.com", name: "Dev" }, issue: issue() });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({
      id: expect.stringMatching(/^dlv_/),
      delivery: "ok",
      destination: { id: tracker.id, name: "Tracker" },
    });

    expect(hookReceived).toHaveLength(1);
    const { headers, body } = hookReceived[0]!;
    expect(headers["x-loupe-hub-project"]).toBe(tracker.id);
    const ts = String(headers["x-loupe-hub-timestamp"]);
    const sig = String(headers["x-loupe-hub-signature"]);
    expect(verifySignature(ts, body, sig, tracker.secret)).toEqual({ ok: true });
    // Not the sender's secrets: the receiver only ever holds its own.
    expect(verifySignature(ts, body, sig, web.secret).ok).toBe(false);
    expect(verifySignature(ts, body, sig, web.webhook_secret).ok).toBe(false);
    expect(JSON.parse(body)).toMatchObject({
      project_id: web.id,
      organization_id: org.id,
      source: { project_id: web.id, project_name: "Web", organization_id: org.id, organization_name: "Acme" },
      user: { email: "dev@acme.com", name: "Dev" },
      issue: issue(),
    });

    const [log] = await store.listDeliveries(web.id);
    expect(log).toMatchObject({ status: "ok", destination_project_id: tracker.id });
  });

  it("keeps the external webhook path when no destination is set, and adds the source block", async () => {
    const { org, project } = await setup();
    const r = await postIssue(project, { user: { email: "dev@acme.com" }, issue: issue() });
    expect(await r.json()).toEqual({ id: expect.stringMatching(/^dlv_/), delivery: "ok" });
    const { headers, body } = hookReceived[0]!;
    expect(headers["x-loupe-hub-project"]).toBeUndefined();
    expect(verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), project.webhook_secret).ok).toBe(true);
    expect(JSON.parse(body).source).toEqual({ project_id: project.id, project_name: "Web", organization_id: org.id, organization_name: "Acme" });
    expect((await store.listDeliveries(project.id))[0]!.destination_project_id).toBeNull();
  });

  it("answers delivery none when a project has neither a destination nor a webhook", async () => {
    const { admin } = await routed();
    const r = await postIssue(admin, { user: { email: "dev@acme.com" }, issue: issue() });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ id: expect.stringMatching(/^dlv_/), delivery: "none" });
    expect(hookReceived).toHaveLength(0);
    expect(await store.listDeliveries(admin.id)).toHaveLength(0);
  });

  it("still checks membership before routing", async () => {
    const { web } = await routed();
    expect((await postIssue(web, { user: { email: "x@other.com" }, issue: issue() })).status).toBe(403);
    expect(hookReceived).toHaveLength(0);
  });

  it("refuses a destination in another organization, the project itself, or one that cannot receive", async () => {
    const { web, tracker, admin } = await routed();
    const other = await store.createOrg("Other", "o@other.com");
    const foreign = await store.createProject(other.id, "Foreign");
    await store.setInboundUrl(foreign.id, "https://other.example/loupe/v1/hub/inbound");
    expect(await store.setDestination(web.id, foreign.id)).toBe("other_org");
    expect(await store.setDestination(tracker.id, tracker.id)).toBe("self");
    expect(await store.setDestination(web.id, admin.id)).toBe("no_inbound_url");
    expect(await store.setDestination(web.id, "prj_missing")).toBe("not_found");
    expect((await store.getProject(web.id))!.destination_project_id).toBe(tracker.id);
    expect(await store.setDestination(web.id, null)).toBeNull();
    expect((await store.getProject(web.id))!.destination_project_id).toBeNull();
  });

  it("clears every route to a project when its inbound URL is removed", async () => {
    const { web, tracker } = await routed();
    await store.setInboundUrl(tracker.id, null);
    expect((await store.getProject(web.id))!.destination_project_id).toBeNull();
  });

  it("lets an owner set the inbound URL and the route from the dashboard", async () => {
    const { org, project: web } = await setup();
    const tracker = await store.createProject(org.id, "Tracker");
    const owner = await login("owner@acme.com");

    let html = await (await page(`/projects/${web.id}`, owner)).text();
    expect(html).toContain("Send tickets to");
    expect(html).not.toContain(`<option value="${tracker.id}"`); // cannot receive yet
    expect(html).toContain(`LOUPE_PROJECT_ID=${web.id}`);
    expect(html).not.toContain(web.secret);

    let r = await form(`/projects/${tracker.id}/inbound`, owner, { inbound_url: "javascript:x" });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Inbound URL must be an http(s) URL");
    r = await form(`/projects/${tracker.id}/inbound`, owner, { inbound_url: "https://tracker.example/loupe/v1/hub/inbound" });
    expect(r.status).toBe(303);

    html = await (await page(`/projects/${web.id}`, owner)).text();
    expect(html).toContain(`<option value="${tracker.id}">Tracker</option>`);
    r = await form(`/projects/${web.id}/destination`, owner, { destination_project_id: tracker.id });
    expect(r.status).toBe(303);
    html = await (await page(`/projects/${web.id}`, owner)).text();
    expect(html).toContain(`<option value="${tracker.id}" selected>Tracker</option>`);
    expect(html).toContain("Tickets go to <strong>Tracker</strong>");
    const orgHtml = await (await page(`/orgs/${org.id}`, owner)).text();
    expect(orgHtml).toContain("<td>Tracker</td><td>no</td>"); // Web's row: goes to Tracker, does not receive

    r = await form(`/projects/${web.id}/destination`, owner, { destination_project_id: web.id });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("cannot send tickets to itself");

    // Clearing the route and the webhook leaves the project routing nowhere.
    expect((await form(`/projects/${web.id}/destination`, owner, { destination_project_id: "" })).status).toBe(303);
    expect((await form(`/projects/${web.id}/webhook`, owner, { webhook_url: "" })).status).toBe(303);
    expect((await store.getProject(web.id))!.webhook_url).toBeNull();
    html = await (await page(`/projects/${web.id}`, owner)).text();
    expect(html).toContain("Tickets go to <strong>nowhere yet</strong>");
    // Clearing the inbound URL.
    expect((await form(`/projects/${tracker.id}/inbound`, owner, { inbound_url: "" })).status).toBe(303);
    expect((await store.getProject(tracker.id))!.inbound_url).toBeNull();
  });

  it("creates a project with no webhook URL", async () => {
    const { org } = await setup();
    const owner = await login("owner@acme.com");
    const r = await form(`/orgs/${org.id}/projects`, owner, { name: "Tracker", webhook_url: "" });
    expect(r.status).toBe(201);
    const p = (await store.listProjects(org.id)).find((x) => x.name === "Tracker")!;
    expect(p.webhook_url).toBeNull();
  });

  it("shows the destination of each delivery", async () => {
    const { web } = await routed();
    await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue() });
    await store.recordDelivery({
      id: "dlv_gone", project_id: web.id, issue_id: "c_9", destination_project_id: "prj_deleted",
      status: "ok", http_status: 200, attempts: 1, last_error: null,
    });
    const owner = await login("owner@acme.com");
    const html = await (await page(`/projects/${web.id}`, owner)).text();
    expect(html).toContain("<td>Tracker</td>");
    expect(html).toContain("<td>prj_deleted</td>");
  });
});

function postUpdate(project: { id: string; secret: string }, issueId: string, body: unknown, opts: { secret?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return fetch(`${base}/v1/issues/${issueId}/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Loupe-Project": project.id,
      "X-Loupe-Timestamp": ts,
      "X-Loupe-Signature": sign(ts, raw, opts.secret ?? project.secret),
    },
    body: raw,
  });
}

describe("POST /v1/issues/{id}/updates", () => {
  const replyUrl = () => hookUrl.replace("/hook", "/loupe/v1/hub/inbound");

  async function shared() {
    const r = await routed();
    const sent = await postIssue(r.web, { user: { email: "dev@acme.com" }, issue: issue(), reply_url: replyUrl() });
    expect((await sent.json()).delivery).toBe("ok");
    hookReceived = [];
    return r;
  }

  it("stores the source's reply URL with a project-to-project delivery", async () => {
    const { web } = await shared();
    expect((await store.listDeliveries(web.id))[0]!.reply_url).toBe(replyUrl());
  });

  it("does not keep a reply URL that is not http(s), or for a webhook delivery", async () => {
    const { web } = await routed();
    await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue(), reply_url: "javascript:alert(1)" });
    expect((await store.listDeliveries(web.id))[0]!.reply_url).toBeNull();
    const { project } = await setup();
    await postIssue(project, { user: { email: "dev@acme.com" }, issue: issue({ id: "c_2" }), reply_url: replyUrl() });
    expect((await store.listDeliveries(project.id))[0]!.reply_url).toBeNull();
  });

  it("keeps a reply URL only on the receiver path, with no credentials, on the source's registered origin", async () => {
    const kept = async (reply_url: string, id: string) => {
      await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue({ id }), reply_url });
      return (await store.listDeliveries(web.id)).find((d) => d.issue_id === id)!.reply_url;
    };
    const { web: w } = await routed();
    let web = w;
    const origin = new URL(hookUrl).origin;
    expect(await kept(`${origin}/admin/delete-everything`, "c_path")).toBeNull();
    expect(await kept(replyUrl().replace("http://", "http://user:pw@"), "c_creds")).toBeNull();
    expect(await kept("http://169.254.169.254/loupe/v1/hub/inbound", "c_meta")).toBe("http://169.254.169.254/loupe/v1/hub/inbound");

    // Once the source has an inbound URL registered, the reply URL must share its origin.
    await store.setInboundUrl(web.id, replyUrl());
    web = (await store.getProject(web.id))!;
    expect(await kept("http://169.254.169.254/loupe/v1/hub/inbound", "c_meta2")).toBeNull();
    expect(await kept(replyUrl().replace("/loupe/", "/app/loupe/"), "c_same")).toBe(replyUrl().replace("/loupe/", "/app/loupe/"));
  });

  it("does not send to a stored reply URL that no longer passes the check", async () => {
    const { web, tracker } = await routed();
    // A row written before the check existed.
    await store.recordDelivery({
      id: "dlv_old", project_id: web.id, issue_id: "c_old", destination_project_id: tracker.id,
      reply_url: `${new URL(hookUrl).origin}/admin`, status: "ok", http_status: 200, attempts: 1, last_error: null,
    });
    expect(await (await postUpdate(tracker, "c_old", { kind: "status", status: "todo" })).json()).toEqual({ delivery: "none" });

    // And a source whose registered inbound URL moved after the ticket was sent.
    await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue(), reply_url: replyUrl() });
    await store.setInboundUrl(web.id, "https://moved.example/loupe/v1/hub/inbound");
    hookReceived = [];
    expect(await (await postUpdate(tracker, "c_1", { kind: "status", status: "todo" })).json()).toEqual({ delivery: "none" });
    expect(hookReceived).toHaveLength(0);
  });

  it("sends the destination's status back to the source's reply URL, signed with the source secret", async () => {
    const { web, tracker } = await shared();
    const update = { kind: "status", status: "in_progress", label: "In progress", reference: "CT-1405" };
    const r = await postUpdate(tracker, "c_1", update);
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ id: expect.stringMatching(/^dlv_/), delivery: "ok" });

    expect(hookReceived).toHaveLength(1);
    const { headers, body } = hookReceived[0]!;
    expect(headers["x-loupe-hub-project"]).toBe(web.id);
    expect(verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), web.secret)).toEqual({ ok: true });
    expect(verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), tracker.secret).ok).toBe(false);
    expect(JSON.parse(body)).toEqual({ type: "update", issue_id: "c_1", from: { project_id: tracker.id, project_name: "Tracker" }, update });
  });

  it("sends the source's reply to the destination's inbound URL, signed with the destination secret", async () => {
    const { web, tracker } = await shared();
    const update = { kind: "message", message: { id: "m_1", author: { name: "Sara" }, body: "Any news?" } };
    expect(await (await postUpdate(web, "c_1", update)).json()).toMatchObject({ delivery: "ok" });

    const { headers, body } = hookReceived[0]!;
    expect(headers["x-loupe-hub-project"]).toBe(tracker.id);
    expect(verifySignature(String(headers["x-loupe-hub-timestamp"]), body, String(headers["x-loupe-hub-signature"]), tracker.secret).ok).toBe(true);
    expect(JSON.parse(body)).toEqual({ type: "update", issue_id: "c_1", from: { project_id: web.id, project_name: "Web" }, update });
  });

  it("refuses a project that does not hold the ticket, and an unknown ticket", async () => {
    const { admin, tracker } = await shared();
    const r = await postUpdate(admin, "c_1", { kind: "status", status: "todo" });
    expect(r.status).toBe(403);
    expect((await postUpdate(tracker, "c_unknown", { kind: "status", status: "todo" })).status).toBe(404);
    expect(hookReceived).toHaveLength(0);
  });

  it("fails closed on a bad signature, a bad body and a bad method", async () => {
    const { web, tracker } = await shared();
    expect((await postUpdate(tracker, "c_1", { kind: "status" }, { secret: web.secret })).status).toBe(401);
    expect((await postUpdate(tracker, "c_1", "not json")).status).toBe(400);
    expect((await postUpdate(tracker, "c_1", { kind: "nudge" })).status).toBe(400);
    expect((await postUpdate(tracker, "c_1", [1])).status).toBe(400);
    expect((await postUpdate(tracker, "%E0%A4%A", { kind: "status" })).status).toBe(400);
    expect((await fetch(`${base}/v1/issues/c_1/updates`)).status).toBe(405);
    expect(hookReceived).toHaveLength(0);
  });

  it("answers none when the other side cannot receive, and failed when it is down", async () => {
    const { web, tracker } = await routed();
    await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue() }); // no reply_url: an older package
    hookReceived = [];
    expect(await (await postUpdate(tracker, "c_1", { kind: "status", status: "todo" })).json()).toEqual({ delivery: "none" });
    expect(hookReceived).toHaveLength(0);

    hookReplies = [500, 500, 500];
    expect(await (await postUpdate(web, "c_1", { kind: "status", status: "todo" })).json()).toMatchObject({ delivery: "failed" });
  });

  it("follows the newest delivery of a resent ticket", async () => {
    const { web, tracker } = await shared();
    const second = replyUrl().replace("/loupe/", "/app/loupe/");
    await postIssue(web, { user: { email: "dev@acme.com" }, issue: issue(), reply_url: second });
    hookReceived = [];
    await postUpdate(tracker, "c_1", { kind: "status", status: "todo" });
    expect(hookReceived).toHaveLength(1);
    expect(await store.findSharedTicket("c_1", tracker.id)).toMatchObject({ party: true, delivery: { reply_url: second } });
  });
});

describe("GET /v1/projects", () => {
  it("returns the organization, the calling project and its siblings, with no secrets or URLs", async () => {
    const { org, web, tracker, admin } = await routed();
    const r = await getProjects(web);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({
      organization: { id: org.id, name: "Acme" },
      project: { id: web.id, name: "Web", destination: { id: tracker.id, name: "Tracker" }, receives: false },
      projects: [
        { id: tracker.id, name: "Tracker", receives: true, isDestination: true },
        { id: admin.id, name: "Admin", receives: false, isDestination: false },
      ],
    });
    for (const p of [web, tracker]) {
      expect(text).not.toContain(p.secret);
      expect(text).not.toContain(p.webhook_secret);
    }
    expect(text).not.toContain("inbound");
    expect(text).not.toContain("127.0.0.1");
  });

  it("answers for a receiving project with no destination", async () => {
    const { tracker } = await routed();
    const out = (await (await getProjects(tracker)).json()) as any;
    expect(out.project).toEqual({ id: tracker.id, name: "Tracker", destination: null, receives: true });
    expect(out.projects.map((p: { name: string }) => p.name)).toEqual(["Web", "Admin"]);
  });

  it("never lists another organization's projects", async () => {
    const { web } = await routed();
    const other = await store.createOrg("Other", "o@other.com");
    const foreign = await store.createProject(other.id, "Foreign");
    const mine = await (await getProjects(web)).text();
    expect(mine).not.toContain("Foreign");
    const theirs = (await (await getProjects(foreign)).json()) as any;
    expect(theirs.organization.name).toBe("Other");
    expect(theirs.projects).toEqual([]);
  });

  it("fails closed on a bad signature, a wrong secret, a stale timestamp, missing headers or an unknown project", async () => {
    const { web, tracker } = await routed();
    expect((await getProjects(web, { secret: tracker.secret })).status).toBe(401);
    expect((await getProjects(web, { ts: Math.floor(Date.now() / 1000) - 600 })).status).toBe(401);
    for (const h of ["X-Loupe-Project", "X-Loupe-Timestamp", "X-Loupe-Signature"]) {
      expect((await getProjects(web, { omit: h })).status, h).toBe(401);
    }
    expect((await getProjects({ id: "prj_missing", secret: "x" })).status).toBe(404);
    expect((await fetch(`${base}/v1/projects`, { method: "POST" })).status).toBe(405);
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
      [`/projects/${project.id}/inbound`, { inbound_url: "https://evil.example" }],
      [`/projects/${project.id}/destination`, { destination_project_id: "" }],
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
        id: `dlv_${String(i).padStart(2, "0")}`, project_id: project.id, issue_id: `c_${i}`, destination_project_id: null,
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
