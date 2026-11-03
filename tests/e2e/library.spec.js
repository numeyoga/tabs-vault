import { test, expect } from '@playwright/test';
import { LibraryPage } from './pages/LibraryPage.js';

test('B-01, B-13 — lien unique, URLs distinctes, recherche et rendu sûr', async ({ page }) => {
  const library = new LibraryPage(page);
  // Étant donné une bibliothèque vide.
  await library.open();
  // Quand des liens sont ajoutés, dont un doublon et un titre contenant du HTML.
  await library.addLink('https://example.test/a?q=1#haut', '<img src=x onerror=alert(1)>');
  await library.addLink('https://example.test/a?q=1#haut', 'Ne remplace pas');
  await library.addLink('https://example.test/a?q=2#haut', 'Autre');
  // Alors les URLs distinctes sont conservées et le contenu reste du texte.
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(library.link('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.locator('.links img')).toHaveCount(0);
  await library.search('q=2'); await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(library.link('Autre')).toBeVisible();
});
test('B-07, B-15 — corbeille persistante et recréation de l’organisation', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.createGroup('Voyage');
  await library.editLink('A', { tags: ['urgent'], groups: ['Voyage'] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await library.trash('A'); await library.deleteGroup('Voyage'); await library.deleteTag('urgent');
  await library.reload(); await library.showTrash(); await expect(library.link('A')).toBeVisible();
  await library.restore('A'); await library.showAll();
  await expect(library.link('A')).toContainText('urgent'); await expect(library.link('A')).toContainText('Voyage');
});
test('B-14, B-18 — confirmation de purge et conservation du lien actif', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.addLink('https://example.test/b', 'B');
  await library.trash('A'); await library.showTrash(); await library.purge({ confirm: false });
  await expect(library.link('A')).toBeVisible(); await library.purge();
  await expect(page.getByRole('listitem')).toHaveCount(0); await library.showAll(); await expect(library.link('B')).toBeVisible();
  await library.reload(); await expect(library.link('B')).toBeVisible();
});
test('B-17, B-19 — export actif et import réactivant une URL supprimée', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.addLink('https://example.test/b', 'B');
  const data = await library.exportJson();
  await library.trash('A'); const active = await library.exportJson();
  expect(active.vault.links.map((l) => l.title)).toEqual(['B']);
  await library.importJson(data);
  await library.confirmDialog();
  await expect(library.link('A')).toBeVisible(); await expect(page.getByRole('listitem')).toHaveCount(2);
});
test('B-09 — import invalide sans perte de données', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A');
  await library.importJson({ format: 'tabs-vault', exportVersion: 99 });
  await expect(page.getByRole('alert')).toContainText('version'); await expect(library.link('A')).toBeVisible();
});

test('B-03, B-12 — choix explicite du groupe existant à l’import', async ({ page }) => {
  const { CaptureDialogPage } = await import('./pages/CaptureDialogPage.js');
  const library = new LibraryPage(page), capture = new CaptureDialogPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.createGroup('Voyage');
  await library.editLink('A', { tags: ['urgent'], groups: ['Voyage'] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = await library.exportJson();
  await library.importJson(data);
  await expect(page.getByRole('dialog')).toBeVisible();
  // Sans choix, la validation HTML du formulaire empêche la fusion silencieuse.
  await capture.confirm(); await expect(page.getByRole('dialog')).toBeVisible();
  await capture.chooseExisting('Voyage'); await capture.confirm();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voyage', exact: true })).toHaveCount(1);
  await library.importJson(data); await capture.chooseDistinct('Voyage'); await capture.confirm();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voyage', exact: true })).toHaveCount(2);
  await expect(page.getByRole('listitem')).toHaveCount(1);
});
test('F-08 — doublon à l’édition refusé avec indication de l’entrée existante', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.addLink('https://example.test/b', 'B');
  await library.editLink('A', { url: 'https://example.test/b' });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('existe déjà');
  await library.dismissDialog();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});
test('B-11 — retirer d’un groupe conserve le lien et son autre groupe', async ({ page }) => {
  const library = new LibraryPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A');
  await library.createGroup('Voyage'); await library.createGroup('À lire');
  await library.editLink('A', { groups: ['Voyage', 'À lire'] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await library.showGroup('Voyage');
  await library.removeFromGroup('A');
  await expect(page.getByRole('listitem')).toHaveCount(0); await library.showAll();
  await expect(library.link('A')).toBeVisible(); await expect(library.link('A')).toContainText('À lire');
  await expect(library.link('A')).not.toContainText('Voyage');
});

test('B-15, B-19 — import demandant la destination du groupe recréé à la réactivation', async ({ page }) => {
  const { CaptureDialogPage } = await import('./pages/CaptureDialogPage.js');
  const library = new LibraryPage(page), capture = new CaptureDialogPage(page);
  await library.open(); await library.addLink('https://example.test/a', 'A'); await library.createGroup('Voyage');
  await library.editLink('A', { tags: ['urgent'], groups: ['Voyage'] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = await library.exportJson();
  await library.trash('A'); await library.deleteGroup('Voyage'); await library.deleteTag('urgent');
  await library.importJson(data); await capture.chooseExisting('Voyage'); await capture.confirm();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(library.link('A')).toBeVisible(); await expect(library.link('A')).toContainText('urgent');
  await expect(page.getByRole('button', { name: 'Voyage', exact: true })).toHaveCount(1);
});
test('F-07 — 5 000 liens, affichage borné et recherche sans perte de résultats', async ({ page }, testInfo) => {
  const { CaptureDialogPage } = await import('./pages/CaptureDialogPage.js');
  const library = new LibraryPage(page), capture = new CaptureDialogPage(page);
  await library.open();
  const time = '2026-11-03T12:00:00.000Z';
  const links = Array.from({ length: 5000 }, (_, i) => ({ id: `link-${i}`, title: `Lien ${i}`, url: `https://example.test/${i}`, tagIds: [], createdAt: time, updatedAt: time }));
  await library.importJson({ format: 'tabs-vault', exportVersion: 1, exportedAt: time, vault: { schemaVersion: 1, revision: 0, links, tags: [], groups: [] } });
  await capture.confirm(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tous les liens · 5000', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(100);
  // Measure just the synchronous search + DOM update, not Playwright transport latency.
  const duration = await library.measureSearch('Lien 4999');
  await testInfo.attach('search-timing.json', { body: JSON.stringify({ links: 5000, milliseconds: duration, browser: 'system Chromium', platform: process.platform }), contentType: 'application/json' });
  expect(duration).toBeLessThan(300);
  await expect(library.link('Lien 4999')).toBeVisible(); await expect(page.getByRole('listitem')).toHaveCount(1);
});
