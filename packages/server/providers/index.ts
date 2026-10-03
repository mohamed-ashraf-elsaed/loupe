/**
 * The provider registry, populated.
 *
 * This is the file the acceptance criterion is about: adding a provider is an import, a
 * `register` call, and the adapter itself. Nothing else in the framework changes.
 */

import { ProviderRegistry } from "../integrations.ts";
import { slackProvider } from "./slack.ts";
import { telegramProvider } from "./telegram.ts";

export function buildRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(slackProvider);
  registry.register(telegramProvider);
  return registry;
}

/** One registry per process, so a provider is never registered twice. */
export const providers = buildRegistry();
