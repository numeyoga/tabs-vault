export class VaultError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export const fail = (message, code = 'INVALID_INPUT', details) => {
  throw new VaultError(code, message, details);
};
export const emptyVault = () => ({
  schemaVersion: 1,
  revision: 0,
  links: [],
  tags: [],
  groups: [],
});
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
export function canonicalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('URL absolue invalide.', 'UNSUPPORTED_URL');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    fail('Seules les URLs HTTP/HTTPS sans identifiants sont acceptées.', 'UNSUPPORTED_URL');
  }
  return url.href;
}
export function nameOf(value) {
  if (typeof value !== 'string') {
    fail('Un nom est nécessaire.');
  }
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 100) {
    fail('Le nom doit contenir de 1 à 100 caractères.');
  }
  return name;
}
export const tagKey = (name) => nameOf(name).toLowerCase();
const unique = (values) => [...new Set(values)];
const find = (items, id) => items.find((item) => item.id === id) ?? fail('Élément introuvable.');
const titleOf = (value, url) => (typeof value === 'string' ? value.trim() || url : url);
const dateValid = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
function list(value) {
  if (!Array.isArray(value)) {
    fail('Liste invalide.');
  }
  return value;
}
function ids(value) {
  const a = list(value);
  if (a.some((v) => typeof v !== 'string' || !v) || unique(a).length !== a.length) {
    fail('Identifiants invalides ou répétés.');
  }
  return [...a];
}
function entityList(value) {
  const a = list(value);
  if (
    a.some((v) => !isObject(v) || typeof v.id !== 'string' || !v.id) ||
    unique(a.map((v) => v.id)).length !== a.length
  ) {
    fail('Entités invalides.');
  }
  return a;
}
// Reconstruct known fields only. Never merge arbitrary imported objects.
export function validateVault(value, { importing = false } = {}) {
  if (!isObject(value) || value.schemaVersion !== 1) {
    fail('Version de données non prise en charge.', 'IMPORT_VERSION_UNSUPPORTED');
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    fail('Révision invalide.');
  }
  const v = emptyVault();
  v.revision = value.revision;
  v.tags = entityList(value.tags).map((t) => ({ id: t.id, name: nameOf(t.name) }));
  if (unique(v.tags.map((t) => tagKey(t.name))).length !== v.tags.length) {
    fail('Tags dupliqués.');
  }
  v.links = entityList(value.links).map((l) => {
    const url = canonicalUrl(l.url);
    if (typeof l.title !== 'string' || !dateValid(l.createdAt) || !dateValid(l.updatedAt)) {
      fail('Lien invalide.');
    }
    const tagIds = ids(l.tagIds);
    if (tagIds.some((id) => !v.tags.some((t) => t.id === id))) {
      fail('Référence de tag inexistante.');
    }
    const deletedAt = l.deletedAt ?? null;
    if (deletedAt !== null && (!dateValid(deletedAt) || importing)) {
      fail('État supprimé non accepté dans cet import.');
    }
    let restoreContext = null;
    if (deletedAt) {
      if (!isObject(l.restoreContext)) {
        fail('Contexte de restauration manquant.');
      }
      restoreContext = {
        tags: entityList(l.restoreContext.tags).map((t) => ({ id: t.id, name: nameOf(t.name) })),
        groups: entityList(l.restoreContext.groups).map((g) => {
          if (!Number.isSafeInteger(g.index) || g.index < 0) {
            fail('Position de restauration invalide.');
          }
          return { id: g.id, name: nameOf(g.name), index: g.index, linkIds: ids(g.linkIds ?? []) };
        }),
      };
    }
    return {
      id: l.id,
      url,
      title: titleOf(l.title, url),
      tagIds,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      deletedAt,
      restoreContext,
    };
  });
  if (unique(v.links.map((l) => l.url)).length !== v.links.length) {
    fail('URLs dupliquées.');
  }
  v.groups = entityList(value.groups).map((g) => {
    if (!dateValid(g.createdAt) || !dateValid(g.updatedAt)) {
      fail('Dates de groupe invalides.');
    }
    const linkIds = ids(g.linkIds);
    if (linkIds.some((id) => !v.links.some((l) => l.id === id))) {
      fail('Référence de lien inexistante.');
    }
    return {
      id: g.id,
      name: nameOf(g.name),
      linkIds,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  });
  return v;
}
function ensureTag(v, name, preferredId = uuid()) {
  const normalized = nameOf(name);
  let tag = v.tags.find((t) => tagKey(t.name) === tagKey(normalized));
  if (!tag) {
    tag = { id: preferredId, name: normalized };
    v.tags.push(tag);
  }
  return tag.id;
}
function restore(v, link) {
  if (!link.deletedAt) {
    return;
  }
  const context = link.restoreContext;
  link.tagIds = unique([
    ...link.tagIds,
    ...context.tags.map(
      (t) => v.tags.find((existing) => existing.id === t.id)?.id ?? ensureTag(v, t.name, t.id),
    ),
  ]);
  for (const snapshot of context.groups) {
    let group = v.groups.find((g) => g.id === snapshot.id);
    if (!group) {
      group = {
        id: snapshot.id,
        name: snapshot.name,
        linkIds: [],
        createdAt: now(),
        updatedAt: now(),
      };
      v.groups.push(group);
    }
    if (!group.linkIds.includes(link.id)) {
      const order = snapshot.linkIds ?? [];
      const successor = group.linkIds.findIndex(
        (id) => order.includes(id) && order.indexOf(id) > snapshot.index,
      );
      const index = successor >= 0 ? successor : Math.min(snapshot.index, group.linkIds.length);
      group.linkIds.splice(index, 0, link.id);
    }
    group.updatedAt = now();
  }
  link.deletedAt = null;
  link.restoreContext = null;
  link.updatedAt = now();
}
function save(v, input) {
  const url = canonicalUrl(input.url);
  let link = v.links.find((l) => l.url === url);
  const status = !link ? 'created' : link.deletedAt ? 'restored' : 'existing';
  if (link) {
    restore(v, link);
  } else {
    const time = now();
    link = {
      id: uuid(),
      url,
      title: titleOf(input.title, url),
      tagIds: [],
      createdAt: time,
      updatedAt: time,
      deletedAt: null,
      restoreContext: null,
    };
    v.links.push(link);
  }
  return { link, status };
}
export function exportVault(v) {
  const activeIds = new Set(v.links.filter((l) => !l.deletedAt).map((l) => l.id));
  return {
    format: 'tabs-vault',
    exportVersion: 1,
    exportedAt: now(),
    vault: {
      schemaVersion: 1,
      revision: 0,
      links: v.links
        .filter((l) => activeIds.has(l.id))
        .map(({ deletedAt, restoreContext, ...l }) => structuredClone(l)),
      tags: structuredClone(v.tags),
      groups: v.groups.map((g) => ({ ...g, linkIds: g.linkIds.filter((id) => activeIds.has(id)) })),
    },
  };
}
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export function parseImport(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    fail('Le fichier dépasse 10 Mio.');
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('JSON invalide.');
  }
  if (data?.format !== 'tabs-vault' || data.exportVersion !== 1) {
    fail('Format ou version d’export non pris en charge.', 'IMPORT_VERSION_UNSUPPORTED');
  }
  return validateVault(data.vault, { importing: true });
}
// Both browser captures and imported groups require explicit collision choices.
function merge(v, incoming, choices = {}) {
  const tagMap = new Map(incoming.tags.map((t) => [t.id, ensureTag(v, t.name)]));
  const linkMap = new Map();
  const statuses = [];
  for (const source of incoming.links) {
    const saved = save(v, source);
    if (saved.status === 'created') {
      saved.link.createdAt = source.createdAt;
      saved.link.updatedAt = source.updatedAt;
    }
    saved.link.tagIds = unique([
      ...saved.link.tagIds,
      ...source.tagIds.map((id) => tagMap.get(id)),
    ]);
    linkMap.set(source.id, saved.link.id);
    statuses.push(saved.status);
  }
  for (const source of incoming.groups) {
    const choice = choices[source.id];
    const name = nameOf(choice?.name ?? source.name);
    const collisions = v.groups.filter((g) => g.name.normalize('NFC') === name);
    let target;
    if (choice?.targetId) {
      target = find(v.groups, choice.targetId);
      if (target.name.normalize('NFC') !== name) {
        fail('Le groupe choisi ne correspond plus au nom.', 'REVISION_CONFLICT');
      }
    } else {
      if (collisions.length && choice?.mode !== 'new') {
        fail('Choisissez un groupe existant ou un groupe distinct.', 'GROUP_CHOICE_REQUIRED');
      }
      target = { id: uuid(), name, linkIds: [], createdAt: now(), updatedAt: now() };
      v.groups.push(target);
    }
    target.linkIds = unique([...target.linkIds, ...source.linkIds.map((id) => linkMap.get(id))]);
    target.updatedAt = now();
  }
  return { count: incoming.links.length, statuses };
}
export function previewMergeGroups(vault, bundle) {
  const prospective = structuredClone(vault);
  for (const source of bundle.links) {
    const existing = prospective.links.find((l) => l.url === canonicalUrl(source.url));
    if (existing?.deletedAt) {
      restore(prospective, existing);
    }
  }
  return prospective.groups;
}
export function captureBundle(tabs, groups) {
  const v = emptyVault(),
    ignored = [];
  const browserMap = new Map();
  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    try {
      if (tab.incognito) {
        fail('Onglet privé exclu.');
      }
      const { link } = save(v, tab);
      browserMap.set(tab.id, link.id);
    } catch (error) {
      ignored.push({ title: tab.title || 'Onglet', reason: error.message });
    }
  }
  for (const group of groups) {
    const members = tabs
      .filter((t) => t.groupId === group.id)
      .sort((a, b) => a.index - b.index)
      .map((t) => browserMap.get(t.id))
      .filter(Boolean);
    if (members.length) {
      v.groups.push({
        id: String(group.id),
        name: group.title?.trim() || '',
        linkIds: unique(members),
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }
  return { bundle: v, ignored };
}
export function applyCommand(current, type, payload = {}) {
  const v = structuredClone(current);
  let result;
  switch (type) {
    case 'save': {
      const saved = save(v, payload);
      result = { id: saved.link.id, status: saved.status };
      break;
    }
    case 'capture':
      result = merge(v, payload.bundle, payload.choices);
      break;
    case 'import':
      result = merge(v, parseImport(payload.text), payload.choices);
      break;
    case 'editLink': {
      const l = find(v.links, payload.id);
      if (l.deletedAt) {
        fail('Réactivez ce lien avant de le modifier.');
      }
      const url = canonicalUrl(payload.url);
      const duplicate = v.links.find((other) => other.id !== l.id && other.url === url);
      if (duplicate) {
        fail('Cette URL existe déjà.', 'DUPLICATE_URL', { id: duplicate.id });
      }
      const groupIds = ids(payload.groupIds);
      groupIds.forEach((id) => find(v.groups, id));
      l.url = url;
      l.title = titleOf(payload.title, url);
      l.tagIds = unique(list(payload.tags).map((name) => ensureTag(v, name)));
      for (const group of v.groups) {
        group.linkIds = group.linkIds.filter((id) => id !== l.id || groupIds.includes(group.id));
        if (groupIds.includes(group.id) && !group.linkIds.includes(l.id)) {
          group.linkIds.push(l.id);
        }
      }
      l.updatedAt = now();
      break;
    }
    case 'associate': {
      const link = find(v.links, payload.id);
      if (link.deletedAt) {
        fail('Réactivez ce lien avant de le modifier.');
      }
      if (!['tag', 'group'].includes(payload.kind) || typeof payload.assigned !== 'boolean') {
        fail('Association invalide.');
      }
      let associationId = payload.associationId;
      if (!associationId) {
        if (!payload.assigned) {
          fail('Identifiant nécessaire pour retirer une association.');
        }
        const name = nameOf(payload.name);
        if (payload.kind === 'tag') {
          associationId = ensureTag(v, name);
        } else {
          if (v.groups.some((g) => g.name === name)) {
            fail('Sélectionnez le groupe existant.', 'GROUP_CHOICE_REQUIRED');
          }
          associationId = uuid();
          v.groups.push({
            id: associationId,
            name,
            linkIds: [],
            createdAt: now(),
            updatedAt: now(),
          });
        }
      }
      if (payload.kind === 'tag') {
        find(v.tags, associationId);
        link.tagIds = payload.assigned
          ? unique([...link.tagIds, associationId])
          : link.tagIds.filter((id) => id !== associationId);
      } else {
        const group = find(v.groups, associationId);
        group.linkIds = payload.assigned
          ? unique([...group.linkIds, link.id])
          : group.linkIds.filter((id) => id !== link.id);
        group.updatedAt = now();
      }
      link.updatedAt = now();
      result = { associationId };
      break;
    }
    case 'trash':
      for (const id of ids(payload.ids)) {
        const l = find(v.links, id);
        if (l.deletedAt) {
          continue;
        }
        l.restoreContext = {
          tags: l.tagIds.map((tagId) => structuredClone(find(v.tags, tagId))),
          groups: v.groups
            .filter((g) => g.linkIds.includes(id))
            .map((g) => ({
              id: g.id,
              name: g.name,
              index: g.linkIds.indexOf(id),
              linkIds: [...g.linkIds],
            })),
        };
        l.deletedAt = now();
        l.updatedAt = now();
      }
      break;
    case 'restore': {
      const links = ids(payload.ids).map((id) => find(v.links, id));
      // Full membership snapshots preserve order even when restoration is partial.
      links.sort(
        (a, b) =>
          (a.restoreContext?.groups[0]?.index ?? 0) - (b.restoreContext?.groups[0]?.index ?? 0),
      );
      links.forEach((l) => restore(v, l));
      break;
    }
    case 'purge': {
      if (payload.confirmed !== true) {
        fail('Confirmation requise.');
      }
      const removed = new Set(v.links.filter((l) => l.deletedAt).map((l) => l.id));
      v.links = v.links.filter((l) => !removed.has(l.id));
      v.groups.forEach((g) => {
        g.linkIds = g.linkIds.filter((id) => !removed.has(id));
      });
      break;
    }
    case 'createGroup':
      v.groups.push({
        id: uuid(),
        name: nameOf(payload.name),
        linkIds: [],
        createdAt: now(),
        updatedAt: now(),
      });
      break;
    case 'renameGroup': {
      const g = find(v.groups, payload.id);
      g.name = nameOf(payload.name);
      g.updatedAt = now();
      break;
    }
    case 'deleteGroup':
      find(v.groups, payload.id);
      v.groups = v.groups.filter((g) => g.id !== payload.id);
      break;
    case 'createTag':
      ensureTag(v, payload.name);
      break;
    case 'renameTag': {
      const t = find(v.tags, payload.id),
        name = nameOf(payload.name);
      if (v.tags.some((other) => other.id !== t.id && tagKey(other.name) === tagKey(name))) {
        fail('Ce tag existe déjà.');
      }
      t.name = name;
      break;
    }
    case 'deleteTag':
      find(v.tags, payload.id);
      v.tags = v.tags.filter((t) => t.id !== payload.id);
      v.links.forEach((l) => {
        l.tagIds = l.tagIds.filter((id) => id !== payload.id);
      });
      break;
    case 'removeFromGroup': {
      const g = find(v.groups, payload.groupId);
      const remove = ids(payload.ids);
      g.linkIds = g.linkIds.filter((id) => !remove.includes(id));
      g.updatedAt = now();
      break;
    }
    case 'move': {
      const g = find(v.groups, payload.groupId);
      if (![1, -1].includes(payload.direction)) {
        fail('Direction invalide.');
      }
      const visible = g.linkIds.filter((id) => !find(v.links, id).deletedAt);
      const index = visible.indexOf(payload.id);
      if (index < 0) {
        fail('Lien absent du groupe.');
      }
      const other = visible[index + payload.direction];
      if (other) {
        const a = g.linkIds.indexOf(payload.id),
          b = g.linkIds.indexOf(other);
        [g.linkIds[a], g.linkIds[b]] = [g.linkIds[b], g.linkIds[a]];
      }
      break;
    }
    default:
      fail('Commande inconnue.');
  }
  v.revision++;
  return { vault: validateVault(v), result };
}
export function searchLinks(
  v,
  { text = '', groupId = '', tagIds = [], trash = false, order = 'date' } = {},
) {
  const q = text.trim().toLowerCase();
  const group = v.groups.find((g) => g.id === groupId);
  const tags = new Map(v.tags.map((t) => [t.id, t.name]));
  const membership = group ? new Set(group.linkIds) : null;
  const ranks = new Map(group?.linkIds.map((id, i) => [id, i]) ?? []);
  return v.links
    .filter(
      (l) =>
        Boolean(l.deletedAt) === trash &&
        (!membership || membership.has(l.id)) &&
        tagIds.every((id) => l.tagIds.includes(id)) &&
        (!q ||
          `${l.title} ${l.url} ${l.tagIds.map((id) => tags.get(id) ?? '').join(' ')}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) =>
      order === 'group' && group
        ? ranks.get(a.id) - ranks.get(b.id)
        : b.createdAt.localeCompare(a.createdAt),
    );
}
