import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
