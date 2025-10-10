import { resolve } from "node:path";
import { defineConfig } from "vite";

function resolveDevPort(): number {
  const provided = process.env.VITE_DEV_PORT;

  if (!provided) {
    return 5173;
  }

  const parsed = Number.parseInt(provided, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid VITE_DEV_PORT value: ${provided}`);
  }

  return parsed;
}

export default defineConfig({
  server: {
    port: resolveDevPort(),
    strictPort: true,
  },
  preview: {
    port: resolveDevPort(),
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    coverage: {
      reporter: ["text", "html"],
    },
  },
  build: {
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
