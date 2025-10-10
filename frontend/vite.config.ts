import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

function resolveDevPort(provided: string | undefined): number {
  if (!provided) {
    return 5173;
  }

  const parsed = Number.parseInt(provided, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid VITE_DEV_PORT value: ${provided}`);
  }

  return parsed;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = resolveDevPort(env.VITE_DEV_PORT ?? process.env.VITE_DEV_PORT);

  return {
    server: {
      port,
      strictPort: true,
    },
    preview: {
      port,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
      include: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "tests/**/*.{test,spec}.{ts,tsx}",
      ],
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/e2e/**",
        "playwright-report/**",
        "coverage/**",
      ],
      passWithNoTests: true,
      coverage: {
        reporter: ["text", "html"],
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
  };
});
