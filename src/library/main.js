import './style.css';
import { showOrganizer, showAllTags } from './organizer.js';
import { request, observe, extensionMode } from './client.js';
import { searchLinks, parseImport, MAX_IMPORT_BYTES, previewMergeGroups } from '../domain/vault.js';

const root = document.querySelector('#app');
let vault, selected = new Set(), filter = { text: '', groupId: '', tagIds: [], trash: false, order: 'date' };
let busy = false;
let displayLimit = 100;
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key === 'checked') node.checked = value;
    else if (key === 'value') node.value = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean)); return node;
}
const button = (text, action, attrs = {}) => el('button', { type: 'button', text, onClick: () => run(action), ...attrs });
const status = el('p', { role: 'status', 'aria-live': 'polite', class: 'status' });
const errors = el('div', { role: 'alert', class: 'error' });
const content = el('main', { id: 'main' });
const nav = el('aside', { 'aria-label': 'Navigation et filtres' });
const search = el('input', { type: 'search', placeholder: 'Titre, URL ou tag…', 'aria-label': 'Rechercher', onInput: (e) => {
  filter.text = e.target.value; displayLimit = 100; selected.clear(); renderList();
} });
const heading = el('h1', { text: 'Tabs Vault' });
const topActions = el('div', { class: 'actions' });
const header = el('header', {}, [el('div', {}, [heading, el('p', { text: 'Vos onglets, à retrouver. Vos données, chez vous.' })]), topActions]);
const toolbar = el('section', { class: 'toolbar', 'aria-label': 'Recherche et actions' }, [search]);
const shell = el('div', { class: 'shell' }, [nav, el('div', { class: 'workspace' }, [toolbar, content])]);
root.append(header, ...(!extensionMode ? [el('p', { class: 'preview', text: 'Aperçu local : les captures et ouvertures natives nécessitent l’extension installée.' })] : []), status, errors, shell);
function announce(text) { status.textContent = text; }
function showError(error) {
  errors.replaceChildren(el('p', { text: error.message }));
  if (error.code === 'DUPLICATE_URL' && error.details?.id) {
    errors.append(button('Voir le lien existant', async () => {
      const link = vault.links.find((l) => l.id === error.details.id);
      if (!link) return;
      document.querySelector('dialog[open]')?.close();
      filter = { text: link.url, groupId: '', tagIds: [], trash: Boolean(link.deletedAt), order: 'date' };
      search.value = filter.text; render();
    }));
  }
}
async function run(action) {
  if (busy) return;
  errors.replaceChildren(); busy = true; root.setAttribute('aria-busy', 'true');
  try { await action(); }
  catch (error) {
    if (error.code === 'REVISION_CONFLICT') await reload();
    showError(error);
  } finally { busy = false; root.removeAttribute('aria-busy'); }
}
async function reload() {
  const data = await request('read'); vault = data.vault;
  selected = new Set([...selected].filter((id) => vault.links.some((l) => l.id === id && Boolean(l.deletedAt) === filter.trash)));
  if (!vault.groups.some((g) => g.id === filter.groupId)) filter.groupId = '';
  filter.tagIds = filter.tagIds.filter((id) => vault.tags.some((t) => t.id === id));
  render();
  if (data.lastOpening?.uncertain?.length) announce('Une ouverture a été interrompue. Vérifiez les onglets avant toute nouvelle tentative.');
}
async function mutate(type, payload, message = 'Modifications enregistrées.') {
  const data = await request(type, payload, vault.revision); vault = data.vault; render(); announce(message); return data;
}
function switchView(trash, groupId = '') {
  filter.trash = trash; filter.groupId = groupId; filter.tagIds = []; displayLimit = 100; selected.clear(); render();
}
function render() {
  nav.replaceChildren(
    el('h2', { text: 'Bibliothèque' }),
    button(`Tous les liens (${vault.links.filter((l) => !l.deletedAt).length})`, () => switchView(false), { 'aria-pressed': !filter.trash && !filter.groupId }),
    button(`Corbeille (${vault.links.filter((l) => l.deletedAt).length})`, () => switchView(true), { 'aria-pressed': filter.trash }),
    el('h2', { text: 'Groupes' }), button('+ Nouveau groupe', () => nameDialog('Créer un groupe', '', (name) => mutate('createGroup', { name }))),
  );
  for (const group of vault.groups) {
    nav.append(el('div', { class: 'nav-row' }, [
      button(group.name, () => switchView(false, group.id), { 'aria-pressed': filter.groupId === group.id && !filter.trash }),
      button('Renommer', () => nameDialog('Renommer le groupe', group.name, (name) => mutate('renameGroup', { id: group.id, name })), { 'aria-label': `Renommer le groupe ${group.name}` }),
      button('×', async () => {
        if (await confirmDialog('Supprimer ce groupe ?', 'Les liens restent dans la bibliothèque.')) await mutate('deleteGroup', { id: group.id });
      }, { 'aria-label': `Supprimer le groupe ${group.name}` }),
    ]));
  }
  nav.append(el('h2', { text: 'Tags' }), button('+ Nouveau tag', () => nameDialog('Créer un tag', '', (name) => mutate('createTag', { name }))));
  for (const tag of vault.tags) {
    const check = el('input', { type: 'checkbox', checked: filter.tagIds.includes(tag.id), onChange: (e) => {
      filter.tagIds = e.target.checked ? [...filter.tagIds, tag.id] : filter.tagIds.filter((id) => id !== tag.id); displayLimit = 100; selected.clear(); renderList();
    } });
    nav.append(el('div', { class: 'nav-row' }, [el('label', {}, [check, document.createTextNode(tag.name)]),
      button('Renommer', () => nameDialog('Renommer le tag', tag.name, (name) => mutate('renameTag', { id: tag.id, name })), { 'aria-label': `Renommer le tag ${tag.name}` }),
      button('×', async () => { if (await confirmDialog('Supprimer ce tag ?', 'Les liens sont conservés.')) await mutate('deleteTag', { id: tag.id }); }, { 'aria-label': `Supprimer le tag ${tag.name}` }),
    ]));
  }
  topActions.replaceChildren(
    ...(!extensionMode ? [button('Ajouter un lien de démonstration', () => addDialog())] : []),
    button('Exporter', async () => {
      if (!await confirmDialog('Exporter les liens actifs ?', 'Ce fichier non chiffré contient vos URLs. La corbeille est exclue.')) return;
      download((await request('export')).export, 'tabs-vault.json');
    }),
    button('Importer', () => importInput.click()),
  );
  renderList();
}
function renderList() {
  if (!vault) return;
  const visible = searchLinks(vault, filter);
  // Keep select-all and bulk actions scoped to the actual current result set.
  selected = new Set([...selected].filter((id) => visible.some((l) => l.id === id)));
  const group = vault.groups.find((g) => g.id === filter.groupId);
  const title = filter.trash ? 'Corbeille' : group?.name ?? 'Tous les liens';
  const bulk = el('div', { class: 'actions' });
  const all = el('input', { type: 'checkbox', checked: visible.length > 0 && visible.every((l) => selected.has(l.id)), onChange: (e) => { selected = new Set(e.target.checked ? visible.map((l) => l.id) : []); renderList(); } });
  bulk.append(el('label', {}, [all, document.createTextNode('Tout sélectionner')]), el('span', { text: `${selected.size} sélectionné(s)` }));
  if (filter.trash) {
    bulk.append(button('Réactiver la sélection', () => mutate('restore', { ids: [...selected] }, 'Liens réactivés.'), { disabled: !selected.size }),
      button('Vider la corbeille', async () => {
        const count = vault.links.filter((l) => l.deletedAt).length;
        if (await confirmDialog('Vider définitivement la corbeille ?', `${count} lien(s) seront effacés. Cette action est irréversible.`)) {
          await mutate('purge', { confirmed: true }, 'Corbeille vidée.'); selected.clear(); renderList();
        }
      }, { class: 'danger', disabled: !vault.links.some((l) => l.deletedAt) }));
  } else {
    bulk.append(button('Ouvrir la sélection', () => openSelection(visible.filter((l) => selected.has(l.id)), group?.name), { disabled: !selected.size }),
      button('Mettre la sélection à la corbeille', () => trashLinks([...selected]), { disabled: !selected.size }));
    if (group) bulk.append(button('Ouvrir le groupe', () => openSelection(searchLinks(vault, { groupId: group.id, order: 'group' }), group.name)),
      button('Retirer la sélection du groupe', () => mutate('removeFromGroup', { groupId: group.id, ids: [...selected] }), { disabled: !selected.size }));
  }
  const sort = el('select', { 'aria-label': 'Trier', onChange: (e) => { filter.order = e.target.value; selected.clear(); renderList(); } }, [
    el('option', { value: 'date', text: 'Date de sauvegarde' }), ...(group ? [el('option', { value: 'group', text: 'Ordre du groupe' })] : []),
  ]); sort.value = filter.order === 'group' && group ? 'group' : 'date';
  content.replaceChildren(el('div', { class: 'section-heading' }, [el('h2', { text: `${title} · ${visible.length}` }), sort]), bulk);
  if (filter.trash) content.append(el('p', { text: 'Les liens restent ici jusqu’à réactivation ou vidage définitif. Ils ne sont pas inclus dans les exports.' }));
  if (!visible.length) content.append(el('p', { class: 'empty', text: 'Aucun lien à afficher.' }));
  const list = el('ul', { class: 'links', 'aria-label': 'Liens sauvegardés' });
  const fragment = document.createDocumentFragment();
  for (const link of visible.slice(0, displayLimit)) {
    const check = el('input', { type: 'checkbox', 'aria-label': `Sélectionner ${link.title}`, checked: selected.has(link.id), onChange: (e) => { if (e.target.checked) selected.add(link.id); else selected.delete(link.id); renderList(); } });
    const info = el('div', { class: 'link-info' }, [el('h3', { text: link.title }), el('p', { class: 'url', text: link.url }),
      el('p', { class: 'metadata', text: new Date(link.createdAt).toLocaleDateString('fr') }),
      tagPills(link),
      el('p', { class: 'metadata', text: vault.groups.filter((g) => g.linkIds.includes(link.id)).map((g) => g.name).join(' · ') }),
    ]);
    const actions = el('div', { class: 'actions' });
    if (filter.trash) actions.append(button('Réactiver', () => mutate('restore', { ids: [link.id] }, 'Lien réactivé.')));
    else {
      actions.append(button('Ouvrir', () => openSelection([link], undefined, true)), button('Modifier', () => editDialog(link)), button('Corbeille', () => trashLinks([link.id])));
      if (group) actions.append(button('Retirer du groupe', () => mutate('removeFromGroup', { groupId: group.id, ids: [link.id] })),
        button('Monter', () => mutate('move', { groupId: group.id, id: link.id, direction: -1 })), button('Descendre', () => mutate('move', { groupId: group.id, id: link.id, direction: 1 })));
    }
    fragment.append(el('li', { 'data-link-id': link.id }, [check, info, actions]));
  }
  list.append(fragment); content.append(list);
  if (visible.length > displayLimit) content.append(button(`Afficher les suivants (${visible.length - displayLimit} restants)`, () => { displayLimit += 100; renderList(); }));
}
function tagPills(link) {
  const tags = link.tagIds.map((id) => vault.tags.find((tag) => tag.id === id)).filter(Boolean);
  const pills = el('div', { class: 'tag-pills', 'aria-label': 'Tags du lien' });
  for (const tag of tags.slice(0, 2)) pills.append(el('span', { class: 'tag-pill', text: tag.name }));
  if (tags.length > 2) {
    const more = button(`+${tags.length - 2}`, () => showAllTags(more, tags), { class: 'tag-pill tag-more', 'aria-label': `Afficher les ${tags.length} tags`, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    pills.append(more);
  }
  if (!link.deletedAt) {
    const add = button('+', () => showOrganizer(add, link.id, {
      getVault: () => vault,
      command: (payload) => mutate('associate', payload, 'Organisation enregistrée.'),
      refresh: reload,
    }), { class: 'organizer-trigger', 'aria-label': `Organiser ${link.title}`, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-organizer-link': link.id });
    pills.append(add);
  }
  return pills;
}
async function trashLinks(ids) {
  if (ids.length > 1 && !await confirmDialog('Mettre les liens à la corbeille ?', `${ids.length} liens seront masqués de la bibliothèque.`)) return;
  await mutate('trash', { ids }, 'Liens déplacés dans la corbeille.'); selected.clear(); renderList();
}
function dialog(title) {
  const box = el('dialog', { 'aria-label': title });
  const form = el('form'); const body = el('div', { class: 'form-body' });
  const feedback = el('p', { role: 'alert' });
  const cancel = el('button', { type: 'button', text: 'Annuler', onClick: () => box.close() });
  const submit = el('button', { type: 'submit', text: 'Enregistrer', class: 'primary' });
  form.append(el('h2', { text: title }), body, feedback, el('div', { class: 'actions' }, [cancel, submit]));
  box.append(form); document.body.append(box);
  box.addEventListener('close', () => box.remove(), { once: true });
  return { box, form, body, feedback, submit };
}
function field(label, input) { return el('label', { class: 'field' }, [el('span', { text: label }), input]); }
function handleSubmit(d, action) {
  d.form.addEventListener('submit', async (event) => {
    event.preventDefault(); d.submit.disabled = true; d.feedback.textContent = '';
    try { await action(); d.box.close(); }
    catch (error) { d.feedback.textContent = error.message; showError(error); if (error.code === 'REVISION_CONFLICT') await reload(); }
    finally { d.submit.disabled = false; }
  });
  d.box.showModal();
}
function nameDialog(title, value, save) {
  const d = dialog(title), input = el('input', { value, required: true, maxlength: '200' });
  d.body.append(field('Nom', input)); handleSubmit(d, () => save(input.value));
}
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const d = dialog(title); let accepted = false; d.submit.textContent = 'Confirmer';
    d.body.append(el('p', { text: message }));
    d.form.addEventListener('submit', (e) => { e.preventDefault(); accepted = true; d.box.close(); });
    d.box.addEventListener('close', () => resolve(accepted), { once: true }); d.box.showModal();
  });
}
function editDialog(link) {
  const d = dialog('Modifier le lien');
  const title = el('input', { value: link.title }); const url = el('input', { value: link.url, type: 'url', required: true });
  const tagNames = link.tagIds.map((id) => vault.tags.find((t) => t.id === id)?.name).filter(Boolean).join('\n');
  // One name per line permits punctuation (including commas) in tag names.
  const tagArea = el('textarea', { rows: 4 }); tagArea.value = tagNames;
  const groups = el('fieldset', {}, [el('legend', { text: 'Groupes' })]);
  const choices = vault.groups.map((g) => {
    const input = el('input', { type: 'checkbox', checked: g.linkIds.includes(link.id) });
    groups.append(el('label', {}, [input, document.createTextNode(g.name)])); return { id: g.id, input };
  });
  d.body.append(field('Titre', title), field('URL', url), field('Tags (un par ligne)', tagArea), groups);
  const revision = vault.revision;
  handleSubmit(d, async () => {
    const data = await request('editLink', { id: link.id, title: title.value, url: url.value, tags: tagArea.value.split('\n').map((t) => t.trim()).filter(Boolean), groupIds: choices.filter((c) => c.input.checked).map((c) => c.id) }, revision);
    vault = data.vault; render(); announce('Lien modifié.');
  });
}
function addDialog() {
  const d = dialog('Ajouter un lien de démonstration');
  const url = el('input', { type: 'url', required: true }); const title = el('input');
  d.body.append(field('URL', url), field('Titre', title)); handleSubmit(d, () => mutate('save', { url: url.value, title: title.value }, 'Lien ajouté.'));
}
async function openSelection(links, name, single = false) {
  if (!links.length) return;
  if (links.length > 20 && !await confirmDialog('Ouvrir ces onglets ?', `${links.length} onglets seront ouverts.`)) return;
  if (!single && !name) {
    return nameDialog('Nom du groupe à ouvrir', 'Sélection', (value) => performOpen(links, value, single));
  }
  return performOpen(links, name, single);
}
async function performOpen(links, name, single) {
  const { report } = await request('open', { ids: links.map((l) => l.id), name, single, confirmed: true });
  announce(`${report.successes.length} onglet(s) ouvert(s). ${report.fallback ? 'Ouverture dans une nouvelle fenêtre.' : ''} ${report.warning}`);
  if (report.failures.length) {
    errors.replaceChildren(el('p', { text: `${report.failures.length} ouverture(s) ont échoué.` }), button('Réessayer les échecs uniquement', () => openSelection(links.filter((l) => report.failures.includes(l.id)), name, single)));
  }
}
function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Shared collision UI for imports and native captures.
function bundleDialog({ title, bundle, ignored = [], commit, cancel }) {
  const d = dialog(title); d.submit.textContent = 'Confirmer';
  d.body.append(el('p', { text: `${bundle.links.length} lien(s), ${bundle.groups.length} groupe(s). Les liens existants sont réutilisés et réactivés si nécessaire.` }));
  if (ignored.length) d.body.append(el('details', {}, [el('summary', { text: `${ignored.length} onglet(s) ignoré(s)` }), ...ignored.map((item) => el('p', { text: `${item.title} : ${item.reason}` }))]));
  const prospectiveGroups = previewMergeGroups(vault, bundle);
  const rows = bundle.groups.map((source) => {
    const input = el('input', { value: source.name, required: true });
    const target = el('select', { 'aria-label': `Destination du groupe ${source.name || 'sans nom'}` });
    const update = () => {
      const matches = prospectiveGroups.filter((g) => g.name === input.value.trim().normalize('NFC'));
      target.replaceChildren(...(matches.length ? [el('option', { value: '', text: 'Choisir une destination…' })] : []), el('option', { value: 'new', text: 'Créer un groupe distinct' }), ...matches.map((g, i) => el('option', { value: g.id, text: `Compléter ${g.name} (${g.linkIds.length} liens, ${i + 1})` })));
      target.required = true;
    }; input.addEventListener('input', update); update();
    d.body.append(field('Nom du groupe', input), target); return { source, input, target };
  });
  const revision = vault.revision; let committed = false;
  handleSubmit(d, async () => {
    const choices = Object.fromEntries(rows.map(({ source, input, target }) => [source.id, { name: input.value, mode: target.value === 'new' ? 'new' : 'existing', ...(target.value !== 'new' ? { targetId: target.value } : {}) }]));
    const data = await commit(choices, revision); vault = data.vault; committed = true; render(); announce('Sauvegarde terminée.');
  });
  d.box.addEventListener('close', () => { if (!committed && cancel) cancel().catch(showError); }, { once: true });
}
const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onChange: (event) => run(async () => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Le fichier dépasse 10 Mio.');
  const text = await file.text(); const bundle = parseImport(text);
  bundleDialog({ title: 'Importer la bibliothèque', bundle, commit: (choices, revision) => request('import', { text, choices }, revision) });
}) }); root.append(importInput);
observe(() => { reload().catch(showError); });
(async () => {
  announce('Chargement…');
  try {
    await reload(); announce('Bibliothèque prête.');
    const key = new URLSearchParams(location.search).get('capture');
    if (key) {
      const { pending } = await request('pending', { key });
      if (pending) bundleDialog({ title: 'Sauvegarder les onglets', ...pending, commit: (choices, revision) => request('commitCapture', { key, choices }, revision), cancel: () => request('cancelCapture', { key }) });
      else announce('Cette capture a expiré. Recommencez depuis le bouton de l’extension.');
      history.replaceState(null, '', 'library.html');
    }
  } catch (error) {
    showError(error); content.replaceChildren(el('p', { text: 'Impossible de charger la bibliothèque. Aucune donnée n’a été réinitialisée.' }), button('Exporter les données brutes pour récupération', async () => download((await request('rawExport')).raw, 'tabs-vault-recovery.json')));
  }
})();
