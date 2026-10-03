/**
 * The local HTTP bridge.
 *
 * Why this exists at all: a browser tab and an agent process have no way to see
 * each other. The extension can POST the element you just selected, the MCP tools
 * can read it back, and the panel can be told when a PR opens — all without a
 * server round-trip or a shared database.
 *
 * It binds **127.0.0.1 only**. This is a localhand-off between two programs on one
 * machine, and exposing it on a LAN interface would turn "the page you are looking
 * at" into something anyone on the network could read or forge.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { SelectionStore, validateSelection } from "./selection-store.ts";
import { AgentRegistry, type AgentRegistration } from "./agent-registry.ts";
import { PresenceRegistry, type PresenceJoin } from "./presence-registry.ts";
import { EventBus } from "./events.ts";

export interface BridgeDeps {
  store: SelectionStore;
  registry: AgentRegistry;
  presence: PresenceRegistry;
  bus: EventBus;
}

export interface BridgeHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

/** Bodies are selection payloads, not uploads. Anything larger is not one. */
export const MAX_BODY_BYTES = 1024 * 1024;
/** Keep-alive comment interval for SSE. */
export const SSE_KEEPALIVE_MS = 15_000;

export interface BridgeOptions {
  /** Retries on EADDRINUSE before giving up, 1.5s apart. */
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Start the bridge. Resolves to a handle, or to `null` when the port never became
 * free — a busy port is a nuisance, not a reason to take the MCP server down.
 */
export async function startHttpBridge(
  port: number,
  deps: BridgeDeps,
  opts: BridgeOptions = {},
): Promise<BridgeHandle | null> {
  const retries = opts.retries ?? 5;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const server = createServer((req, res) => { void handle(req, res, deps); });
    try {
      await listen(server, port);
      // The bound port, not the requested one: passing 0 asks the OS for a free port,
      // which is what tests (and any host that does not care) want.
      const bound = (server.address() as { port: number } | null)?.port ?? port;
      // Track the keep-alive timers so close() cannot leave one running.
      return {
        port: bound,
        url: `http://127.0.0.1:${bound}`,
        close: () => close(server),
      };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "EADDRINUSE" || attempt === retries) {
        if (code === "EADDRINUSE") {
          // Not fatal: the agent tools work without the bridge, they just cannot see
          // the browser. Say so plainly and carry on.
          console.error(`[loupe] bridge port ${port} is busy after ${retries + 1} attempts — continuing without it`);
          return null;
        }
        throw e;
      }
      await delay(retryDelayMs);
    }
  }
  return null;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => { server.removeListener("listening", onListening); reject(e); };
    const onListening = () => { server.removeListener("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Sockets held open by an SSE client would otherwise keep close() waiting.
    server.closeAllConnections?.();
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * CORS: the extension and a local page only.
 *
 * `chrome-extension://` origins are the extension; http://localhost and
 * 127.0.0.1 are the demo and a developer's own app. Everything else is refused,
 * so a random site cannot read what you have selected.
 */
export function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  if (origin.startsWith("chrome-extension://")) return origin;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]") return origin;
  } catch {
    return null;
  }
  return null;
}

