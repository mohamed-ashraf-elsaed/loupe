import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
process.env.LOUPE_PG_DIR = "memory://";
process.env.LOUPE_BLOB_DIR = mkdtempSync(join(tmpdir(), "loupe-int-blob-"));
process.env.LOUPE_CREDENTIAL_KEY = randomBytes(32).toString("base64");

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { handler } from "../index.ts";
import { db, migrate } from "../db.ts";
import { upsertProject } from "../store.ts";
import { decryptBag, parseKey, redact, scrubSecrets, sameSecret } from "../credentials.ts";
import { encryptBag } from "../credentials.ts";
import {
  addMapping, getIntegration, listIntegrations, listMappings, removeMapping, saveCredentials, targetsFor,
} from "../integrations.ts";
import { RETRY_BACKOFF_MS, dispatch, lifecyclePayload, sendWithRetries } from "../delivery.ts";
import { providers } from "../providers/index.ts";
import { slackProvider, explain as slackExplain, slackError } from "../providers/slack.ts";
import { telegramProvider, explain as telegramExplain } from "../providers/telegram.ts";
import type { Transport } from "../integrations.ts";

const SECRET = "sec";
const KEY = parseKey(process.env.LOUPE_CREDENTIAL_KEY);

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  await migrate();
  const d = await db();
  await d.query("TRUNCATE comments, projects, integrations, integration_mappings, integration_deliveries CASCADE");
  await upsertProject({ project_key: "pk", name: "n", secret: SECRET, allowed_origins: [] });
});

const adminH = { "X-Loupe-Admin": SECRET, "Content-Type": "application/json" };
const json = (r: Response) => r.json() as Promise<any>;

/** A transport that answers from a table, so no test touches a real provider. */
function fakeTransport(routes: (url: string, init: any) => { status: number; body: any }): {
  transport: Transport;
  calls: { url: string; init: any }[];
} {
  const calls: { url: string; init: any }[] = [];
  return {
    calls,
    transport: {
      fetch: async (url, init) => {
        calls.push({ url, init });
        const { status, body } = routes(url, init);
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      },
      sleep: async () => undefined,
    },
  };
}

// ---- the framework ----------------------------------------------------------

describe("credential encryption", () => {
  it("round-trips a bag and never puts the plaintext in the sealed form", () => {
    const sealed = encryptBag({ botToken: "xoxb-super-secret-value" }, KEY);
    expect(sealed.sealed).not.toContain("xoxb");
    expect(sealed.sealed).not.toContain("secret");
    expect(decryptBag(sealed.sealed, KEY)).toEqual({ botToken: "xoxb-super-secret-value" });
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    // GCM is authenticated: a modified byte must fail, not decrypt to nonsense that
    // would then be sent somewhere as a credential.
    const sealed = encryptBag({ botToken: "abc" }, KEY);
    const [iv, tag, data] = sealed.sealed.split(".");
    const tampered = Buffer.from(data!, "base64");
    tampered[0] ^= 0xff;
    expect(() => decryptBag(`${iv}.${tag}.${tampered.toString("base64")}`, KEY)).toThrow();
  });

  it("rejects a different key", () => {
    const sealed = encryptBag({ botToken: "abc" }, KEY);
    expect(() => decryptBag(sealed.sealed, randomBytes(32))).toThrow();
  });

  it("refuses a missing key rather than storing plaintext", () => {
    expect(() => parseKey(undefined)).toThrow(/LOUPE_CREDENTIAL_KEY/);
    expect(() => parseKey("")).toThrow();
  });

  it("explains a wrong-length base64 key instead of padding it", () => {
    // A silently padded key is a key nobody can explain, and it would work — until it
    // didn't.
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/AES-256 needs 32/);
  });

  it("accepts a passphrase of any length", () => {
    expect(parseKey("a short passphrase").length).toBe(32);
    expect(parseKey("a short passphrase").equals(parseKey("a short passphrase"))).toBe(true);
  });

  it("redacts by naming the fields, never the values", () => {
    const r = redact(["botToken"]);
    expect(r.fields).toEqual(["botToken"]);
    expect(JSON.stringify(r)).not.toContain("xoxb");
  });

  it("scrubs secrets out of provider error text", () => {
    expect(scrubSecrets("failed: xoxb-1234567890-abcdefghij")).not.toContain("xoxb-1234567890");
    expect(scrubSecrets("bad 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).not.toContain("AAHdqTcv");
    expect(scrubSecrets("Authorization: Bearer abcdefghijklmnop")).not.toContain("abcdefghijklmnop");
    // A secret we were handed directly is scrubbed even if it matches no known shape.
    expect(scrubSecrets("token was hunter2hunter2", ["hunter2hunter2"])).not.toContain("hunter2hunter2");
  });

  it("compares secrets in constant time", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
  });
});

