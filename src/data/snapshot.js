/**
 * Instantánea del tablón Novedades en su propio store IDB (ticket 23, spec
 * §7.2): una sola clave 'snapshot' reemplazada atómicamente con durabilidad
 * estricta en cada refresco exitoso. El tablón SIEMPRE se pinta desde aquí.
 */
import { openDb } from './db.js';

const STORE = 'novedades';
const KEY = 'snapshot';

/**
 * Instantánea persistida: la forma del Worker (worker/CONTRACT.md) más el
 * sello local de guardado que alimenta «Actualizado: …» y la política 12 h/7 días.
 * @typedef {{
 *   recientes: import('../services/igdb.js').IgdbGame[],
 *   proximos: import('../services/igdb.js').IgdbGame[],
 *   populares: import('../services/igdb.js').IgdbGame[],
 *   esperados: import('../services/igdb.js').IgdbGame[],
 *   generatedAt?: string,
 *   savedAt: string,
 * }} SavedSnapshot
 */

/**
 * Instantánea tal como llega del Worker, sin sello local aún.
 * @typedef {import('../services/igdb.js').NovedadesSnapshot} SnapshotInput
 */

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error ?? new Error('IDB error')));
    tx.addEventListener('abort', () => reject(tx.error ?? new Error('IDB abort')));
  });
}

/**
 * Reemplaza la instantánea completa (escritura atómica strict).
 * @param {SnapshotInput} data instantánea SIN savedAt
 * @returns {Promise<SavedSnapshot>} lo guardado
 */
export async function saveSnapshot(data) {
  const record = /** @type {SavedSnapshot} */ ({
    recientes: data.recientes ?? [],
    proximos: data.proximos ?? [],
    populares: data.populares ?? [],
    esperados: data.esperados ?? [],
    ...(data.generatedAt != null ? { generatedAt: data.generatedAt } : {}),
    savedAt: new Date().toISOString(),
  });
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' });
    tx.objectStore(STORE).put(record, KEY);
    tx.commit();
    await done(tx);
  } finally {
    db.close();
  }
  return record;
}

/**
 * @returns {Promise<SavedSnapshot|null>}
 */
export async function getSnapshot() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const value = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE).get(KEY);
      req.addEventListener('success', () => resolve(req.result));
      req.addEventListener('error', () => reject(req.error ?? new Error('IDB error')));
    });
    return /** @type {SavedSnapshot|null} */ (value) ?? null;
  } finally {
    db.close();
  }
}

/**
 * Borra la instantánea (p. ej. limpieza manual de datos).
 * @returns {Promise<void>}
 */
export async function clearSnapshot() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    await done(tx);
  } finally {
    db.close();
  }
}
