import { tagKey } from '../domain/vault.js';

let activePanel;
// Native auto popovers supply outside-click/Escape dismissal without trapping focus.
function panelFor(anchor, label) {
  activePanel?.hidePopover();
  const panel = document.createElement('section');
  panel.className = 'organizer';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', label);
  const id = crypto.randomUUID();
  panel.id = id;
  anchor.setAttribute('aria-controls', id);
  anchor.setAttribute('aria-expanded', 'true');
  document.body.append(panel);
  let closed = false;
  const initialRect = anchor.getBoundingClientRect();
  const position = () => {
    const replacement = [...document.querySelectorAll('[data-organizer-link]')].find(
      (b) =>
        b.dataset.organizerLink === anchor.dataset.organizerLink &&
        b.dataset.organizerKind === anchor.dataset.organizerKind,
    );
    const trigger = anchor.isConnected ? anchor : replacement;
    const rect = trigger?.getBoundingClientRect() ?? initialRect;
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 8))}px`;
  };
  const resize = new ResizeObserver(position);

  panel.addEventListener('toggle', (event) => {
    if (event.newState === 'closed') {
      closed = true;
      resize.disconnect();
      window.removeEventListener('resize', position);
      const replacement = [...document.querySelectorAll('[data-organizer-link]')].find(
        (b) =>
          b.dataset.organizerLink === anchor.dataset.organizerLink &&
          b.dataset.organizerKind === anchor.dataset.organizerKind,
      );
      const trigger = anchor.isConnected ? anchor : replacement;
      trigger?.setAttribute('aria-expanded', 'false');
      if (document.activeElement === document.body || panel.contains(document.activeElement)) {
        trigger?.focus();
      }
      panel.remove();
      if (activePanel === panel) {
        activePanel = null;
      }
    }
  });
  const show = () => {
    panel.showPopover();
    activePanel = panel;
    position();
    resize.observe(panel);
    window.addEventListener('resize', position);
  };
  return { panel, show, isClosed: () => closed };
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) {
    element.textContent = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
}
export function showAllTags(anchor, tags, kind = 'tag') {
  const label = kind === 'tag' ? 'Tous les tags' : 'Tous les groupes';
  const { panel, show } = panelFor(anchor, label);
  panel.append(node('h3', label));
  const list = node('div', '', 'tag-pills');
  tags.forEach((t) =>
    list.append(node('span', t.name, kind === 'tag' ? 'tag-pill' : 'group-pill')),
  );
  panel.append(list);
  show();
  panel.tabIndex = -1;
  panel.focus();
}
export function showOrganizer(
  anchor,
  linkId,
  { getVault, command, refresh },
  preferredKind = 'tag',
) {
  const { panel, show, isClosed } = panelFor(anchor, 'Tags et groupes');
  const title = node('h3', 'Organiser ce lien');
  const input = node('input');
  input.type = 'search';
  input.placeholder = 'Rechercher un tag ou un groupe…';
  input.setAttribute('aria-label', 'Rechercher un tag ou un groupe');
  const choices = node('div', '', 'organizer-choices');
  const feedback = node('p');
  feedback.setAttribute('role', 'alert');
  const hint = node('p', 'Cochez pour ajouter, décochez pour retirer.', 'organizer-hint');
  panel.append(title, input, hint, choices, feedback);
  let saving = false;
  async function change(payload, key) {
    if (saving) {
      return;
    }
    saving = true;
    input.disabled = true;
    feedback.textContent = '';
    panel.setAttribute('aria-busy', 'true');
    draw();
    try {
      await command({ id: linkId, ...payload });
      if (!payload.associationId) {
        input.value = '';
      }
    } catch (error) {
      feedback.textContent = error.message;
      if (error.code === 'REVISION_CONFLICT') {
        await refresh().catch(() => {});
      }
    } finally {
      saving = false;
      input.disabled = false;
      panel.removeAttribute('aria-busy');
      if (!isClosed()) {
        draw();
        const target = [...choices.querySelectorAll('button')].find((b) => b.dataset.key === key);
        (target ?? input).focus();
      }
    }
  }
  function draw() {
    const currentTrigger = [...document.querySelectorAll('[data-organizer-link]')].find(
      (b) => b.dataset.organizerLink === linkId && b.dataset.organizerKind === preferredKind,
    );
    currentTrigger?.setAttribute('aria-expanded', 'true');
    currentTrigger?.setAttribute('aria-controls', panel.id);
    const vault = getVault(),
      link = vault.links.find((l) => l.id === linkId && !l.deletedAt);
    choices.replaceChildren();
    if (!link) {
      choices.append(node('p', 'Ce lien n’est plus actif.'));
      return;
    }
    const query = input.value.trim().normalize('NFC'),
      lower = query.toLowerCase();
    for (const kind of preferredKind === 'group' ? ['group', 'tag'] : ['tag', 'group']) {
      const collection = kind === 'tag' ? vault.tags : vault.groups;
      const section = node('section');
      section.setAttribute('role', 'region');
      section.setAttribute('aria-label', kind === 'tag' ? 'Tags' : 'Groupes');
      section.append(node('h4', kind === 'tag' ? 'Tags' : 'Groupes'));
      const matches = collection.filter((item) => item.name.toLowerCase().includes(lower));
      for (const item of matches) {
        const assigned =
          kind === 'tag' ? link.tagIds.includes(item.id) : item.linkIds.includes(linkId);
        const option = node('button', '', 'organizer-option');
        option.type = 'button';
        option.disabled = saving;
        option.setAttribute('role', 'checkbox');
        option.setAttribute('aria-checked', String(assigned));
        option.dataset.key = `${kind}:${item.id}`;
        const mark = node('span', assigned ? '✓' : '', 'organizer-check');
        mark.setAttribute('aria-hidden', 'true');
        option.append(mark, node('span', item.name));
        if (kind === 'group' && collection.filter((g) => g.name === item.name).length > 1) {
          option.append(node('small', ` · ${item.linkIds.length} liens · ${item.id.slice(0, 6)}`));
        }
        option.addEventListener('click', () =>
          change({ kind, associationId: item.id, assigned: !assigned }, option.dataset.key),
        );
        section.append(option);
      }
      if (!matches.length) {
        section.append(node('p', 'Aucun résultat.', 'organizer-hint'));
      }
      const exact =
        query &&
        collection.some((item) =>
          kind === 'tag' ? tagKey(item.name) === query.toLowerCase() : item.name === query,
        );
      if (query && !exact) {
        const create = node(
          'button',
          `Créer ${kind === 'tag' ? 'le tag' : 'le groupe'} « ${query} »`,
          'organizer-create',
        );
        create.type = 'button';
        create.disabled = saving;
        create.dataset.key = `create:${kind}`;
        create.addEventListener('click', () =>
          change({ kind, name: query, assigned: true }, create.dataset.key),
        );
        section.append(create);
      }
      choices.append(section);
    }
  }
  input.addEventListener('input', draw);
  draw();
  show();
  input.focus();
}
