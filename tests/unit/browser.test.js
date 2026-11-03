import { describe, it, expect, vi } from 'vitest';
import { openLinks, capture } from '../../src/browser/actions.js';
const links = [
  { id: 'a', url: 'https://example.test/a' },
  { id: 'b', url: 'https://example.test/b' },
];
function browser({ groups = true, failSecond = false, failGroup = false } = {}) {
  let count = 0;
  return {
    tabs: {
      create: vi.fn(async (options) => {
        if (++count === 2 && failSecond) {
          throw Error('closed');
        }
        return { ...options, id: count };
      }),
      remove: vi.fn(async () => {}),
      ...(groups
        ? {
            group: vi.fn(async () => {
              if (failGroup) {
                throw Error('unavailable');
              }
              return 8;
            }),
          }
        : {}),
    },
    ...(groups
      ? { tabGroups: { query: vi.fn(async () => []), update: vi.fn(async () => {}) } }
      : {}),
    windows: { create: vi.fn(async () => ({ id: 20, tabs: [{ id: 999 }] })) },
  };
}
describe('B-06 / F-10 — réouverture native', () => {
  it('ouvre dans la fenêtre courante, dans l’ordre et avec le nom sauvegardé', async () => {
    const api = browser();
    const report = await openLinks(api, links, { name: 'Voyage', windowId: 7 });
    expect(api.tabs.create.mock.calls.map(([p]) => [p.url, p.windowId])).toEqual(
      links.map((l) => [l.url, 7]),
    );
    expect(api.tabGroups.update).toHaveBeenCalledWith(8, { title: 'Voyage' });
    expect(report.grouped).toBe(true);
  });
  it('utilise une nouvelle fenêtre sans groupes natifs', async () => {
    const api = browser({ groups: false });
    const report = await openLinks(api, links, { windowId: 7 });
    expect(api.windows.create).toHaveBeenCalledOnce();
    expect(api.tabs.create.mock.calls.every(([p]) => p.windowId === 20)).toBe(true);
    expect(report.fallback).toBe(true);
    expect(api.tabs.remove).toHaveBeenCalledWith(999);
  });
  it('ne duplique pas les onglets après un échec de regroupement', async () => {
    const api = browser({ failGroup: true });
    const report = await openLinks(api, links, { windowId: 7 });
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
    expect(report.warning).toContain('regroupement');
    expect(report.successes).toHaveLength(2);
  });
  it('retourne les IDs échoués séparément et conserve la progression en session', async () => {
    const api = browser({ failSecond: true }),
      session = { set: vi.fn(async () => {}) };
    const report = await openLinks(api, links, { windowId: 7 }, session);
    expect(report.failures).toEqual(['b']);
    expect(report.successes.map((s) => s.id)).toEqual(['a']);
    expect(session.set).toHaveBeenLastCalledWith({ lastOpening: report });
  });
  it('refuse plus de 20 liens sans confirmation avant toute ouverture', async () => {
    const api = browser();
    await expect(
      openLinks(
        api,
        Array.from({ length: 21 }, () => links[0]),
        {},
      ),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('ne visite pas une URL dangereuse', async () => {
    const api = browser();
    await expect(openLinks(api, [{ id: 'a', url: 'javascript:alert(1)' }])).rejects.toMatchObject({
      code: 'UNSUPPORTED_URL',
    });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('signale explicitement la capture native indisponible', async () => {
    const api = { tabs: { query: vi.fn(async () => [{ id: 1, groupId: 2, index: 0 }]) } };
    await expect(capture(api, 'group', { groupId: 2, windowId: 7 })).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
    });
  });
});
