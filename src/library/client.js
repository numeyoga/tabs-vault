import { createStore } from '../storage/store.js';
import { exportVault, validateVault } from '../domain/vault.js';

export const extensionMode = Boolean(globalThis.chrome?.runtime?.id);
const previewStore =
  !extensionMode &&
  createStore({
    read: async () => {
      const text = localStorage.getItem('tabs-vault-preview');
      return text === null ? undefined : JSON.parse(text);
    },
    write: async (vault) => localStorage.setItem('tabs-vault-preview', JSON.stringify(vault)),
  });
export async function request(type, payload = {}, expectedRevision) {
  if (extensionMode) {
    const response = await chrome.runtime.sendMessage({
      requestId: crypto.randomUUID(),
      type,
      payload,
      expectedRevision,
    });
    if (!response?.ok) {
      const error = new Error(
        response?.error?.message ??
          'Aucune réponse. Rechargez pour vérifier les données avant de recommencer.',
      );
      Object.assign(error, response?.error);
      throw error;
    }
    return response;
  }
  // The browser-only preview exercises the same domain and storage queue;
  // it deliberately does not pretend to implement native extension APIs.
  if (type === 'read') {
    return { vault: await previewStore.read() };
  }
  if (type === 'export') {
    return { export: exportVault(await previewStore.read()) };
  }
  if (type === 'rawExport') {
    return { raw: JSON.parse(localStorage.getItem('tabs-vault-preview') ?? 'null') };
  }
  if (type === 'open') {
    throw new Error('La réouverture native se teste dans l’extension installée.');
  }
  if (type === 'pending') {
    return {};
  }
  if (type === 'commitCapture') {
    throw new Error('La capture native se teste dans l’extension installée.');
  }
  return previewStore.command(type, payload, expectedRevision);
}
export function observe(onChange) {
  if (extensionMode) {
    const listener = (changes, area) => {
      if (area === 'local' && changes.vault) {
        onChange();
      }
    };
    chrome.storage.onChanged.addListener(listener);
  } else {
    window.addEventListener('storage', onChange);
  }
}
export { validateVault };
