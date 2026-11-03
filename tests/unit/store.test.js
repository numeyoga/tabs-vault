import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/storage/store.js';
import { emptyVault } from '../../src/domain/vault.js';
function adapter() {
  let value;
  return {
    read: async () => structuredClone(value),
    write: async (next) => {
      value = structuredClone(next);
    },
  };
}
describe('Écritures sérialisées et persistance', () => {
  it('F-01 — deux captures simultanées ne perdent aucun lien', async () => {
    const store = createStore(adapter());
    await Promise.all(
      ['a', 'b'].map((part) => store.command('save', { url: `https://example.test/${part}` })),
    );
    expect((await store.read()).links).toHaveLength(2);
  });
  it('refuse une révision obsolète et conserve le premier résultat', async () => {
    const store = createStore(adapter());
    await store.command('save', { url: 'https://example.test/a' }, 0);
    await expect(store.command('save', { url: 'https://example.test/b' }, 0)).rejects.toMatchObject(
      { code: 'REVISION_CONFLICT' },
    );
    expect((await store.read()).links).toHaveLength(1);
  });
  it('B-10 — quota dépassé ne confirme pas l’écriture et ne bloque pas les commandes suivantes', async () => {
    const storage = adapter(),
      store = createStore(storage);
    const write = storage.write;
    storage.write = async () => {
      throw new Error('QUOTA_BYTES exceeded');
    };
    await expect(store.command('save', { url: 'https://example.test/a' })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(await store.read()).toEqual(emptyVault());
    storage.write = write;
    await store.command('save', { url: 'https://example.test/b' });
    expect((await store.read()).links[0].url).toBe('https://example.test/b');
  });
  it('ne remplace pas des données corrompues ou futures par une bibliothèque vide', async () => {
    const storage = adapter();
    await storage.write({ schemaVersion: 99 });
    const store = createStore(storage);
    await expect(store.read()).rejects.toMatchObject({ code: 'IMPORT_VERSION_UNSUPPORTED' });
    await expect(store.command('save', { url: 'https://example.test/a' })).rejects.toThrow();
    expect(await storage.read()).toEqual({ schemaVersion: 99 });
  });
});
