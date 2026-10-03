/**
 * The integration framework.
 *
 * The point of this file is the acceptance criterion: *adding a new provider requires
 * only an adapter, no framework changes*. Everything a provider-specific piece of code
 * needs to say is in `IntegrationProvider`, and the framework does the rest — storage,
 * encryption, admin gating, mappings, delivery, retries, the log.
 *
 * Lifecycle is one shape for every provider: **save credentials → test connection →
 * map repos to targets**. Slack and Telegram differ only in what "target" means and how
 * a message is rendered, which is exactly the size an adapter should be.
 */

import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { decryptBag, encryptBag, parseKey, redact, type RedactedCredential } from "./credentials.ts";

// ---- the adapter contract ---------------------------------------------------

/** What the settings UI collects. */
export interface CredentialField {
  key: string;
  label: string;
  /** Shown under the input — where to find the value, what scope it needs. */
  hint?: string;
  required?: boolean;
}

/** A place a message can go: a Slack channel, a Telegram chat. */
export interface IntegrationTarget {
  id: string;
  name: string;
  /** Extra context for the mapping table, e.g. whether the bot is a member. */
  note?: string;
}

export interface ConnectionTest {
  ok: boolean;
  /** Who we connected as — "Acme HQ (bot)", "Loupe Bot". Shown in the card. */
  identity?: string;
  targets?: IntegrationTarget[];
  /** The provider's own words, scrubbed of secrets. */
  error?: string;
  /**
   * What to do about it.
   *
   * Separate from `error` because the common failures are not self-explanatory: "not_in_channel"
   * is the provider saying something the person cannot act on until you translate it.
   */
  hint?: string;
}

/** The lifecycle moments worth telling a human about. */
export type IntegrationEvent =
  | "thread_created"
  | "agent_working"
  | "pr_created"
  | "thread_resolved"
  | "agent_replied"
  | (string & {});

export interface IntegrationMessage {
  /** Plain text — every provider can send this. */
  text: string;
  /** A URL to make the whole thing clickable. */
  deepLink?: string;
  /** Pre-rendered image URL, when the thread had a screenshot. */
  imageUrl?: string;
  /** The thread this is about, for the delivery log. */
  threadId?: string;
}

export interface SendResult {
  ok: boolean;
  httpStatus?: number;
  error?: string;
}

/** The seam a test drives instead of a network. */
export interface Transport {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
}

export const httpTransport: Transport = {
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
};

/**
 * Everything a provider has to implement.
 *
 * Deliberately small. `test` and `send` both take the transport, so a provider can be
 * tested against fixtures with no network and no mocking library.
 */
export interface IntegrationProvider {
  id: string;
  label: string;
  /** One line in the settings card, saying what it is for. */
  blurb: string;
  fields: CredentialField[];
  test(credentials: Record<string, string>, transport: Transport): Promise<ConnectionTest>;
  /** The message for one lifecycle event, or null to say nothing. */
  render(event: IntegrationEvent, payload: LifecyclePayload, target: IntegrationTarget): IntegrationMessage | null;
  send(
    credentials: Record<string, string>,
    target: IntegrationTarget,
    message: IntegrationMessage,
    transport: Transport,
  ): Promise<SendResult>;
}

/**
 * What a lifecycle event carries. Loose on purpose: the framework must not need changing
 * when a provider wants one more field.
 */
export interface LifecyclePayload {
  threadId: string;
  title?: string;
  body?: string;
  status?: string;
  priority?: string;
  url?: string;
  /** Absolute URL of the page the feedback was on. */
  pageUrl?: string;
  /** A link a person can click to open this thread. Built by the framework. */
  deepLink?: string;
  screenshotUrl?: string;
  pr?: { url?: string; number?: number };
  agent?: string;
  author?: { name?: string };
  repo?: string;
}

/**
 * The registry.
 *
 * A provider is registered by id and that is the only thing the framework knows. Nothing
 * in here enumerates providers, so adding one is an import and a `register` call.
 */
export class ProviderRegistry {
  private providers = new Map<string, IntegrationProvider>();

  register(provider: IntegrationProvider): void {
    if (!provider?.id) throw new Error("an integration provider needs an id");
    this.providers.set(provider.id, provider);
  }

