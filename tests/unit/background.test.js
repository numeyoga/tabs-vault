import { describe, it, expect, vi, beforeEach } from 'vitest';
const event = () => ({ addListener: vi.fn() });
let api, local, session;
beforeEach(async () => {
  vi.resetModules(); local = {}; session = {};
  const area = (data) => ({
    get: vi.fn(async (key) => ({ [key]: data[key] })),
    set: vi.fn(async (values) => Object.assign(data, structuredClone(values))),
    remove: vi.fn(async (key) => { delete data[key]; }),
  });
  api = {
    runtime: { id: 'test-extension', getURL: (path) => `chrome-extension://test-extension/${path.replace(/^\//, '')}`, onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { local: area(local), session: area(session) },
    contextMenus: { onClicked: event(), removeAll: vi.fn(async () => {}), create: vi.fn() },
    action: { onClicked: event(), setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}), setTitle: vi.fn(async () => {}) },
    tabs: { query: vi.fn(async () => []), create: vi.fn(async () => ({})) },
  };
  vi.stubGlobal('chrome', api);
  await import('../../src/background/index.js');
});
const send = (type, payload = {}, expectedRevision, sender = { id: 'test-extension', url: 'chrome-extension://test-extension/library.html', tab: { windowId: 1 } }) => new Promise((resolve) => {
  api.runtime.onMessage.addListener.mock.calls[0][0]({ requestId: 'test', type, payload, expectedRevision }, sender, resolve);
});
describe('Contrat worker ↔ page', () => {
  it('refuse un message provenant d’une page étrangère', async () => {
    const r = await send('read', {}, undefined, { id: 'test-extension', url: 'https://example.test/library.html' });
    expect(r.ok).toBe(false); expect(r.error.code).toBe('FORBIDDEN');
  });
  it('persiste une commande et transmet un conflit sans perte de données', async () => {
    const first = await send('save', { url: 'https://example.test/a', title: 'A' }, 0);
    expect(first.ok).toBe(true); expect(local.vault.links).toHaveLength(1);
    const conflict = await send('save', { url: 'https://example.test/b' }, 0);
    expect(conflict.error.code).toBe('REVISION_CONFLICT'); expect(local.vault.links).toHaveLength(1);
    expect((await send('read')).vault.links[0].title).toBe('A');
  });
  it('enregistre les trois menus de l’action sans popup', async () => {
    await api.runtime.onInstalled.addListener.mock.calls[0][0]();
    // onInstalled intentionally returns synchronously; flush its async menu setup.
    await Promise.resolve();
    expect(api.contextMenus.create.mock.calls.map(([item]) => item.id)).toEqual(['library', 'group', 'window']);
  });
  it('refuse une commande inconnue et conserve les données corrompues', async () => {
    local.vault = { schemaVersion: 99 };
    expect((await send('read')).error.code).toBe('IMPORT_VERSION_UNSUPPORTED');
    expect((await send('unknown', {}, 0)).ok).toBe(false);
    expect(local.vault).toEqual({ schemaVersion: 99 });
  });
});
