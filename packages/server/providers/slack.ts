/**
 * Slack.
 *
 * Everything here is the adapter; nothing here is framework. The only Slack-specific
 * knowledge is three URLs and how to phrase the common failures, which is the size the
 * framework was built to allow.
 *
 * The failure modes are the interesting part. Slack answers with HTTP 200 and
 * `{ok: false, error: "..."}` for most problems, so a naive client reports success. And
 * its error codes are not self-explanatory to a person: `not_in_channel` means "invite
 * the bot", `missing_scope` means "add one of these scopes and reinstall".
 */

import { scrubSecrets } from "../credentials.ts";
import type {
  ConnectionTest, IntegrationEvent, IntegrationMessage, IntegrationProvider, IntegrationTarget,
  LifecyclePayload, SendResult, Transport,
} from "../integrations.ts";

const API = "https://slack.com/api";

/** Translate Slack's codes into something a person can act on. */
export function explain(error: string, extra: { needed?: string } = {}): string | undefined {
  switch (error) {
    case "not_in_channel":
      return "The bot is not in that channel. In Slack, open the channel → Integrations → Add apps, and add your Loupe bot.";
    case "missing_scope":
      return extra.needed
        ? `The bot token is missing a scope. Add ${extra.needed} to the app's OAuth scopes and reinstall it.`
        : "The bot token is missing a required scope. Add it in the app's OAuth settings and reinstall the app.";
    case "invalid_auth":
    case "token_revoked":
    case "account_inactive":
      return "Slack rejected the token. Reinstall the app, or check you copied the Bot User OAuth token (it starts with xoxb-).";
    case "channel_not_found":
      return "That channel no longer exists, or the bot cannot see it. Re-run Test connection and pick a channel from the list.";
    case "is_archived":
      return "That channel is archived. Pick a live one.";
    case "msg_too_long":
      return "The message was too long for Slack.";
    default:
      return undefined;
  }
}

/** Slack returns 200 with ok:false, so the status code alone is never the answer. */
async function call(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
  transport: Transport,
): Promise<{ status: number; body: any }> {
  const method = init.method ?? "POST";
  const res = await transport.fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Slack's own error code, whether it came in the body or as an HTTP failure. */
export function slackError(status: number, body: any): string {
  if (body && typeof body === "object" && typeof body.error === "string") return body.error;
  if (status === 401) return "invalid_auth";
  if (status === 403) return "missing_scope";
  if (status === 429) return "rate_limited";
  return `HTTP ${status}`;
}

export const slackProvider: IntegrationProvider = {
  id: "slack",
  label: "Slack",
  blurb: "Post thread activity to a channel, so the team sees it where they already are.",
  fields: [
    {
      key: "botToken",
      label: "Bot User OAuth token",
      hint: "Starts with xoxb-. Needs chat:write, channels:read (and groups:read for private channels).",
      required: true,
    },
  ],

  async test(credentials, transport): Promise<ConnectionTest> {
    const token = credentials.botToken?.trim();
    if (!token) return { ok: false, error: "A bot token is required." };

    const auth = await call("auth.test", token, {}, transport);
    if (!auth.body?.ok) {
      const error = slackError(auth.status, auth.body);
      return { ok: false, error: scrubSecrets(error, [token]), hint: explain(error) };
    }

    // The channel list is what makes the mapping table usable rather than a text field
    // where a typo silently sends nothing.
    const convos = await call("conversations.list", token, {
      body: { types: "public_channel,private_channel", limit: 200, exclude_archived: true },
    }, transport);

    let targets: IntegrationTarget[] = [];
    let hint: string | undefined;
    if (convos.body?.ok) {
      targets = (convos.body.channels ?? []).map((c: any) => ({
        id: String(c.id),
        name: `#${c.name}`,
        note: c.is_private ? "private" : undefined,
      }));
    } else {
      const error = slackError(convos.status, convos.body);
      // Connecting works but the list does not — say so, because otherwise the mapping
      // table would just be empty with no explanation.
      hint = explain(error, { needed: "channels:read" }) ?? `Could not list channels (${error}). You can still map by channel id.`;
    }

    return {
      ok: true,
      identity: `${auth.body.team ?? "workspace"}${auth.body.user ? ` · ${auth.body.user}` : ""}`,
      targets,
      hint,
    };
  },

  render(event: IntegrationEvent, payload: LifecyclePayload, _target): IntegrationMessage | null {
    const title = payload.title || payload.body?.split("\n")[0] || "Feedback";
    const link = payload.deepLink;
    const meta = [payload.priority && `priority: ${payload.priority}`, payload.status && `status: ${payload.status}`]
      .filter(Boolean).join(" · ");

    switch (event) {
      case "thread_created":
        return {
          text: `:memo: *New feedback* — ${title}\n${meta}${payload.pageUrl ? `\non ${payload.pageUrl}` : ""}${link ? `\n<${link}|Open in Loupe>` : ""}`,
          deepLink: link,
          imageUrl: payload.screenshotUrl,
          threadId: payload.threadId,
        };
      case "agent_working":
        return {
          text: `:robot_face: *${payload.agent ?? "An agent"} is working on* ${title}${link ? `\n<${link}|Open in Loupe>` : ""}`,
          deepLink: link,
          threadId: payload.threadId,
        };
      case "pr_created":
        return {
          text: `:pull_request: *A fix is up for review* — ${title}${payload.pr?.url ? `\n<${payload.pr.url}|${payload.pr.number ? `PR #${payload.pr.number}` : "Pull request"}>` : ""}${link ? `\n<${link}|Open in Loupe>` : ""}`,
          deepLink: payload.pr?.url ?? link,
          threadId: payload.threadId,
        };
      case "thread_resolved":
        return {
          text: `:white_check_mark: *Resolved* — ${title}${link ? `\n<${link}|Open in Loupe>` : ""}`,
          deepLink: link,
          threadId: payload.threadId,
        };
      case "agent_replied":
        return {
          text: `:speech_balloon: *${payload.agent ?? "The agent"} replied* — ${title}\n${payload.body?.slice(0, 300) ?? ""}${link ? `\n<${link}|Open in Loupe>` : ""}`,
          deepLink: link,
          threadId: payload.threadId,
        };
      default:
        return null;
    }
  },

  async send(credentials, target, message, transport): Promise<SendResult> {
    const token = credentials.botToken?.trim();
    if (!token) return { ok: false, error: "No bot token configured." };

    const res = await call("chat.postMessage", token, {
      body: {
        channel: target.id,
        text: message.text,
        // An image is attached by URL rather than uploaded: it is already hosted, and an
        // upload would need a second scope for no benefit.
        ...(message.imageUrl ? { attachments: [{ image_url: message.imageUrl, fallback: message.text }] } : {}),
        unfurl_links: false,
      },
    }, transport);

    if (!res.body?.ok) {
      const error = slackError(res.status, res.body);
      return { ok: false, httpStatus: res.status, error: scrubSecrets(`${error}${explain(error) ? ` — ${explain(error)}` : ""}`, [token]) };
    }
    return { ok: true, httpStatus: res.status };
  },
};
