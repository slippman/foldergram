import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    env: {
      MEDIA_CACHE_ENABLED: 'false', MEDIA_CACHE_TTL_SECONDS: '86400',
      // Tests must never inherit live email delivery settings from the local .env.
      EMAIL_SIGN_IN_ENABLED: 'false', EMAIL_SIGN_IN_ORIGIN: '', EMAIL_FROM: '', RESEND_API_KEY: '', EMAIL_ACCESS_REVIEW_TO: ''
    },
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  }
});
