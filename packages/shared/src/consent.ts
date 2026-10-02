/**
 * Letting an agent move the browser.
 *
 * An agent that can navigate is genuinely useful — "the fix is on the preview URL,
 * let me show you" — and genuinely dangerous if it happens silently. So navigation
 * is a **request** that a human answers, and the only way to get a URL out of this
 * module is to have granted one.
 *
 * The state machine is pure and lives here (not in the panel) because the safety
 * property is the point: `decide()` returns a URL only on an explicit grant, and
 * that is what the tests pin down.
 */

export type ConsentState = "idle" | "requested" | "granted" | "denied";

export interface NavigationRequest {
  id: string;
  /** Where the agent wants to go. Only http(s) is ever offered to the user. */
  url: string;
  /** Why — shown in the prompt so the answer can be informed. */
  reason?: string;
  /** Who is asking, e.g. "Claude Code". */
  requester?: string;
  /** ISO timestamp of the request. */
  at: string;
}

export interface ConsentDecision {
  url: string;
  decision: "granted" | "denied";
  at: string;
}

export interface ConsentRecord {
  state: ConsentState;
  request: NavigationRequest | null;
  /** Every decision this session, oldest first — an audit trail. */
  history: ConsentDecision[];
}

export function emptyConsent(): ConsentRecord {
  return { state: "idle", request: null, history: [] };
}

/** Only absolute http(s) may be requested — `javascript:` and friends never are. */
export function isNavigableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Queue a navigation request for the user to answer. A second request replaces the
 * first: two prompts at once would be a good way to get a careless yes.
 */
export function requestNavigation(
  record: ConsentRecord,
  request: Omit<NavigationRequest, "id" | "at"> & { id?: string; at?: string },
): ConsentRecord {
  if (!isNavigableUrl(request.url)) return record;
  return {
    state: "requested",
    request: {
      id: request.id ?? `nav${Date.now().toString(36)}`,
      at: request.at ?? new Date().toISOString(),
      url: request.url,
      reason: request.reason,
      requester: request.requester,
    },
    history: record.history,
  };
}

export function isPending(record: ConsentRecord): boolean {
  return record.state === "requested" && record.request !== null;
}

/**
 * Answer the pending request.
 *
 * Returns the record plus the URL to navigate to — `null` unless the user actually
 * granted it. Callers must use this return value rather than reading the request
 * themselves, which is the whole point: there is no path to a URL that skips the
 * decision.
 */
export function decide(
  record: ConsentRecord,
  granted: boolean,
  now: string = new Date().toISOString(),
): { record: ConsentRecord; navigateTo: string | null } {
  if (!isPending(record)) return { record, navigateTo: null };
  const url = record.request!.url;
  return {
    record: {
      state: granted ? "granted" : "denied",
      request: null,
      history: [...record.history, { url, decision: granted ? "granted" : "denied", at: now }],
    },
    navigateTo: granted ? url : null,
  };
}

/** Drop a pending request without deciding (a timeout, the panel closing). */
export function withdraw(record: ConsentRecord): ConsentRecord {
  return isPending(record) ? { ...record, state: "idle", request: null } : record;
}
