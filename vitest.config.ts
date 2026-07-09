import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node", // DOM test files opt in via `// @vitest-environment happy-dom`
    testTimeout: 20000,
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
      ],
      exclude: [
        "**/*.config.ts",
        "**/dist/**",
        "**/node_modules/**",
        "**/test/**",
        "packages/server/seed.ts",
        "packages/sdk/demo/**",
      ],
    },
  },
});
