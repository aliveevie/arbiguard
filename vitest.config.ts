import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // live integration tests hit public testnet RPCs, which can be slow
    testTimeout: 30_000,
  },
});