  get(id: string): IntegrationProvider | undefined {
    return this.providers.get(id);
  }

  /** Sorted by id, so the settings page does not reorder itself between loads. */
  list(): IntegrationProvider[] {
    return [...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

// ---- storage ----------------------------------------------------------------

export interface IntegrationRecord {
  id: string;
  projectKey: string;
  provider: string;
  status: "connected" | "error";
  /** Never leaves this module in plaintext. */
  credentials: Record<string, string>;
  lastError?: string;
  identity?: string;
  updatedAt: string;
}

export interface IntegrationSummary {
  provider: string;
  label: string;
  blurb: string;
  fields: CredentialField[];
  connected: boolean;
  credential?: RedactedCredential;
  identity?: string;
  status: "connected" | "error" | "not_connected";
  lastError?: string;
  /** False when no encryption key is configured, so the UI can say why. */
  storable: boolean;
  mappings: MappingRecord[];
}

export interface MappingRecord {
  id: string;
  provider: string;
  repo: string;
  targetId: string;
  targetName: string;
}

export interface DeliveryRecord {
  id: string;
  provider: string;
  event: string;
  target: string;
  threadId?: string;
  status: "ok" | "failed";
  httpStatus: number | null;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

function rowToIntegration(r: any): IntegrationRecord {
  return {
    id: r.id,
    projectKey: r.project_key,
    provider: r.provider,
    status: r.status,
    credentials: {},
    lastError: r.last_error ?? undefined,
    identity: r.identity ?? undefined,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/** Read the key once. A missing key is a configuration state, not an exception here. */
export function credentialKey(): Buffer | null {
  try {
    return parseKey(process.env.LOUPE_CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

/** Whether credentials can be stored at all. */
export function storable(): boolean {
  return credentialKey() !== null;
}

export async function saveCredentials(
  projectKey: string,
  provider: string,
  credentials: Record<string, string>,
  identity?: string,
): Promise<IntegrationRecord> {
  const key = credentialKey();
  if (!key) throw new Error("no credential key configured — refusing to store credentials");
  const d = await db();
  const sealed = encryptBag(credentials, key);
  const { rows } = await d.query(
    `INSERT INTO integrations (id, project_key, provider, status, credentials, sealed, identity, updated_at)
     VALUES ($1,$2,$3,'connected',$4,$5,$6, now())
     ON CONFLICT (project_key, provider) DO UPDATE
       SET sealed = EXCLUDED.sealed, status = 'connected', identity = EXCLUDED.identity,
           last_error = NULL, updated_at = now()
     RETURNING *`,
    // `credentials` is written as an empty object on purpose: the sealed column is the
    // only place a token ever lands, so a `SELECT *` cannot leak one.
    [randomUUID(), projectKey, provider, JSON.stringify({}), sealed.sealed, identity ?? null],
  );
  return rowToIntegration(rows[0]);
}

export async function getIntegration(projectKey: string, provider: string): Promise<IntegrationRecord | null> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT * FROM integrations WHERE project_key = $1 AND provider = $2",
    [projectKey, provider],
  );
  if (!rows.length) return null;
  const record = rowToIntegration(rows[0]);
  const key = credentialKey();
  // A key that changed since the row was written means the credentials are unreadable;
  // report that rather than pretending the integration is fine.
  if (key && rows[0].sealed) {
    try {
      record.credentials = decryptBag(rows[0].sealed, key);
    } catch {
      record.status = "error";
      record.lastError = "Stored credentials could not be decrypted — reconnect the integration.";
    }
  }
  return record;
}

export async function disconnect(projectKey: string, provider: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query(
    "DELETE FROM integrations WHERE project_key = $1 AND provider = $2 RETURNING id",
    [projectKey, provider],
  );
  return rows.length > 0;
}

export async function listIntegrations(projectKey: string, registry: ProviderRegistry): Promise<IntegrationSummary[]> {
  const d = await db();
  const { rows } = await d.query("SELECT * FROM integrations WHERE project_key = $1", [projectKey]);
  const byProvider = new Map(rows.map((r: any) => [r.provider, r]));
  const key = credentialKey();

  const out: IntegrationSummary[] = [];
  for (const provider of registry.list()) {
    const row: any = byProvider.get(provider.id);
    const mappings = await listMappings(projectKey, provider.id);
    let credential: RedactedCredential | undefined;
    let status: IntegrationSummary["status"] = "not_connected";
    let lastError: string | undefined;
    let identity: string | undefined;

    if (row) {
      identity = row.identity ?? undefined;
      lastError = row.last_error ?? undefined;
      status = row.status === "error" ? "error" : "connected";
      if (key && row.sealed) {
        try {
          credential = redact(Object.keys(decryptBag(row.sealed, key)), new Date(row.updated_at).toISOString());
        } catch {
          status = "error";
          lastError = "Stored credentials could not be decrypted — reconnect the integration.";
        }
      }
    }

    out.push({
      provider: provider.id,
      label: provider.label,
      blurb: provider.blurb,
      fields: provider.fields,
      connected: Boolean(row),
      credential,
      identity,
      status,
      lastError,
      storable: storable(),
      mappings,
    });
  }
  return out;
}

export async function setIntegrationError(projectKey: string, provider: string, error: string): Promise<void> {
  const d = await db();
  await d.query(
    "UPDATE integrations SET status = 'error', last_error = $3, updated_at = now() WHERE project_key = $1 AND provider = $2",
    [projectKey, provider, error.slice(0, 500)],
  );
}

// ---- mappings ---------------------------------------------------------------

export async function addMapping(
  projectKey: string,
  provider: string,
  mapping: { repo: string; targetId: string; targetName: string },
): Promise<MappingRecord> {
  const d = await db();
  const { rows } = await d.query(
    `INSERT INTO integration_mappings (id, project_key, provider, repo, target_id, target_name)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (project_key, provider, repo) DO UPDATE
       SET target_id = EXCLUDED.target_id, target_name = EXCLUDED.target_name
     RETURNING *`,
    [randomUUID(), projectKey, provider, mapping.repo, mapping.targetId, mapping.targetName],
  );
  const r = rows[0];
  return { id: r.id, provider: r.provider, repo: r.repo, targetId: r.target_id, targetName: r.target_name };
}

export async function listMappings(projectKey: string, provider: string): Promise<MappingRecord[]> {
  const d = await db();
  const { rows } = await d.query(
    "SELECT * FROM integration_mappings WHERE project_key = $1 AND provider = $2 ORDER BY repo ASC",
    [projectKey, provider],
  );
  return rows.map((r: any) => ({
    id: r.id, provider: r.provider, repo: r.repo, targetId: r.target_id, targetName: r.target_name,
  }));
}

export async function removeMapping(projectKey: string, provider: string, repo: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query(
    "DELETE FROM integration_mappings WHERE project_key = $1 AND provider = $2 AND repo = $3 RETURNING id",
    [projectKey, provider, repo],
  );
  return rows.length > 0;
}

/**
 * Which mappings should receive this thread.
 *
 * A thread with no repository goes to every mapping for that provider — it is a general
 * thread, and dropping it because it has no repo would be a silent hole. A thread *with*
 * a repo goes only to the matching one, plus the wildcard if the project set one, because
 * `*` is how a person says "everything else goes here".
 */
export function targetsFor(mappings: MappingRecord[], repo?: string): MappingRecord[] {
  if (!mappings.length) return [];
  if (!repo) return mappings;
  const exact = mappings.filter((m) => m.repo === repo);
  if (exact.length) return exact;
  return mappings.filter((m) => m.repo === "*");
}

// ---- the delivery log ----

export async function listDeliveries(provider?: string, limit = 50): Promise<DeliveryRecord[]> {
  const d = await db();
  const { rows } = provider
    ? await d.query(
        "SELECT * FROM integration_deliveries WHERE provider = $1 ORDER BY created_at DESC LIMIT $2",
        [provider, limit],
      )
    : await d.query("SELECT * FROM integration_deliveries ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows.map((r: any) => ({
    id: r.id,
    provider: r.provider,
    event: r.event,
    target: r.target,
    threadId: r.thread_id ?? undefined,
    status: r.status,
    httpStatus: r.http_status,
    attempts: r.attempts,
    lastError: r.last_error ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
