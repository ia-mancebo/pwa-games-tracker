import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = /** @type {Crypto} */ (webcrypto);
}

// Reset IndexedDB between test files to isolate state.
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
