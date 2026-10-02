/**
 * Handing a thread back.
 *
 * Two rules shape this module, and they are the same rule:
 *
 * 1. An agent moves a thread to **In Review** and stops. It never resolves one.
 * 2. An agent can post a message without touching the status at all.
 *
 * `mark_thread_addressed` therefore has no status parameter to get wrong — "in_review"
 * is not a default, it is the only thing the function can do. That is deliberate: a
 * tool that *could* resolve would eventually resolve, and then "only a human closes a
 * thread" is a convention rather than a property.
 */

import type { Comment, ThreadMessage } from "@loupekit/shared";

export interface HandoffDeps {
  fetchThread: (id: string) => Promise<Comment | null>;
  /** PATCH a thread. Kept narrow: status and the PR stamp. */
  patchThread: (id: string, patch: Partial<Comment>) => Promise<void>;
  postMessage: (threadId: string, message: { author: ThreadMessage["author"]; body: string }) => Promise<ThreadMessage>;
  listMessages: (threadId: string) => Promise<ThreadMessage[]>;
  /** Who the agent is, for the message author. */
  agent: { id: string; name: string };
}

export interface HandoffResult {
  text: string;
  unavailable?: boolean;
}

const NO_THREAD = (id: string) =>
  `No thread found for \`${id}\`.\n\nUse \`list_comments\` to see the ids.`;

export function createHandoffTools(deps: HandoffDeps) {
  return {
    /**
     * Mark a thread addressed: it moves to In Review and the human is notified.
     *
     * There is no way to resolve a thread through this tool, by design.
     */
    async markThreadAddressed({ thread_id, message }: { thread_id: string; message?: string }): Promise<HandoffResult> {
      const thread = await deps.fetchThread(thread_id);
      if (!thread) return { text: NO_THREAD(thread_id), unavailable: true };

      // Only two things this can do, and neither is "resolved".
      await deps.patchThread(thread_id, { status: "in_review" });

      let posted = "";
      if (message && message.trim()) {
        await deps.postMessage(thread_id, {
          author: { ...deps.agent, type: "agent" },
          body: message.trim(),
        });
        posted = " Your note is on the thread.";
      }

      return {
        text:
          `#${thread_id} → In Review.${posted}\n\n` +
          "A person has to look at it now — that is the only way a thread closes. " +
          "If there is a preview, put the URL in your note so they can check it in place.",
      };
    },

    /**
     * Post a reply without changing the status. For progress notes, questions, and
     * anything else that is not a handoff.
     */
    async addThreadMessage({ thread_id, message }: { thread_id: string; message: string }): Promise<HandoffResult> {
      if (!message || !message.trim()) {
        return { text: "A message body is required — there is nothing to post.", unavailable: true };
      }
      const thread = await deps.fetchThread(thread_id);
      if (!thread) return { text: NO_THREAD(thread_id), unavailable: true };

      await deps.postMessage(thread_id, { author: { ...deps.agent, type: "agent" }, body: message.trim() });
      return {
        text: `Posted to #${thread_id} as ${deps.agent.name}. The status is unchanged (${thread.status}).`,
      };
    },

    /** The full conversation: the original request as message #1, then the replies. */
    async getThreadConversation({ thread_id }: { thread_id: string }): Promise<HandoffResult> {
      const thread = await deps.fetchThread(thread_id);
      if (!thread) return { text: NO_THREAD(thread_id), unavailable: true };

      const replies = await deps.listMessages(thread_id);
      const lines = [
        `# #${thread_id} — ${thread.title ?? thread.body.split("\n")[0] ?? ""}`,
        "",
        `Status: ${thread.status} · ${replies.length} repl${replies.length === 1 ? "y" : "ies"}`,
        "",
        `**${thread.author.name}** (original request):`,
        "",
        thread.body,
      ];
      for (const r of replies) {
        lines.push("", `**${r.author.name}** (${r.author.type}) — ${r.createdAt}:`, "", r.body);
      }
      if (!replies.length) lines.push("", "_No replies yet._");
      return { text: lines.join("\n") };
    },
  };
}

/**
 * The statuses an agent may set. Kept as a list rather than a bare string so a caller
 * can be told *why* it was refused.
 */
export const AGENT_ALLOWED_STATUSES = ["todo", "in_progress", "in_review"] as const;

export function isAgentAllowedStatus(status: string): boolean {
  return (AGENT_ALLOWED_STATUSES as readonly string[]).includes(status);
}

/** What to say when something asks an agent to resolve a thread. */
export const RESOLVE_REFUSAL =
  "Only a person resolves a thread — an agent moves it to In Review (`mark_thread_addressed`). " +
  "That is not a policy this tool enforces by choice; it is the shape of the workflow.";
