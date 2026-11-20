import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@eldoria/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['test/unit/**/*.spec.ts'],
  },
});
