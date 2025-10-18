import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    dir: 'tests',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['dist', 'node_modules'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    testTimeout: 2_000,
    hookTimeout: 2_000,
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
      '@db': resolve(packageDir, 'src'),
      '@db/adapters': resolve(packageDir, 'src/adapters'),
      '@db/repositories': resolve(packageDir, 'src/repositories'),
      '@db/schema': resolve(packageDir, 'src/schema')
    }
  }
});
