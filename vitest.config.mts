import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The signal engine and portfolio maths are pure functions over arrays,
    // so they need no DOM. Component tests, if they arrive, get their own
    // environment rather than slowing these down.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
