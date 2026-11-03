import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Explicitly separate from preview tests. No conditional skip that looks like a pass.
test('F-06 — charge réellement le worker et la bibliothèque Manifest V3', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'tabs-vault-e2e-'));
  const extension = resolve('dist');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 10000 }));
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/library.html`);
    await expect(page.getByRole('heading', { name: 'Tabs Vault', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Bibliothèque prête.');
    await expect(page.getByText('Aperçu local :', { exact: false })).toHaveCount(0);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
