import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': dirname
    }
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts']
  }
});
