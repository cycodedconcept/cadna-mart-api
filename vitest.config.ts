import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
