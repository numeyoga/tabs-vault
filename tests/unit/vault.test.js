import { describe, it, expect } from 'vitest';
import { emptyVault, applyCommand, canonicalUrl, captureBundle, exportVault, parseImport, searchLinks, validateVault } from '../../src/domain/vault.js';
const cmd = (v, type, payload) => applyCommand(v, type, payload).vault;
const add = (v, url = 'https://example.test/a', title = 'A') => cmd(v, 'save', { url, title });
function organized() {
  let v = add(emptyVault());
  v = cmd(v, 'createGroup', { name: 'Voyage' });
  v = cmd(v, 'createGroup', { name: 'À lire' });
  v = cmd(v, 'editLink', { id: v.links[0].id, url: v.links[0].url, title: 'Personnalisé', tags: ['Urgent'], groupIds: v.groups.map((g) => g.id) });
  return v;
}
const errorCode = (fn, code) => {
  try { fn(); throw new Error('Expected failure'); } catch (e) { expect(e.code).toBe(code); }
};
describe('BDD — bibliothèque locale', () => {
  it('B-01 / F-01, F-03 — sauvegarde immédiate puis doublon préservant les métadonnées', () => {
    // Étant donné un lien personnalisé.
    const before = organized();
    // Quand la même URL est sauvegardée à nouveau.
    const result = applyCommand(before, 'save', { url: before.links[0].url, title: 'Autre titre' });
    // Alors le lien est réutilisé sans perdre ses tags, titre ou appartenances.
    expect(result.result.status).toBe('existing');
    expect(result.vault.links).toEqual(before.links);
    expect(result.vault.groups).toEqual(before.groups);
    expect(before.revision).toBeLessThan(result.vault.revision);
  });
  it('B-02 / F-04 — reprend le nom et l’ordre du groupe du navigateur', () => {
    const { bundle } = captureBundle([
      { id: 1, index: 2, url: 'https://example.test/b', title: 'B', groupId: 9 },
      { id: 2, index: 1, url: 'https://example.test/a', title: 'A', groupId: 9 },
    ], [{ id: 9, title: 'Voyage' }]);
    const v = cmd(emptyVault(), 'capture', { bundle });
    expect(v.groups[0].name).toBe('Voyage');
    expect(searchLinks(v, { groupId: v.groups[0].id, order: 'group' }).map((l) => l.title)).toEqual(['A', 'B']);
  });
  it('B-03 / F-04 — exige un choix, puis complète sans doublon et sans déplacer les liens', () => {
    const before = organized();
    const incoming = organized();
    errorCode(() => cmd(before, 'capture', { bundle: incoming }), 'GROUP_CHOICE_REQUIRED');
    const choices = Object.fromEntries(incoming.groups.map((g, i) => [g.id, { targetId: before.groups[i].id, name: g.name }]));
    const after = cmd(before, 'capture', { bundle: incoming, choices });
    expect(after.links).toHaveLength(1); expect(after.groups).toHaveLength(2);
    expect(after.groups.map((g) => g.linkIds)).toEqual(before.groups.map((g) => g.linkIds));
  });
  it('B-04 / F-04 — refuse un groupe sans nom avant écriture', () => {
    const { bundle } = captureBundle([{ id: 1, index: 0, url: 'https://example.test/', groupId: 4 }], [{ id: 4, title: '' }]);
    expect(() => cmd(emptyVault(), 'capture', { bundle })).toThrow('nom');
    const after = cmd(emptyVault(), 'capture', { bundle, choices: { 4: { name: 'Projet', mode: 'new' } } });
    expect(after.groups[0].name).toBe('Projet');
  });
  it('F-05 — ignore pages internes, identifiants, URLs dangereuses et onglets privés', () => {
    const { bundle, ignored } = captureBundle([
      { id: 1, index: 0, url: 'chrome://settings' }, { id: 2, index: 1, url: 'javascript:alert(1)' },
      { id: 3, index: 2, url: 'https://u:p@example.test/' }, { id: 4, index: 3, url: 'https://example.test/private', incognito: true },
      { id: 5, index: 4, url: 'https://example.test/public' },
    ], []);
    expect(ignored).toHaveLength(4); expect(bundle.links).toHaveLength(1);
  });
  it('B-05 / F-07 — applique texte ET groupe ET tous les tags sélectionnés', () => {
    let v = organized(); v = add(v, 'https://example.test/b', 'B');
    v = cmd(v, 'editLink', { id: v.links[1].id, url: v.links[1].url, title: 'B', tags: ['travail', 'URGENT'], groupIds: [] });
    expect(v.tags.filter((t) => t.name.toLowerCase() === 'urgent')).toHaveLength(1);
    const urgent = v.tags.find((t) => t.name === 'Urgent').id;
    const travail = v.tags.find((t) => t.name === 'travail').id;
    expect(searchLinks(v, { tagIds: [urgent, travail] }).map((l) => l.title)).toEqual(['B']);
    expect(searchLinks(v, { text: 'urgent', groupId: v.groups[0].id }).map((l) => l.title)).toEqual(['Personnalisé']);
  });
  it('B-07, B-15 / F-11 — recrée tags et groupes supprimés après un redémarrage simulé', () => {
    let v = organized(); const original = structuredClone(v);
    v = cmd(v, 'trash', { ids: [v.links[0].id] });
    for (const g of [...v.groups]) v = cmd(v, 'deleteGroup', { id: g.id });
    for (const t of [...v.tags]) v = cmd(v, 'deleteTag', { id: t.id });
    // Quand le stockage est relu dans un nouveau contexte et le lien réactivé.
    v = validateVault(JSON.parse(JSON.stringify(v)));
    expect(searchLinks(v)).toHaveLength(0); expect(searchLinks(v, { trash: true })).toHaveLength(1);
    v = cmd(v, 'restore', { ids: [v.links[0].id] });
    expect(v.links[0].deletedAt).toBeNull();
    expect(v.tags).toEqual(original.tags);
    expect(v.groups.map((g) => [g.id, g.name, g.linkIds])).toEqual(original.groups.map((g) => [g.id, g.name, g.linkIds]));
  });
  it('F-11 — conserve l’ordre en recréant un groupe et en réactivant ses liens séparément', () => {
    let v = organized(); v = add(v, 'https://example.test/b', 'B'); v = add(v, 'https://example.test/c', 'C');
    const group = v.groups[0];
    for (const l of v.links.slice(1)) v = cmd(v, 'editLink', { id: l.id, url: l.url, title: l.title, tags: [], groupIds: [group.id] });
    const expected = [...v.groups[0].linkIds];
    v = cmd(v, 'trash', { ids: expected }); v = cmd(v, 'deleteGroup', { id: group.id });
    for (const id of [...expected].reverse()) v = cmd(v, 'restore', { ids: [id] });
    expect(v.groups.find((g) => g.id === group.id).linkIds).toEqual(expected);
  });
  it('B-08 / F-12, F-13 — export/import préserve le graphe avec de nouveaux identifiants', () => {
    const before = organized();
    const after = cmd(emptyVault(), 'import', { text: JSON.stringify(exportVault(before)) });
    expect(after.links[0].url).toBe(before.links[0].url); expect(after.links[0].createdAt).toBe(before.links[0].createdAt);
    expect(after.links[0].id).not.toBe(before.links[0].id);
    expect(after.groups.map((g) => g.name)).toEqual(['Voyage', 'À lire']);
    expect(after.groups.every((g) => g.linkIds[0] === after.links[0].id)).toBe(true);
  });
  it('B-09 / F-13 — rejette des références invalides sans modifier la source', () => {
    const v = organized(), original = structuredClone(v), data = exportVault(v);
    data.vault.groups[0].linkIds.push('inexistant');
    expect(() => cmd(v, 'import', { text: JSON.stringify(data) })).toThrow('Référence');
    expect(v).toEqual(original);
  });
  it('F-13 — rejette version future, JSON malformé, import trop gros et état supprimé', () => {
    expect(() => parseImport('{')).toThrow('JSON');
    expect(() => parseImport(JSON.stringify({ format: 'tabs-vault', exportVersion: 2 }))).toThrow('version');
    expect(() => parseImport(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('10 Mio');
    const v = organized();
    const data = exportVault(v); data.vault.links[0].deletedAt = new Date().toISOString();
    expect(() => parseImport(JSON.stringify(data))).toThrow('supprimé');
  });
  it('B-11 / F-11 — retrait d’un groupe distinct de la suppression globale', () => {
    const v = organized(); const id = v.links[0].id;
    const after = cmd(v, 'removeFromGroup', { groupId: v.groups[0].id, ids: [id] });
    expect(after.links[0].deletedAt).toBeNull();
    expect(after.groups[0].linkIds).toEqual([]); expect(after.groups[1].linkIds).toEqual([id]);
  });
  it('B-12 / F-13 — import additif, titre personnalisé conservé et tags complétés', () => {
    const v = organized(); let incoming = add(emptyVault());
    incoming = cmd(incoming, 'editLink', { id: incoming.links[0].id, title: 'Import', url: incoming.links[0].url, tags: ['travail'], groupIds: [] });
    const after = cmd(v, 'import', { text: JSON.stringify(exportVault(incoming)) });
    expect(after.links).toHaveLength(1); expect(after.links[0].title).toBe('Personnalisé');
    expect(after.links[0].tagIds).toHaveLength(2); expect(after.groups).toHaveLength(2);
  });
  it('B-13 / F-03 — fragments et paramètres font partie de l’identité', () => {
    let v = emptyVault();
    for (const url of ['https://example.test/?q=1#a', 'https://example.test/?q=2#a', 'https://example.test/?q=1#b']) v = add(v, url);
    expect(v.links).toHaveLength(3); expect(canonicalUrl('https://EXAMPLE.test')).toBe('https://example.test/');
  });
  it('F-08 — refuse une modification vers un doublon même en corbeille', () => {
    let v = add(organized(), 'https://example.test/b'); v = cmd(v, 'trash', { ids: [v.links[1].id] });
    errorCode(() => cmd(v, 'editLink', { id: v.links[0].id, url: v.links[1].url, title: 'X', tags: [], groupIds: [] }), 'DUPLICATE_URL');
  });
  it('B-14, B-18 / F-11 — purge confirmée, liens actifs et références valides', () => {
    let v = add(organized(), 'https://example.test/b'); v = cmd(v, 'trash', { ids: [v.links[0].id] });
    expect(() => cmd(v, 'purge', { confirmed: false })).toThrow('Confirmation');
    const after = cmd(v, 'purge', { confirmed: true });
    expect(after.links).toHaveLength(1); expect(after.links[0].url).toBe('https://example.test/b');
    expect(after.groups.every((g) => g.linkIds.length === 0)).toBe(true);
  });
  it('B-16 / F-11 — sauvegarder une URL supprimée la réactive avec son organisation', () => {
    let v = organized(); const link = v.links[0];
    v = cmd(v, 'trash', { ids: [link.id] });
    const after = applyCommand(v, 'save', { url: link.url, title: 'Autre titre' });
    expect(after.result.status).toBe('restored'); expect(after.vault.links).toHaveLength(1);
    expect(after.vault.links[0].id).toBe(link.id); expect(after.vault.links[0].title).toBe(link.title);
  });
  it('B-17 / F-12 — n’exporte pas la corbeille ni ses références et snapshots', () => {
    let v = organized(); v = cmd(v, 'trash', { ids: [v.links[0].id] });
    const data = exportVault(v);
    expect(data.vault.links).toEqual([]); expect(data.vault.groups.every((g) => !g.linkIds.length)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('restoreContext');
  });
  it('B-19 / F-13 — l’import réactive un lien supprimé avec son organisation', () => {
    let v = organized(); const incoming = exportVault(v); const id = v.links[0].id;
    v = cmd(v, 'trash', { ids: [id] });
    const choices = Object.fromEntries(incoming.vault.groups.map((g) => [g.id, { name: g.name, targetId: g.id }]));
    const after = cmd(v, 'import', { text: JSON.stringify(incoming), choices });
    expect(after.links).toHaveLength(1); expect(after.links[0].id).toBe(id); expect(after.links[0].deletedAt).toBeNull();
  });
  it('F-09 — fusionne les tags Unicode équivalents et réordonne les liens actifs', () => {
    let v = organized(); v = cmd(v, 'createTag', { name: 'école' }); v = cmd(v, 'createTag', { name: 'E\u0301COLE' });
    expect(v.tags).toHaveLength(2);
    v = add(v, 'https://example.test/b', 'B');
    v = cmd(v, 'editLink', { id: v.links[1].id, title: 'B', url: v.links[1].url, tags: [], groupIds: [v.groups[0].id] });
    v = cmd(v, 'move', { groupId: v.groups[0].id, id: v.links[1].id, direction: -1 });
    expect(searchLinks(v, { groupId: v.groups[0].id, order: 'group' }).map((l) => l.title)).toEqual(['B', 'Personnalisé']);
  });
});

describe('Cas de restauration après changements d’organisation', () => {
  it('réutilise un tag renommé par identifiant sans dupliquer son ancien nom', () => {
    let v = organized(); const id = v.links[0].id, tagId = v.tags[0].id;
    v = cmd(v, 'trash', { ids: [id] }); v = cmd(v, 'renameTag', { id: tagId, name: 'Prioritaire' });
    v = cmd(v, 'restore', { ids: [id] });
    expect(v.tags).toEqual([{ id: tagId, name: 'Prioritaire' }]); expect(v.links[0].tagIds).toEqual([tagId]);
  });
  it('recrée un groupe disparu sans réinscrire les autres liens encore actifs', () => {
    let v = organized(); v = add(v, 'https://example.test/b', 'B');
    const groupId = v.groups[0].id, a = v.links[0], b = v.links[1];
    v = cmd(v, 'editLink', { id: b.id, url: b.url, title: b.title, tags: [], groupIds: [groupId] });
    v = cmd(v, 'trash', { ids: [a.id] }); v = cmd(v, 'deleteGroup', { id: groupId });
    v = cmd(v, 'restore', { ids: [a.id] });
    expect(v.groups.find((g) => g.id === groupId).linkIds).toEqual([a.id]);
  });
});

it('F-13 — demande aussi un choix si la réactivation recrée un groupe homonyme', () => {
  let v = organized(); const incoming = exportVault(v), id = v.links[0].id;
  v = cmd(v, 'trash', { ids: [id] });
  for (const g of [...v.groups]) v = cmd(v, 'deleteGroup', { id: g.id });
  errorCode(() => cmd(v, 'import', { text: JSON.stringify(incoming) }), 'GROUP_CHOICE_REQUIRED');
  const choices = Object.fromEntries(incoming.vault.groups.map((g) => [g.id, { targetId: g.id, name: g.name }]));
  const restored = cmd(v, 'import', { text: JSON.stringify(incoming), choices });
  expect(restored.groups).toHaveLength(2); expect(restored.links[0].deletedAt).toBeNull();
});