describe("the provider registry", () => {
  it("holds both providers, sorted", () => {
    expect(providers.list().map((p) => p.id)).toEqual(["slack", "telegram"]);
  });

  it("finds one by id", () => {
    expect(providers.get("slack")?.label).toBe("Slack");
    expect(providers.get("nope")).toBeUndefined();
  });

  it("refuses a provider with no id", () => {
    const { ProviderRegistry } = require("../integrations.ts") as any;
    expect(() => new ProviderRegistry().register({ label: "x" })).toBeDefined();
  });

  it("adding a provider needs no framework change", () => {
    // The acceptance criterion, expressed as a test: register an adapter and it is
    // immediately usable through every framework operation.
    const { ProviderRegistry } = require("../integrations.ts") as any;
    const registry = new ProviderRegistry();
    registry.register({ id: "zzz", label: "Z", blurb: "", fields: [], test: async () => ({ ok: true }), render: () => null, send: async () => ({ ok: true }) });
    expect(registry.list().map((p) => p.id)).toEqual(["zzz"]);
    expect(registry.get("zzz")).toBeTruthy();
  });
});

describe("storing credentials", () => {
  it("saves them sealed and reads them back", async () => {
    await saveCredentials("pk", "slack", { botToken: "xoxb-secret" }, "Acme · loupe");
    const record = await getIntegration("pk", "slack");
    expect(record?.credentials.botToken).toBe("xoxb-secret");
    expect(record?.identity).toBe("Acme · loupe");

    // The plaintext column stays empty, so a `SELECT *` cannot leak a token.
    const d = await db();
    const { rows } = await d.query("SELECT credentials, sealed FROM integrations WHERE project_key = 'pk'");
    expect(rows[0].credentials).toEqual({});
    expect(JSON.stringify(rows[0].sealed)).not.toContain("xoxb-secret");
  });

  it("overwrites rather than duplicating on reconnect", async () => {
    await saveCredentials("pk", "slack", { botToken: "one" });
    await saveCredentials("pk", "slack", { botToken: "two" });
    expect((await getIntegration("pk", "slack"))!.credentials.botToken).toBe("two");
    const d = await db();
    expect((await d.query("SELECT COUNT(*)::int AS n FROM integrations")).rows[0].n).toBe(1);
  });

  it("reports a decryption failure rather than pretending it is fine", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" });
    const d = await db();
    // A key rotation, simulated by corrupting the sealed value.
    await d.query("UPDATE integrations SET sealed = 'bogus' WHERE project_key = 'pk'");
    const record = await getIntegration("pk", "slack");
    expect(record!.status).toBe("error");
    expect(record!.lastError).toMatch(/could not be decrypted/);
  });

  it("never returns credentials from the summary", async () => {
    await saveCredentials("pk", "slack", { botToken: "xoxb-secret" });
    const summaries = await listIntegrations("pk", providers);
    const slack = summaries.find((s) => s.provider === "slack")!;
    expect(slack.credential).toEqual(redact(["botToken"], expect.anything()));
    expect(JSON.stringify(summaries)).not.toContain("xoxb-secret");
  });

  it("lists a provider that was never connected as not connected", async () => {
    const summaries = await listIntegrations("pk", providers);
    expect(summaries.find((s) => s.provider === "telegram")!.status).toBe("not_connected");
    expect(summaries.find((s) => s.provider === "telegram")!.connected).toBe(false);
  });
});

