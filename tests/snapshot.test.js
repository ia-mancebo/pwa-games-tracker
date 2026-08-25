import { describe, expect, it } from 'vitest';
import { clearSnapshot, getSnapshot, saveSnapshot } from '../src/data/snapshot.js';
import { getState } from '../src/data/db.js';

/** @type {import('../src/services/igdb.js').IgdbGame} */
const GAME = {
  igdbId: 246938,
  title: 'Hollow Knight: Silksong',
  releaseDate: '2025-09-04',
  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3x0b.jpg',
  description: 'Hornet protagoniza una nueva expedición.',
  genres: [{ id: 8, name: 'Platform' }],
  platforms: [{ id: 130, name: 'Nintendo Switch' }],
};

/** @returns {import('../src/data/snapshot.js').SnapshotInput} */
function snapshotData() {
  return {
    recientes: [GAME],
    proximos: [],
    populares: [],
    esperados: [],
    generatedAt: '2026-08-24T09:30:00.000Z',
  };
}

/**
 * Crea la base en versión 1 (solo stores state/meta) con un documento viejo,
 * como dejaría una instalación anterior al ticket 23.
 */
async function createV1WithDoc() {
  const doc = {
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-01T10:00:00Z',
    games: [],
  };
  const db = await new Promise(
    /**
     * @param {(value: IDBDatabase) => void} resolve
     * @param {(reason?: Error) => void} reject
     */
    (resolve, reject) => {
      const req = indexedDB.open('game-tracker', 1);
      req.addEventListener('upgradeneeded', () => {
        req.result.createObjectStore('state');
        req.result.createObjectStore('meta');
      });
      req.addEventListener('success', () => resolve(req.result));
      req.addEventListener('error', () => reject(req.error ?? new Error('IDB error')));
    }
  );
  const tx = db.transaction(['state', 'meta'], 'readwrite');
  tx.objectStore('state').put(doc, 'doc');
  tx.objectStore('meta').put({ dirty: false, updatedAt: doc.updatedAt }, 'app');
  await new Promise((resolve, reject) => {
    tx.addEventListener('complete', resolve);
    tx.addEventListener('error', () => reject(tx.error));
  });
  db.close();
  return doc;
}

describe('saveSnapshot/getSnapshot', () => {
  it('guarda la instantánea y la lee intacta añadiendo savedAt ISO', async () => {
    await saveSnapshot(snapshotData());
    const snap = await getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.recientes).toEqual([GAME]);
    expect(snap?.proximos).toEqual([]);
    expect(snap?.populares).toEqual([]);
    expect(snap?.esperados).toEqual([]);
    expect(snap?.generatedAt).toBe('2026-08-24T09:30:00.000Z');
    expect(typeof snap?.savedAt).toBe('string');
    expect(Number.isNaN(Date.parse(/** @type {string} */ (snap?.savedAt)))).toBe(false);
  });

  it('una segunda escritura reemplaza la instantánea completa', async () => {
    await saveSnapshot(snapshotData());
    const second = {
      ...snapshotData(),
      recientes: [{ ...GAME, igdbId: 1020, title: 'Elden Ring' }],
    };
    await saveSnapshot(second);
    const snap = await getSnapshot();
    expect(snap?.recientes).toHaveLength(1);
    expect(snap?.recientes[0]?.title).toBe('Elden Ring');
  });

  it('sin instantánea devuelve null', async () => {
    expect(await getSnapshot()).toBeNull();
  });
});

describe('clearSnapshot', () => {
  it('borra la instantánea guardada', async () => {
    await saveSnapshot(snapshotData());
    await clearSnapshot();
    expect(await getSnapshot()).toBeNull();
  });

  it('es tolerante si no hay nada guardado', async () => {
    await expect(clearSnapshot()).resolves.toBeUndefined();
  });
});

describe('upgrade v1 → v2', () => {
  it('añade el store novedades sin tocar el espejo existente', async () => {
    const oldDoc = await createV1WithDoc();

    await saveSnapshot(snapshotData());

    const snap = await getSnapshot();
    expect(snap?.recientes).toHaveLength(1);
    expect(await getState()).toEqual(oldDoc);
  });
});
