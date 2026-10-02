import type { LoupeTab, LoupeTabContext } from "./types.js";

/**
 * The Claude/MCP onboarding page, as a **reusable tab** rather than something the
 * panel forces on every host. Register it if you want it:
 *
 *   import { init, connectTab } from "@loupekit/sdk";
 *   init({ projectKey, user, tabs: [connectTab()] });
 *
 * It is also the worked example for `LoupeTab`: it reads only from the context it
 * is handed, and returns markup.
 */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));

export function connectTab(): LoupeTab {
  return {
    id: "connect",
    label: "Connect",
    hint: {
      title: "Hand it to Claude",
      body: "Add the MCP server to your client and it can list, read and answer this feedback — screenshot included.",
    },
    render: (ctx: LoupeTabContext) => {
      const apiHint = ctx.apiBase ?? "http://localhost:8787";
      const config = JSON.stringify(
        {
          mcpServers: {
            loupe: {
              command: "npx",
              args: ["-y", "@loupekit/mcp"],
              env: { LOUPE_API: apiHint, LOUPE_PROJECT_KEY: ctx.projectKey, LOUPE_ADMIN_KEY: "<your project secret>" },
            },
          },
        },
        null,
        2,
      );
      const steps: [string, string][] = [
        ["Pin your feedback", "Use Inspect, Region, Record, or Note to leave comments right on the live app."],
        ["Add the Loupe MCP server", "Drop this into your Claude Code config so Claude can read this project's backlog:"],
        ["Let Claude fix it", "Claude reads each comment (with the screenshot, HTML & CSS), rewrites the UI, and calls propose_change — the modified HTML/CSS then shows up for your dev team in the dashboard."],
      ];

      return (
        `<div class="connect-hero">` +
        `<div class="chero-logo">◎</div>` +
        `<div class="chero-title">Hand your feedback to <span class="accentink">Claude</span></div>` +
        `<div class="chero-sub">Every pinned comment becomes an actionable, fully-contextualized task Claude Code can act on.</div>` +
        `</div>` +
        `<ol class="connect-steps">` +
        steps.map(([title, body], i) =>
          `<li><div class="cstep-t">${i + 1}. ${escapeHtml(title)}</div>` +
          `<div class="cstep-d">${escapeHtml(body)}</div>` +
          (i === 1 ? `<pre class="cstep-code">${escapeHtml(config)}</pre>` : "") +
          `</li>`).join("") +
        `</ol>`
      );
    },
  };
}