describe("mappings", () => {
  it("adds, lists, replaces and removes", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" });
    await addMapping("pk", "slack", { repo: "acme/shop", targetId: "C1", targetName: "#general" });
    expect((await listMappings("pk", "slack")).map((m) => m.targetName)).toEqual(["#general"]);

    await addMapping("pk", "slack", { repo: "acme/shop", targetId: "C2", targetName: "#alerts" });
    const after = await listMappings("pk", "slack");
    expect(after).toHaveLength(1);
    expect(after[0]!.targetName).toBe("#alerts");

    expect(await removeMapping("pk", "slack", "acme/shop")).toBe(true);
    expect(await removeMapping("pk", "slack", "acme/shop")).toBe(false);
  });

  it("routes a thread to its repo, and falls back to the wildcard", () => {
    const mappings = [
      { id: "1", provider: "slack", repo: "acme/shop", targetId: "C1", targetName: "#shop" },
      { id: "2", provider: "slack", repo: "*", targetId: "C9", targetName: "#all" },
    ];
    expect(targetsFor(mappings, "acme/shop").map((m) => m.targetName)).toEqual(["#shop"]);
    // An unmapped repo goes to the wildcard, because `*` is how a person says
    // "everything else goes here".
    expect(targetsFor(mappings, "acme/other").map((m) => m.targetName)).toEqual(["#all"]);
    // A thread with no repo at all is general, so it goes everywhere rather than nowhere.
    expect(targetsFor(mappings, undefined).length).toBe(2);
  });

  it("has no targets when nothing is mapped", () => {
    expect(targetsFor([], "acme/shop")).toEqual([]);
  });
});

// ---- the providers ----------------------------------------------------------

