import { emptyVault, validateVault, applyCommand, VaultError } from '../domain/vault.js';

export function createStore(adapter) {
  let queue = Promise.resolve();
  async function read() {
    const value = await adapter.read();
    return value === undefined ? emptyVault() : validateVault(value);
  }
  function command(type, payload, expectedRevision) {
    const task = queue.then(async () => {
      const current = await read();
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new VaultError(
          'REVISION_CONFLICT',
          'La bibliothèque a changé. Rechargez puis recommencez.',
        );
      }
      const next = applyCommand(current, type, payload);
      try {
        await adapter.write(next.vault);
      } catch (error) {
        if (/quota/i.test(error.message)) {
          throw new VaultError(
            'QUOTA_EXCEEDED',
            'Stockage plein. Exportez vos liens ou videz la corbeille.',
          );
        }
        throw new VaultError(
          'STORAGE_FAILED',
          'Écriture impossible. Les changements ne sont pas confirmés.',
        );
      }
      return next;
    });
    queue = task.catch(() => {});
    return task;
  }
  return { read, command };
}
