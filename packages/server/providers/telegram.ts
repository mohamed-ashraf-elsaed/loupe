/**
 * Telegram.
 *
 * Smaller API than Slack and a different shape of problem: Telegram will not tell you
 * which chats exist. A bot can only see chats it has already been added to *and* that
 * have sent it something, so the target list comes from `getUpdates` — which is empty
 * until somebody messages the bot.
 *
 * That is a real onboarding cliff, so the test connection says what to do about it
 * instead of returning an empty list with no explanation.
 */

import { scrubSecrets } from "../credentials.ts";
import type {
  ConnectionTest, IntegrationEvent, IntegrationMessage, IntegrationProvider, IntegrationTarget,
  LifecyclePayload, SendResult, Transport,
} from "../integrations.ts";

const API = "https://api.telegram.org";

/** Telegram puts the token in the path, which is why URLs are never logged verbatim. */
function url(token: string, method: string): string {
  return `${API}/bot${token}/${method}`;
}

export function explain(error: string): string | undefined {
  switch (error) {
    case "Unauthorized":
    case "Not Found":
      return "Telegram rejected the bot token. Check you copied the whole token from @BotFather, including the digits, colon and letters.";
    case "chat not found":
      return "Telegram cannot see that chat. Send the bot a message first, or add it to the group, then run Test connection again.";
    case "bot was blocked by the user":
      return "The person blocked the bot. Unblock it in Telegram, or pick a different chat.";
    case "bot is not a member of the chat":
      return "The bot needs to be added to that group before it can post there.";
    case "message is too long":
      return "The message was too long for Telegram.";
    case "Too Many Requests":
      return "Telegram is rate-limiting this bot. Try again in a moment.";
    default:
      return undefined;
  }
}

async function call(token: string, method: string, init: RequestInit, transport: Transport): Promise<{ status: number; body: any }> {
  const res = await transport.fetch(url(token, method), { ...init, signal: AbortSignal.timeout(10_000) });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Telegram's description, or a fallback that still names the status. */
export function telegramError(status: number, body: any): string {
  if (body && typeof body === "object" && typeof body.description === "string") return body.description;
  if (status === 401) return "Unauthorized";
  if (status === 429) return "Too Many Requests";
  return `HTTP ${status}`;
}

export const telegramProvider: IntegrationProvider = {
  id: "telegram",
  label: "Telegram",
  blurb: "Send thread activity to a chat or group — useful when the team is not on Slack.",
  fields: [
    {
      key: "botToken",
      label: "Bot token",
      hint: "From @BotFather, in the form 123456789:AA…",
      required: true,
    },
  ],

  async test(credentials, transport): Promise<ConnectionTest> {
    const token = credentials.botToken?.trim();
    if (!token) return { ok: false, error: "A bot token is required." };

    const me = await call(token, "getMe", { method: "GET" }, transport);
    if (!me.body?.ok) {
      const error = telegramError(me.status, me.body);
      return { ok: false, error: scrubSecrets(error, [token]), hint: explain(error) };
    }

    // A bot can only post to chats it has seen. getUpdates is the only way to learn them
    // without already knowing an id.
    const updates = await call(token, "getUpdates", { method: "GET" }, transport);
    const seen = new Map<string, IntegrationTarget>();
    for (const update of updates.body?.result ?? []) {
      const chat = update?.message?.chat ?? update?.channel_post?.chat ?? null;
      if (!chat?.id) continue;
      const name = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? chat.username ?? "chat";
      seen.set(String(chat.id), { id: String(chat.id), name, note: chat.type });
    }

    const targets = [...seen.values()];
    return {
      ok: true,
      identity: me.body.result.username ? `@${me.body.result.username}` : String(me.body.result.first_name ?? "bot"),
      targets,
      hint: targets.length
        ? "Only chats the bot has seen appear here. Send it a message, or add it to a group, then test again to pick up more."
        : "No chats yet. Send your bot a message in Telegram (or add it to a group), then run Test connection again — Telegram will not list a chat until the bot has seen it.",
    };
  },

  render(event: IntegrationEvent, payload: LifecyclePayload, _target): IntegrationMessage | null {
    // Telegram has no attachments-by-URL in the same way, so the screenshot is a link.
    const lines: string[] = [];
    const title = payload.title || payload.body?.split("\n")[0] || "Feedback";

    switch (event) {
      case "thread_created":
        lines.push(`📝 New feedback — ${title}`);
        if (payload.priority) lines.push(`priority: ${payload.priority}`);
        break;
      case "agent_working":
        lines.push(`🤖 ${payload.agent ?? "An agent"} is working on ${title}`);
        break;
      case "pr_created":
        lines.push(`🔀 A fix is up for review — ${title}`);
        if (payload.pr?.url) lines.push(payload.pr.url);
        break;
      case "thread_resolved":
        lines.push(`✅ Resolved — ${title}`);
        break;
      case "agent_replied":
        lines.push(`💬 ${payload.agent ?? "The agent"} replied — ${title}`);
        if (payload.body) lines.push(payload.body.slice(0, 300));
        break;
      default:
        return null;
    }

    if (payload.pageUrl) lines.push(`on ${payload.pageUrl}`);
    if (payload.screenshotUrl) lines.push(payload.screenshotUrl);
    if (payload.deepLink) lines.push(payload.deepLink);

    return { text: lines.join("\n"), deepLink: payload.deepLink, threadId: payload.threadId };
  },

  async send(credentials, target, message, transport): Promise<SendResult> {
    const token = credentials.botToken?.trim();
    if (!token) return { ok: false, error: "No bot token configured." };

    const res = await call(token, "sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target.id,
        text: message.text,
        // Telegram renders _ * [ ] as markup, and a PM's feedback is full of all four.
        // Sending with parse_mode off keeps the message literal rather than erroring on
        // an unbalanced underscore in someone's sentence.
        disable_web_page_preview: false,
      }),
    }, transport);

    if (!res.body?.ok) {
      const error = telegramError(res.status, res.body);
      return { ok: false, httpStatus: res.status, error: scrubSecrets(`${error}${explain(error) ? ` — ${explain(error)}` : ""}`, [token]) };
    }
    return { ok: true, httpStatus: res.status };
  },
};