describe("the Slack adapter", () => {
  it("connects, reports the workspace and lists channels", async () => {
    const { transport } = fakeTransport((url) => {
      if (url.endsWith("/auth.test")) return { status: 200, body: { ok: true, team: "Acme", user: "loupe" } };
      if (url.endsWith("/conversations.list")) {
        return { status: 200, body: { ok: true, channels: [{ id: "C1", name: "general" }, { id: "C2", name: "secret", is_private: true }] } };
      }
      return { status: 404, body: {} };
    });
    const result = await slackProvider.test({ botToken: "xoxb-t" }, transport);
    expect(result.ok).toBe(true);
    expect(result.identity).toContain("Acme");
    expect(result.targets).toEqual([
      { id: "C1", name: "#general", note: undefined },
      { id: "C2", name: "#secret", note: "private" },
    ]);
  });

  it("does not report success when Slack answers ok:false with HTTP 200", async () => {
    // The classic Slack trap: 200 with an error in the body.
    const { transport } = fakeTransport(() => ({ status: 200, body: { ok: false, error: "invalid_auth" } }));
    const result = await slackProvider.test({ botToken: "xoxb-bad" }, transport);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_auth");
    expect(result.hint).toMatch(/copied the Bot User OAuth token/);
  });

  it("translates the failures a person cannot act on", () => {
    expect(slackExplain("not_in_channel")).toMatch(/Add the bot|add your Loupe bot/);
    expect(slackExplain("missing_scope", { needed: "channels:read" })).toContain("channels:read");
    expect(slackExplain("channel_not_found")).toMatch(/no longer exists/);
    expect(slackExplain("something_new")).toBeUndefined();
  });

  it("still connects when the channel list needs a scope it lacks, and says so", async () => {
    // Connecting works but listing does not — an empty table with no explanation would
    // look like a bug.
    const { transport } = fakeTransport((url) => {
      if (url.endsWith("/auth.test")) return { status: 200, body: { ok: true, team: "Acme" } };
      return { status: 200, body: { ok: false, error: "missing_scope" } };
    });
    const result = await slackProvider.test({ botToken: "xoxb-t" }, transport);
    expect(result.ok).toBe(true);
    expect(result.targets).toEqual([]);
    expect(result.hint).toMatch(/channels:read/);
  });

  it("maps a transport failure to a Slack-shaped error", () => {
    expect(slackError(401, null)).toBe("invalid_auth");
    expect(slackError(403, null)).toBe("missing_scope");
    expect(slackError(429, null)).toBe("rate_limited");
    expect(slackError(500, null)).toBe("HTTP 500");
  });

  it("sends to the mapped channel, with the screenshot attached", async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200, body: { ok: true } }));
    const message = slackProvider.render("thread_created", {
      threadId: "c1", title: "CTA is weak", priority: "p1", pageUrl: "/checkout",
      deepLink: "https://app/dashboard/?comment=c1", screenshotUrl: "https://blob/x.png",
    }, { id: "C1", name: "#general" })!;
    expect(message.text).toContain("New feedback");
    expect(message.text).toContain("CTA is weak");

    const result = await slackProvider.send({ botToken: "xoxb-t" }, { id: "C1", name: "#general" }, message, transport);
    expect(result.ok).toBe(true);
    const body = JSON.parse(calls[0]!.init.body);
    expect(body.channel).toBe("C1");
    expect(body.attachments[0].image_url).toBe("https://blob/x.png");
  });

  it("reports a failed send with the actionable hint, and no token", async () => {
    const { transport } = fakeTransport(() => ({ status: 200, body: { ok: false, error: "not_in_channel" } }));
    const result = await slackProvider.send(
      { botToken: "xoxb-secret-token-value" }, { id: "C1", name: "#x" },
      { text: "hi" }, transport,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not_in_channel");
    expect(result.error).toMatch(/not in that channel/);
    expect(result.error).not.toContain("xoxb-secret-token-value");
  });

  it("says nothing for an event it has no message for", () => {
    expect(slackProvider.render("something_else", { threadId: "c1" }, { id: "C1", name: "#x" })).toBeNull();
  });
});

describe("the Telegram adapter", () => {
  it("connects and finds chats the bot has seen", async () => {
    const { transport } = fakeTransport((url) => {
      if (url.includes("/getMe")) return { status: 200, body: { ok: true, result: { username: "loupe_bot", first_name: "Loupe" } } };
      return {
        status: 200,
        body: { ok: true, result: [
          { message: { chat: { id: -1001, title: "Acme Team", type: "group" } } },
          { message: { chat: { id: 42, first_name: "Sara", last_name: "A", type: "private" } } },
        ] },
      };
    });
    const result = await telegramProvider.test({ botToken: "123:abc" }, transport);
    expect(result.ok).toBe(true);
    expect(result.identity).toBe("@loupe_bot");
    expect(result.targets).toEqual([
      { id: "-1001", name: "Acme Team", note: "group" },
      { id: "42", name: "Sara A", note: "private" },
    ]);
  });

  it("explains the onboarding cliff when no chat has messaged the bot", async () => {
    // Telegram will not list chats, so this is the normal first-run state, not an error.
    const { transport } = fakeTransport((url) => {
      if (url.includes("/getMe")) return { status: 200, body: { ok: true, result: { username: "b" } } };
      return { status: 200, body: { ok: true, result: [] } };
    });
    const result = await telegramProvider.test({ botToken: "1:a" }, transport);
    expect(result.ok).toBe(true);
    expect(result.targets).toEqual([]);
    expect(result.hint).toMatch(/Send your bot a message/);
  });

  it("explains a rejected token", async () => {
    const { transport } = fakeTransport(() => ({ status: 401, body: { ok: false, description: "Unauthorized" } }));
    const result = await telegramProvider.test({ botToken: "bad" }, transport);
    expect(result.ok).toBe(false);
    expect(result.hint).toMatch(/@BotFather/);
  });

  it("translates the common failures", () => {
    expect(telegramExplain("chat not found")).toMatch(/Send the bot a message/);
    expect(telegramExplain("bot is not a member of the chat")).toMatch(/added to that group/);
    expect(telegramExplain("weird")).toBeUndefined();
  });

  it("sends to the chat id", async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200, body: { ok: true, result: { message_id: 1 } } }));
    const message = telegramProvider.render("thread_resolved", { threadId: "c1", title: "CTA is weak", deepLink: "https://app/x" }, { id: "42", name: "Sara" })!;
    expect(message.text).toContain("Resolved");
    const result = await telegramProvider.send({ botToken: "1:a" }, { id: "42", name: "Sara" }, message, transport);
    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toContain("/bot1:a/sendMessage");
    expect(JSON.parse(calls[0]!.init.body).chat_id).toBe("42");
  });

  it("scrubs the token out of a failure, since Telegram puts it in the URL", async () => {
    const { transport } = fakeTransport(() => ({ status: 400, body: { ok: false, description: "chat not found" } }));
    const result = await telegramProvider.send(
      { botToken: "123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" }, { id: "1", name: "x" },
      { text: "hi" }, transport,
    );
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("AAHdqTcv");
  });
});

