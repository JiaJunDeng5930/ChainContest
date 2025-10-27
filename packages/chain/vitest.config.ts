import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['dist', 'node_modules'],
    dir: 'tests',
    testTimeout: 1_000,
    hookTimeout: 1_000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
