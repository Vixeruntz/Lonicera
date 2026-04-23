import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: 'node dist/server.js',
    env: {
      NODE_ENV: 'production',
    },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