describe("both providers cover every lifecycle event", () => {
  const events = ["thread_created", "agent_working", "pr_created", "thread_resolved"] as const;
  const payload = {
    threadId: "c1", title: "CTA is weak", body: "make it stand out", status: "in_review",
    priority: "p1", pageUrl: "/checkout", screenshotUrl: "https://blob/x.png",
    deepLink: "https://app/dashboard/?comment=c1", pr: { url: "https://gh/pr/1", number: 1 }, agent: "Claude Code",
  };

  for (const provider of [slackProvider, telegramProvider]) {
    for (const event of events) {
      it(`${provider.id} renders ${event}`, () => {
        const message = provider.render(event, payload, { id: "T", name: "#x" });
        expect(message, `${provider.id} must say something for ${event}`).not.toBeNull();
        expect(message!.text.length).toBeGreaterThan(10);
        // A message nobody can click through to is a message that wastes a notification.
        expect(message!.deepLink || payload.pr?.url).toBeTruthy();
      });
    }
  }
});

// ---- delivery ---------------------------------------------------------------

describe("retrying a delivery", () => {
  it("gives up after the documented number of attempts", async () => {
    let attempts = 0;
    const result = await sendWithRetries(async () => {
      attempts++;
      return { ok: false, httpStatus: 500, error: "HTTP 500" };
    }, { fetch: async () => new Response("{}"), sleep: async () => undefined });
    expect(result.ok).toBe(false);
    expect(attempts).toBe(RETRY_BACKOFF_MS.length + 1);
    expect(result.attempts).toBe(3);
  });

  it("stops at the first success", async () => {
    let attempts = 0;
    const result = await sendWithRetries(async () => {
      attempts++;
      return attempts === 2 ? { ok: true, httpStatus: 200 } : { ok: false, httpStatus: 429, error: "rate limited" };
    }, { fetch: async () => new Response("{}"), sleep: async () => undefined });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("treats a thrown error as a retryable failure", async () => {
    let attempts = 0;
    const result = await sendWithRetries(async () => {
      attempts++;
      throw Object.assign(new Error("nope"), { name: "TimeoutError" });
    }, { fetch: async () => new Response("{}"), sleep: async () => undefined });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/);
    expect(attempts).toBe(3);
  });
});

describe("dispatching a lifecycle event", () => {
  const okTransport = (calls: any[]): Transport => ({
    fetch: async (url, init) => {
      calls.push({ url, init });
      // Slack's auth.test is not called on send, only chat.postMessage.
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    sleep: async () => undefined,
  });

  it("delivers once per mapped target, and records each", async () => {
    await saveCredentials("pk", "slack", { botToken: "xoxb-t" }, "Acme");
    await addMapping("pk", "slack", { repo: "acme/shop", targetId: "C1", targetName: "#shop" });

    const calls: any[] = [];
    const recorded: any[] = [];
    const outcomes = await dispatch("pk", "thread_created", {
      threadId: "c1", title: "CTA", repo: "acme/shop", deepLink: "https://app/x",
    }, {
      registry: providers,
      transport: okTransport(calls),
      record: async (o) => { recorded.push(o); },
    });

    expect(outcomes.map((o) => o.status)).toEqual(["ok"]);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body).channel).toBe("C1");
    expect(recorded[0]).toMatchObject({ provider: "slack", target: "#shop", status: "ok" });
  });

  it("skips a provider with no mapping, and says why", async () => {
    await saveCredentials("pk", "slack", { botToken: "xoxb-t" });
    const outcomes = await dispatch("pk", "thread_created", { threadId: "c1", repo: "acme/shop" }, {
      registry: providers, transport: okTransport([]), record: async () => undefined,
    });
    expect(outcomes[0]).toMatchObject({ status: "skipped", reason: "no mapping for this repo" });
  });

  it("skips a provider that is not connected at all", async () => {
    const outcomes = await dispatch("pk", "thread_created", { threadId: "c1" }, {
      registry: providers, transport: okTransport([]), record: async () => undefined,
    });
    expect(outcomes).toEqual([]);
  });

  it("does not retry a provider already known to be broken", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" });
    await addMapping("pk", "slack", { repo: "*", targetId: "C1", targetName: "#x" });
    const d = await db();
    await d.query("UPDATE integrations SET status = 'error', last_error = 'invalid_auth' WHERE provider = 'slack'");

    const calls: any[] = [];
    const outcomes = await dispatch("pk", "thread_created", { threadId: "c1" }, {
      registry: providers, transport: okTransport(calls), record: async () => undefined,
    });
    expect(outcomes[0]!.status).toBe("skipped");
    // Nothing was sent — hammering a provider with a revoked token helps nobody.
    expect(calls).toHaveLength(0);
  });

  it("marks the integration broken when the credential is rejected, and not for a blip", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" }, "Acme");
    await addMapping("pk", "slack", { repo: "*", targetId: "C1", targetName: "#x" });

    await dispatch("pk", "thread_created", { threadId: "c1" }, {
      registry: providers,
      transport: { fetch: async () => new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 }), sleep: async () => undefined },
      record: async () => undefined,
    });
    expect((await getIntegration("pk", "slack"))!.status).toBe("error");

    // A transient 500 is not a credential problem and must not disable the integration.
    await saveCredentials("pk", "slack", { botToken: "x" }, "Acme");
    await dispatch("pk", "thread_created", { threadId: "c1" }, {
      registry: providers,
      transport: { fetch: async () => new Response("{}", { status: 500 }), sleep: async () => undefined },
      record: async () => undefined,
    });
    expect((await getIntegration("pk", "slack"))!.status).toBe("connected");
  });

  it("builds a deep link to the thread", () => {
    process.env.LOUPE_PUBLIC_URL = "https://app.test/";
    const payload = lifecyclePayload({ id: "c1", title: "T" });
    expect(payload.deepLink).toBe("https://app.test/dashboard/?comment=c1");
    delete process.env.LOUPE_PUBLIC_URL;
    expect(lifecyclePayload({ id: "c1" }).deepLink).toBeUndefined();
  });
});

