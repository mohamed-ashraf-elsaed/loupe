import { defineConfig } from "tsup";

// Compile the MCP server to JS for publishing. Node refuses to strip TypeScript
// types for files under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING),
// so the *published* entry must be .js — raw .ts only runs from a source checkout.
// Local dev still runs the .ts directly (`node index.ts`); only the npm tarball ships dist/.
export default defineConfig({
  entry: { index: "index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  // Runtime deps stay external (resolved from the consumer's node_modules).
  // @loupekit/shared is a type-only import → erased by esbuild, never emitted.
  external: ["@modelcontextprotocol/sdk", "zod", "@loupekit/shared"],
  sourcemap: false,
  clean: true,
  dts: false,
  minify: false,
});
