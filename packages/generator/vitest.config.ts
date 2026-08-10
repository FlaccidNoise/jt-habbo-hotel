import { defineConfig } from "vitest/config";

// The gate and review tests run every frozen bundle and figure layer through the real pipeline,
// so they scale with the catalog — at 53 bundles they pass alone but blow vitest's 5 s default
// when `make test` runs four workspaces on one CPU. The corpus only grows; give them room.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