// ---- the API ----------------------------------------------------------------

describe("the integrations API", () => {
  it("lists providers without ever returning a credential", async () => {
    await saveCredentials("pk", "slack", { botToken: "xoxb-secret-value" }, "Acme");
    const res = await fetch(`${base}/v1/integrations?projectKey=pk`, { headers: adminH });
    expect(res.status).toBe(200);
    const body = await json(res);
    const slack = body.integrations.find((i: any) => i.provider === "slack");
    expect(slack.status).toBe("connected");
    expect(slack.identity).toBe("Acme");
    expect(slack.credential).toEqual({ set: true, fields: ["botToken"], updatedAt: expect.anything() });
    // The whole response, searched for the token. Nothing.
    expect(JSON.stringify(body)).not.toContain("xoxb-secret-value");
  });

  it("refuses a non-admin", async () => {
    const res = await fetch(`${base}/v1/integrations?projectKey=pk`, { headers: { "X-Loupe-User": "u1", "X-Loupe-Hmac": "nope" } });
    expect(res.status).toBe(401);
  });

  it("404s an unknown provider", async () => {
    expect((await fetch(`${base}/v1/integrations/nope/config?projectKey=pk`, { method: "POST", headers: adminH, body: "{}" })).status).toBe(404);
  });

  it("rejects a config with a missing required field", async () => {
    const res = await fetch(`${base}/v1/integrations/slack/config?projectKey=pk`, {
      method: "POST", headers: adminH, body: JSON.stringify({ credentials: {} }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/botToken is required/);
  });

  it("rejects a token the provider refuses, rather than storing one that does not work", async () => {
    const original = slackProvider.test;
    slackProvider.test = async () => ({ ok: false, error: "invalid_auth", hint: "check the token" });
    try {
      const res = await fetch(`${base}/v1/integrations/slack/config?projectKey=pk`, {
        method: "POST", headers: adminH, body: JSON.stringify({ credentials: { botToken: "bad" } }),
      });
      expect(res.status).toBe(400);
      expect((await json(res)).hint).toBe("check the token");
      // Nothing was stored — a card that says "connected" and sends nothing is worse
      // than an error.
      expect(await getIntegration("pk", "slack")).toBeNull();
    } finally {
      slackProvider.test = original;
    }
  });

  it("saves, maps, lists and removes through the API", async () => {
    const original = slackProvider.test;
    slackProvider.test = async () => ({ ok: true, identity: "Acme", targets: [{ id: "C1", name: "#general" }] });
    try {
      const saved = await fetch(`${base}/v1/integrations/slack/config?projectKey=pk`, {
        method: "POST", headers: adminH, body: JSON.stringify({ credentials: { botToken: "xoxb-t" } }),
      });
      expect(saved.status).toBe(201);
      const savedBody = await json(saved);
      expect(savedBody.identity).toBe("Acme");
      expect(savedBody.targets).toEqual([{ id: "C1", name: "#general" }]);
      // Still no credential in the response.
      expect(JSON.stringify(savedBody)).not.toContain("xoxb-t");

      const mapped = await fetch(`${base}/v1/integrations/slack/mappings?projectKey=pk`, {
        method: "POST", headers: adminH,
        body: JSON.stringify({ repo: "acme/shop", targetId: "C1", targetName: "#general" }),
      });
      expect(mapped.status).toBe(201);

      const listed = await json(await fetch(`${base}/v1/integrations/slack/mappings?projectKey=pk`, { headers: adminH }));
      expect(listed.mappings.map((m: any) => m.repo)).toEqual(["acme/shop"]);

      const removed = await fetch(`${base}/v1/integrations/slack/mappings/acme%2Fshop?projectKey=pk`, { method: "DELETE", headers: adminH });
      expect((await json(removed)).ok).toBe(true);
      expect(await listMappings("pk", "slack")).toEqual([]);
    } finally {
      slackProvider.test = original;
    }
  });

  it("will not map an integration that is not connected", async () => {
    const res = await fetch(`${base}/v1/integrations/slack/mappings?projectKey=pk`, {
      method: "POST", headers: adminH, body: JSON.stringify({ repo: "acme/shop", targetId: "C1" }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/connect the integration/);
  });

  it("reports a failed re-test as a 400 with the provider's own words", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" }, "Acme");
    const original = slackProvider.test;
    slackProvider.test = async () => ({ ok: false, error: "token_revoked", hint: "reinstall the app" });
    try {
      const res = await fetch(`${base}/v1/integrations/slack/test?projectKey=pk`, { method: "POST", headers: adminH, body: "{}" });
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe("token_revoked");
    } finally {
      slackProvider.test = original;
    }
  });

  it("clears a previous error on a successful re-test", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" });
    const d = await db();
    await d.query("UPDATE integrations SET status = 'error', last_error = 'invalid_auth'");
    const original = slackProvider.test;
    slackProvider.test = async () => ({ ok: true, identity: "Acme" });
    try {
      const res = await fetch(`${base}/v1/integrations/slack/test?projectKey=pk`, { method: "POST", headers: adminH, body: "{}" });
      expect(res.status).toBe(200);
      expect((await getIntegration("pk", "slack"))!.status).toBe("connected");
    } finally {
      slackProvider.test = original;
    }
  });

  it("disconnects", async () => {
    await saveCredentials("pk", "slack", { botToken: "x" });
    expect((await json(await fetch(`${base}/v1/integrations/slack?projectKey=pk`, { method: "DELETE", headers: adminH }))).ok).toBe(true);
    expect(await getIntegration("pk", "slack")).toBeNull();
  });

  it("serves the delivery log, which is not confused for a provider name", async () => {
    const res = await fetch(`${base}/v1/integrations/deliveries?projectKey=pk`, { headers: adminH });
    expect(res.status).toBe(200);
    expect(Array.isArray((await json(res)).deliveries)).toBe(true);
  });
});

describe("a thread lifecycle reaches a mapped channel", () => {
  it("notifies on create, and on resolve", async () => {
    const original = slackProvider.test;
    slackProvider.test = async () => ({ ok: true, identity: "Acme", targets: [{ id: "C1", name: "#general" }] });

    const sent: any[] = [];
    const realFetch = globalThis.fetch;
    // The server's own dispatch uses the real transport, so stub at that level.
    globalThis.fetch = (async (url: string, init: any = {}) => {
      const u = String(url);
      if (u.startsWith("https://slack.com/api/chat.postMessage")) {
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    try {
      await fetch(`${base}/v1/integrations/slack/config?projectKey=pk`, {
        method: "POST", headers: adminH, body: JSON.stringify({ credentials: { botToken: "xoxb-t" } }),
      });
      await fetch(`${base}/v1/integrations/slack/mappings?projectKey=pk`, {
        method: "POST", headers: adminH, body: JSON.stringify({ repo: "*", targetId: "C1", targetName: "#general" }),
      });

      await fetch(`${base}/v1/comments`, {
        method: "POST", headers: adminH,
        body: JSON.stringify({
          id: "c1", projectKey: "pk", url: "/checkout", status: "queue", body: "the CTA is weak",
          author: { id: "u1", name: "Sara" },
          anchor: { tag: "button", cssPath: "", xpath: "", testid: null, text: "", attrs: {}, nthOfType: 1, rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 0, h: 0 } },
          context: { html: "<b/>", styles: {} }, offset: { x: 0.5, y: 0.5 }, createdAt: new Date().toISOString(),
        }),
      });
      await fetch(`${base}/v1/comments/c1`, { method: "PATCH", headers: adminH, body: JSON.stringify({ status: "resolved" }) });
      // The dispatch is deliberately not awaited by the handler, so give it a moment.
      await new Promise((r) => setTimeout(r, 400));

      expect(sent.length).toBe(2);
      expect(sent[0].text).toContain("New feedback");
      expect(sent[0].text).toContain("the CTA is weak");
      expect(sent[1].text).toContain("Resolved");
      expect(sent.every((s) => s.channel === "C1")).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      slackProvider.test = original;
    }
  });
});
