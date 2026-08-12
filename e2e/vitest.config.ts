import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(here, '../apps/web/src'),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 30_000,
  },
});
