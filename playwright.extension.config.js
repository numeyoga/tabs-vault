import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'extension.spec.js',
  workers: 1,
  use: { trace: 'retain-on-failure' },
});
