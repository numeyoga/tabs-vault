import { canonicalUrl, captureBundle, VaultError } from '../domain/vault.js';

export async function capture(api, scope, tab) {
  if (tab.incognito) throw new VaultError('INVALID_INPUT', 'Navigation privée exclue.');
  const tabs = await api.tabs.query({ windowId: tab.windowId });
  const groups = [];
  if (scope === 'group' && (!Number.isInteger(tab.groupId) || tab.groupId < 0)) {
    throw new VaultError('CAPABILITY_UNAVAILABLE', 'Cet onglet ne fait pas partie d’un groupe accessible.');
  }
  const chosen = scope === 'group' ? tabs.filter((t) => t.groupId === tab.groupId) : tabs;
  for (const id of new Set(chosen.map((t) => t.groupId).filter((id) => Number.isInteger(id) && id >= 0))) {
    if (!api.tabGroups?.get) throw new VaultError('CAPABILITY_UNAVAILABLE', 'Ce navigateur ne permet pas de lire le nom des groupes.');
    groups.push(await api.tabGroups.get(id));
  }
  return captureBundle(chosen, groups);
}
export async function openLibrary(api, windowId, query = '') {
  const base = api.runtime.getURL('library.html');
  const candidates = await api.tabs.query({ windowId });
  const existing = candidates.find((t) => t.url === base || t.url?.startsWith(`${base}?`));
  if (existing) return api.tabs.update(existing.id, { active: true, ...(query ? { url: base + query } : {}) });
  return api.tabs.create({ windowId, url: base + query });
}
export async function openLinks(api, links, { name = 'Sélection', windowId, single = false, confirmed = false } = {}, session) {
  if (!links.length) throw new VaultError('INVALID_INPUT', 'Sélectionnez au moins un lien.');
  if (links.length > 20 && !confirmed) throw new VaultError('CONFIRMATION_REQUIRED', 'Confirmez l’ouverture de plus de 20 onglets.');
  const urls = links.map((l) => canonicalUrl(l.url));
  let grouped = !single && typeof api.tabs.group === 'function' && typeof api.tabGroups?.update === 'function';
  if (grouped && api.tabGroups.query) {
    try { await api.tabGroups.query({ windowId }); } catch { grouped = false; }
  }
  const report = { id: crypto.randomUUID(), successes: [], failures: [], uncertain: [], grouped: false, fallback: !single && !grouped, warning: '' };
  const record = async () => { if (session) await session.set({ lastOpening: report }); };
  await record();
  let destination = windowId;
  let initialBlank;
  if (!single && !grouped) {
    const win = await api.windows.create({ url: 'about:blank', type: 'normal' });
    destination = win.id; initialBlank = win.tabs?.[0]?.id;
  }
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    report.uncertain = [link.id]; await record();
    try {
      const tab = await api.tabs.create({ windowId: destination, url: urls[i], active: single });
      report.successes.push({ id: link.id, tabId: tab.id });
    } catch { report.failures.push(link.id); }
    report.uncertain = []; await record();
  }
  if (initialBlank && report.successes.length) await api.tabs.remove(initialBlank).catch(() => {});
  if (grouped && report.successes.length) {
    try {
      const id = await api.tabs.group({ tabIds: report.successes.map((s) => s.tabId) });
      await api.tabGroups.update(id, { title: name }); report.grouped = true;
    } catch { report.warning = 'Les onglets sont ouverts, mais le regroupement a échoué. Ils ne seront pas rouverts.'; }
  }
  await record(); return report;
}
