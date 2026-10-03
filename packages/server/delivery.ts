/**
 * Lifecycle delivery.
 *
 * When something happens to a thread, tell whichever integrations are mapped to it. Three
 * rules, all of them about not letting a notification become the thing that breaks:
 *
 *  - **Never throw.** A Slack outage must not fail the request that created the comment.
 *  - **Never block the response.** Dispatch is fire-and-forget from the caller's side, so
 *    a thread resolves instantly even when a provider is slow.
 *  - **Always record.** Every attempt ends in the delivery log, success or failure, so
 *    "it did not arrive" has an answer that is not guesswork.
 *
 * Retries are the same schedule the Hub webhook uses — one attempt, then 1s, then 4s —
 * because a rate-limited provider frequently succeeds on the second try and almost never
 * on the fifth.
 */

import { db } from "./db.ts";
import { scrubSecrets } from "./credentials.ts";
import {
  getIntegration, listMappings, targetsFor, setIntegrationError, httpTransport,
  type IntegrationEvent, type IntegrationMessage, type LifecyclePayload, type ProviderRegistry,
  type Transport,
} from "./integrations.ts";

/** Waits before attempt 2 and attempt 3 (so 3 attempts in total). */
export const RETRY_BACKOFF_MS = [1_000, 4_000];
export const SEND_TIMEOUT_MS = 10_000;

export interface DispatchOutcome {
  provider: string;
  target: string;
  status: "ok" | "failed" | "skipped";
  attempts: number;
  httpStatus?: number;
  error?: string;
  reason?: string;
}

/**
 * Send one message with bounded retries.
 *
 * A non-2xx is retried and a thrown error is retried, because a provider being briefly
 * unreachable and a provider answering 500 are the same problem from here.
 */
export async function sendWithRetries(
  send: () => Promise<{ ok: boolean; httpStatus?: number; error?: string }>,
  transport: Transport = httpTransport,
): Promise<{ ok: boolean; attempts: number; httpStatus?: number; error?: string }> {
  const maxAttempts = RETRY_BACKOFF_MS.length + 1;
  let httpStatus: number | undefined;
  let error: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await transport.sleep(RETRY_BACKOFF_MS[attempt - 2]!);
    try {
      const result = await send();
      httpStatus = result.httpStatus;
      if (result.ok) return { ok: true, attempts: attempt, httpStatus };
      error = result.error ?? `HTTP ${result.httpStatus ?? "?"}`;
    } catch (e) {
      httpStatus = undefined;
      const err = e as Error;
      error = err.name === "TimeoutError" ? `timeout after ${SEND_TIMEOUT_MS}ms` : String(err.message || err);
    }
  }
  return { ok: false, attempts: maxAttempts, httpStatus, error };
}

export interface DispatchOptions {
  registry: ProviderRegistry;
  transport?: Transport;
  /** Injected so a test can assert the log without a database round trip. */
  record?: (outcome: DispatchOutcome, message: IntegrationMessage | null) => Promise<void>;
}

/**
 * Deliver one lifecycle event to every mapping that should receive it.
 *
 * Returns what happened, per provider and target, so a caller (and a test) can see the
 * whole fan-out rather than a single boolean.
 */
export async function dispatch(
  projectKey: string,
  event: IntegrationEvent,
  payload: LifecyclePayload,
  opts: DispatchOptions,
): Promise<DispatchOutcome[]> {
  const transport = opts.transport ?? httpTransport;
  const outcomes: DispatchOutcome[] = [];
  const record = opts.record ?? defaultRecord;

  for (const provider of opts.registry.list()) {
    const integration = await getIntegration(projectKey, provider.id);
    if (!integration) continue;

    if (integration.status === "error") {
      // Already known-broken: say so rather than hammering the provider on every event.
      outcomes.push({ provider: provider.id, target: "-", status: "skipped", attempts: 0, reason: integration.lastError ?? "integration is in an error state" });
      continue;
    }

    const mappings = await listMappings(projectKey, provider.id);
    const matching = targetsFor(mappings, payload.repo);
    if (!matching.length) {
      outcomes.push({ provider: provider.id, target: "-", status: "skipped", attempts: 0, reason: "no mapping for this repo" });
      continue;
    }

    for (const mapping of matching) {
      const target = { id: mapping.targetId, name: mapping.targetName };
      const message = provider.render(event, payload, target);
      if (!message) {
        outcomes.push({ provider: provider.id, target: target.name, status: "skipped", attempts: 0, reason: `nothing to say for ${event}` });
        continue;
      }

      const result = await sendWithRetries(
        () => provider.send(integration.credentials, target, message, transport),
        transport,
      );
      const outcome: DispatchOutcome = {
        provider: provider.id,
        target: target.name,
        status: result.ok ? "ok" : "failed",
        attempts: result.attempts,
        httpStatus: result.httpStatus,
        error: result.error,
      };
      outcomes.push(outcome);

      // A credential problem is worth surfacing on the card: the token was revoked, or a
      // scope was removed, and every future event will fail the same way until it is
      // fixed. A transient 500 is not.
      if (!result.ok && result.error && /invalid_auth|token_revoked|Unauthorized|account_inactive/i.test(result.error)) {
        await setIntegrationError(projectKey, provider.id, result.error).catch(() => undefined);
      }
      await record(outcome, message).catch(() => undefined);
    }
  }
  return outcomes;
}

async function defaultRecord(outcome: DispatchOutcome, message: IntegrationMessage | null): Promise<void> {
  const d = await db();
  await d.query(
    `INSERT INTO integration_deliveries
       (id, provider, event, target, thread_id, status, http_status, attempts, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `dl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      outcome.provider,
      "lifecycle",
      outcome.target,
      message?.threadId ?? null,
      outcome.status,
      outcome.httpStatus ?? null,
      outcome.attempts,
      outcome.error ? scrubSecrets(outcome.error).slice(0, 500) : null,
    ],
  );
}

/**
 * Build the payload for a thread, including the deep link.
 *
 * The link is built here rather than in each provider because it is a property of *our*
 * product, not of Slack or Telegram — and getting the base URL wrong in one adapter
 * would be a link that works in one place and not another.
 */
export function lifecyclePayload(
  comment: { id: string; title?: string; body?: string; status?: string; priority?: string; url?: string; screenshotUrl?: string; pr?: any; projectKey?: string },
  extra: Partial<LifecyclePayload> = {},
): LifecyclePayload {
  const base = (process.env.LOUPE_PUBLIC_URL || process.env.LOUPE_API_URL || "").replace(/\/$/, "");
  return {
    threadId: comment.id,
    title: comment.title,
    body: comment.body,
    status: comment.status,
    priority: comment.priority,
    pageUrl: comment.url,
    screenshotUrl: comment.screenshotUrl,
    pr: comment.pr,
    deepLink: base ? `${base}/dashboard/?comment=${encodeURIComponent(comment.id)}` : undefined,
    ...extra,
  };
}

/**
 * Fire and forget.
 *
 * Called from request handlers, so it must not be awaited by them: a provider taking ten
 * seconds must not make creating a comment take ten seconds. Failures are swallowed here
 * because `dispatch` has already recorded them, and there is nobody left to tell.
 */
export function dispatchInBackground(
  projectKey: string,
  event: IntegrationEvent,
  payload: LifecyclePayload,
  opts: DispatchOptions,
): void {
  void dispatch(projectKey, event, payload, opts).catch(() => undefined);
}
