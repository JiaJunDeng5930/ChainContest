import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
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
        branches: 80
      }
    }
  },
  resolve: {
    alias: {
      '@engine': resolve(packageDir, 'src/engine'),
      '@registry': resolve(packageDir, 'src/registry'),
      '@types': resolve(packageDir, 'src/types')
    }
  }
});
