import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node", // DOM test files opt in via `// @vitest-environment happy-dom`
    testTimeout: 20000,
    // Node 25+ ships a global `localStorage` that shadows happy-dom's in the DOM suites.
    // Turn it off in the test workers (the flag is a no-op on Node 24).
    execArgv: ["--no-experimental-webstorage"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      all: true,
      include: [
        "packages/shared/src/**/*.ts",
        "packages/sdk/src/**/*.ts",
        "packages/server/*.ts",
        "packages/dashboard/*.ts",
        "packages/mcp/index.ts",
        "packages/hub/*.ts",
      ],
      exclude: [
        "**/*.config.ts",
        "**/dist/**",
        "**/node_modules/**",
        "**/test/**",
        "packages/server/seed.ts",
        "packages/hub/seed.ts",
        "**/*.d.ts",
        "packages/sdk/demo/**",
      ],
    },
  },
});
