import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "jsdom",
          include: ["packages/core/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/**/*.test.ts",
            "packages/*/test/**/*.test.{ts,tsx}",
            "apps/*/test/**/*.test.{ts,tsx}",
          ],
          exclude: ["packages/core/test/**/*.test.ts"],
        },
      },
    ],
  },
});