function cors(res: ServerResponse, origin: string | undefined): void {
  const allowed = allowedOrigin(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
  }
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string): void {
  cors(res, origin);
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/** Read the body, refusing anything over the cap rather than buffering it forever. */
function readBody(req: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve({ ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve({ ok: true, text: Buffer.concat(chunks).toString("utf8") }));
    req.on("error", () => resolve({ ok: false, error: "could not read the request body" }));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: BridgeDeps): Promise<void> {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    cors(res, origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ---- health ------------------------------------------------------------
    if (method === "GET" && (path === "/health" || path === "/")) {
      return send(res, 200, {
        ok: true,
        selections: deps.store.size(),
        agents: deps.registry.size(),
        peers: deps.presence.size(),
        subscribers: deps.bus.count(),
      }, origin);
    }

    // ---- selections --------------------------------------------------------
    if (method === "POST" && path === "/selection") {
      const body = await readBody(req);
      if (!body.ok) return send(res, 400, { error: body.error }, origin);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.text);
      } catch {
        return send(res, 400, { error: "body is not valid JSON" }, origin);
      }
      const valid = validateSelection(parsed);
      if (!valid.ok) return send(res, 400, { error: valid.error }, origin);
      const stored = deps.store.add(valid.value);
      deps.bus.publish({ type: "selection", data: stored, at: stored.at! });
      return send(res, 201, { ok: true, correlationId: stored.correlationId, at: stored.at }, origin);
    }

    if (method === "GET" && path === "/selection/latest") {
      const latest = deps.store.latest();
      // Nothing selected is a normal state, not a 404 — the caller is a tool that
      // should explain rather than error.
      return send(res, 200, { selection: latest }, origin);
    }

    if (method === "GET" && path === "/selection/history") {
      const limit = Number(url.searchParams.get("limit") ?? deps.store.size());
      return send(res, 200, {
        selections: deps.store.history(Number.isFinite(limit) ? limit : deps.store.size()),
      }, origin);
    }

    if (method === "GET" && path === "/selection") {
      const correlationId = url.searchParams.get("correlationId") ?? "";
      return send(res, 200, { selection: deps.store.get(correlationId) }, origin);
    }

    if (method === "DELETE" && path === "/selection") {
      deps.store.clear();
      return send(res, 200, { ok: true, selections: 0 }, origin);
    }

    // ---- agents ------------------------------------------------------------
    if (method === "POST" && path === "/agents") {
      const body = await readBody(req);
      if (!body.ok) return send(res, 400, { error: body.error }, origin);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.text);
      } catch {
        return send(res, 400, { error: "body is not valid JSON" }, origin);
      }
      const reg = parsed as Partial<AgentRegistration>;
      if (!reg || typeof reg !== "object" || !reg.name || !reg.type || !reg.workspace) {
        return send(res, 400, { error: "name, type and workspace are required" }, origin);
      }
      const agent = deps.registry.register({ name: reg.name, type: reg.type, workspace: reg.workspace, cwd: reg.cwd });
      deps.bus.publish({ type: "agents", data: deps.registry.list(), at: new Date().toISOString() });
      return send(res, 201, { ok: true, agent }, origin);
    }

    if (method === "GET" && path === "/agents") {
      return send(res, 200, { agents: deps.registry.list() }, origin);
    }

    if (method === "POST" && path.startsWith("/agents/") && path.endsWith("/heartbeat")) {
      const id = path.slice("/agents/".length, -"/heartbeat".length);
      const agent = deps.registry.heartbeat(id);
      if (!agent) return send(res, 404, { error: "unknown agent" }, origin);
      return send(res, 200, { ok: true, agent }, origin);
    }

    if (method === "DELETE" && path.startsWith("/agents/")) {
      const id = path.slice("/agents/".length);
      return send(res, 200, { ok: deps.registry.unregister(id) }, origin);
    }

    // ---- presence ----------------------------------------------------------
    // Who else has this page open. Ephemeral by design: nothing is persisted, and a
    // peer that stops talking past the TTL disappears on its own.
    if (method === "POST" && path === "/presence") {
      const body = await readBody(req);
      if (!body.ok) return send(res, 400, { error: body.error }, origin);
      let parsed: unknown;
      try { parsed = JSON.parse(body.text); } catch { return send(res, 400, { error: "body is not valid JSON" }, origin); }
      const join = parsed as Partial<PresenceJoin>;
      if (!join || typeof join !== "object" || !join.url || !join.userId || !join.name) {
        return send(res, 400, { error: "url, userId and name are required" }, origin);
      }
      const peer = deps.presence.join({ url: join.url, userId: join.userId, name: join.name, tab: join.tab });
      deps.bus.publish({ type: "presence", data: deps.presence.list(), at: new Date().toISOString() });
      return send(res, 201, { ok: true, peer, peers: deps.presence.list(join.url, peer.id) }, origin);
    }

    if (method === "GET" && path === "/presence") {
      const pageUrl = url.searchParams.get("url") ?? undefined;
      const viewer = url.searchParams.get("viewer") ?? undefined;
      return send(res, 200, { peers: deps.presence.list(pageUrl, viewer) }, origin);
    }

    if (method === "POST" && path.startsWith("/presence/") && path.endsWith("/heartbeat")) {
      const id = path.slice("/presence/".length, -"/heartbeat".length);
      const peer = deps.presence.heartbeat(id);
      // 404 is meaningful here: the client should re-join rather than keep beating.
      if (!peer) return send(res, 404, { error: "unknown peer" }, origin);
      return send(res, 200, { ok: true, peer }, origin);
    }

    if (method === "DELETE" && path.startsWith("/presence/")) {
      const id = path.slice("/presence/".length);
      const gone = deps.presence.leave(id);
      if (gone) deps.bus.publish({ type: "presence", data: deps.presence.list(), at: new Date().toISOString() });
      return send(res, 200, { ok: gone }, origin);
    }

    // ---- thread updates (ingest) -------------------------------------------
    // The API owns the data and this process owns the SSE channel, so the API relays
    // through here rather than the other way round. Same body a tool would publish.
    if (method === "POST" && path === "/thread-updates") {
      const body = await readBody(req);
      if (!body.ok) return send(res, 400, { error: body.error }, origin);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.text);
      } catch {
        return send(res, 400, { error: "body is not valid JSON" }, origin);
      }
      const evt = parsed as { threadId?: unknown; eventType?: unknown; data?: unknown };
      if (!evt || typeof evt !== "object" || typeof evt.threadId !== "string" || !evt.threadId) {
        return send(res, 400, { error: "threadId is required" }, origin);
      }
      if (typeof evt.eventType !== "string" || !evt.eventType) {
        return send(res, 400, { error: "eventType is required" }, origin);
      }
      deps.bus.publishThread(evt.threadId, evt.eventType, evt.data);
      return send(res, 202, { ok: true }, origin);
    }

    // ---- events (SSE) ------------------------------------------------------
    // `/thread-updates` is the same stream filtered to thread events, kept because
    // that is the name the panel already knows.
    if (method === "GET" && (path === "/events" || path === "/thread-updates")) {
      return streamEvents(req, res, deps, path === "/thread-updates" ? "thread" : null, origin);
    }

    return send(res, 404, { error: `no route for ${method} ${path}` }, origin);
  } catch (e) {
    // A thrown handler must still answer — a hung socket is worse than a 500.
    if (!res.headersSent) send(res, 500, { error: e instanceof Error ? e.message : "bridge error" }, origin);
    else res.end();
  }
}

function streamEvents(
  req: IncomingMessage,
  res: ServerResponse,
  deps: BridgeDeps,
  only: "thread" | null,
  origin: string | undefined,
): void {
  cors(res, origin);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": loupe bridge\n\n");

  const write = (chunk: string) => { res.write(chunk); };
  const unsubscribe = deps.bus.subscribe((event) => {
    if (only && event.type !== only) return;
    write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  // A comment every 15s: proxies and browsers drop an idle SSE stream, and the
  // client uses these as a liveness signal.
  const keepAlive = setInterval(() => write(": ping\n\n"), SSE_KEEPALIVE_MS);
  if (typeof keepAlive.unref === "function") keepAlive.unref();

  const done = () => {
    clearInterval(keepAlive);
    unsubscribe();
  };
  req.on("close", done);
  req.on("error", done);
  res.on("close", done);
}
