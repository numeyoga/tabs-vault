import { createStore } from '../storage/store.js';
import { exportVault, validateVault, VaultError } from '../domain/vault.js';
import { capture, openLibrary, openLinks } from '../browser/actions.js';

const api = globalThis.chrome;
const store = createStore({
  read: async () => (await api.storage.local.get('vault')).vault,
  write: (vault) => api.storage.local.set({ vault }),
});
const menuItems = [
  ['library', 'Ouvrir la bibliothèque'], ['group', 'Sauvegarder le groupe actif'], ['window', 'Sauvegarder la fenêtre'],
];
async function setupMenus() {
  await api.contextMenus.removeAll();
  for (const [id, title] of menuItems) api.contextMenus.create({ id, title, contexts: ['action'] });
}
api.runtime.onInstalled.addListener(() => { setupMenus().catch(() => {}); });
api.runtime.onStartup.addListener(() => { setupMenus().catch(() => {}); });
async function feedback(tabId, text, message, error = false) {
  await api.action.setBadgeText({ tabId, text });
  await api.action.setBadgeBackgroundColor({ tabId, color: error ? '#aa3434' : '#236b59' });
  await api.action.setTitle({ tabId, title: message });
  // Session metadata preserves the message if the worker is suspended.
  await api.storage.session.set({ lastCaptureFeedback: { message, error, at: Date.now() } });
  setTimeout(() => { api.action.setBadgeText({ tabId, text: '' }).catch(() => {}); }, 5000);
}
api.action.onClicked.addListener((tab) => {
  (async () => {
    try {
      const { result } = await store.command('save', tab);
      const message = { created: 'Onglet sauvegardé.', restored: 'Lien réactivé.', existing: 'Déjà sauvegardé.' }[result.status];
      await feedback(tab.id, result.status === 'existing' ? '=' : '✓', message);
    } catch (error) { await feedback(tab.id, '!', error.message, true); }
  })().catch(() => {});
});
api.contextMenus.onClicked.addListener((info, tab) => {
  (async () => {
    if (info.menuItemId === 'library') return openLibrary(api, tab.windowId);
    const pending = await capture(api, info.menuItemId, tab);
    if (!pending.bundle.links.length) throw new VaultError('INVALID_INPUT', 'Aucun onglet HTTP/HTTPS à sauvegarder.');
    const key = crypto.randomUUID();
    await api.storage.session.set({ [`capture:${key}`]: pending });
    await openLibrary(api, tab.windowId, `?capture=${key}`);
  })().catch((error) => feedback(tab.id, '!', error.message, true));
});
function validSender(sender) {
  if (sender.id !== api.runtime.id || !sender.url) return false;
  const u = new URL(sender.url);
  const expected = new URL(api.runtime.getURL('library.html'));
  return u.protocol === expected.protocol && u.host === expected.host && u.pathname === expected.pathname;
}
const mutations = new Set(['save', 'editLink', 'trash', 'restore', 'purge', 'createGroup', 'renameGroup', 'deleteGroup', 'createTag', 'renameTag', 'deleteTag', 'removeFromGroup', 'move', 'import']);
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!validSender(sender)) { sendResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Émetteur refusé.' } }); return false; }
  (async () => {
    if (!message || typeof message.requestId !== 'string' || typeof message.type !== 'string') throw new VaultError('INVALID_INPUT', 'Message invalide.');
    const { type, payload = {}, expectedRevision } = message;
    if (type === 'read') return { vault: await store.read(), lastOpening: (await api.storage.session.get('lastOpening')).lastOpening };
    if (type === 'export') return { export: exportVault(await store.read()) };
    if (type === 'rawExport') return { raw: (await api.storage.local.get('vault')).vault };
    if (type === 'pending') return { pending: (await api.storage.session.get(`capture:${payload.key}`))[`capture:${payload.key}`] };
    if (type === 'cancelCapture') { await api.storage.session.remove(`capture:${payload.key}`); return {}; }
    if (type === 'commitCapture') {
      const key = `capture:${payload.key}`;
      const pending = (await api.storage.session.get(key))[key];
      if (!pending) throw new VaultError('INVALID_INPUT', 'Cette capture a expiré.');
      const bundle = structuredClone(pending.bundle);
      bundle.groups.forEach((g) => { g.name = payload.choices?.[g.id]?.name ?? g.name; });
      validateVault(bundle, { importing: true });
      const result = await store.command('capture', { bundle, choices: payload.choices }, expectedRevision);
      await api.storage.session.remove(key); return result;
    }
    if (type === 'open') {
      const vault = await store.read();
      if (!Array.isArray(payload.ids)) throw new VaultError('INVALID_INPUT', 'Sélection invalide.');
      const links = [...new Set(payload.ids)].map((id) => vault.links.find((l) => l.id === id && !l.deletedAt));
      if (links.some((l) => !l)) throw new VaultError('INVALID_INPUT', 'Un lien a été supprimé. Rechargez la bibliothèque.');
      const windowId = sender.tab?.windowId ?? (await api.windows.getCurrent()).id;
      return { report: await openLinks(api, links, { ...payload, windowId }, api.storage.session) };
    }
    if (!mutations.has(type) || !Number.isSafeInteger(expectedRevision)) throw new VaultError('INVALID_INPUT', 'Commande ou révision invalide.');
    return store.command(type, payload, expectedRevision);
  })().then((result) => sendResponse({ requestId: message.requestId, ok: true, ...result }))
    .catch((error) => sendResponse({ requestId: message?.requestId, ok: false, error: { code: error.code ?? 'BROWSER_OPERATION_FAILED', message: error.message, details: error.details } }));
  return true;
});
