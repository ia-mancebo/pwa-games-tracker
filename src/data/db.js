/**
 * Wrapper mínimo de IndexedDB (spec §5.1): stores `state` (clave 'doc' →
 * documento completo) y `meta` (clave 'app'). Toda escritura es atómica por
 * transacción; `strict` pide durabilidad estricta y hace commit explícito.
 */

const DB_NAME = 'game-tracker';
const DB_VERSION = 3;
const STATE_KEY = 'doc';
const META_KEY = 'app';
const HANDLE_KEY = 'file';

/** @typedef {{ dirty: boolean, updatedAt: string|null, lastSavedFileHash: string|null, connectedFileName: string|null, exportFileName?: string, persistAsked?: boolean }} Meta */

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
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener('upgradeneeded', () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // Instantánea de Novedades (ticket 23, spec §7.2); clave 'snapshot'.
      if (!db.objectStoreNames.contains('novedades')) db.createObjectStore('novedades');
      // Handle FSA del enlace de archivo; clave 'file' (ticket 18/autoguardado).
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
    });
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error ?? new Error('No se pudo abrir IDB')));
  });
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error ?? new Error('IDB error')));
  });
}

/**
 * @returns {Promise<import('./db.js').Meta|null>}
 */
export async function getMeta() {
  const db = await openDb();
  try {
    const tx = db.transaction('meta', 'readonly');
    const value = await asPromise(tx.objectStore('meta').get(META_KEY));
    return /** @type {Meta|null} */ (value) ?? null;
  } finally {
    db.close();
  }
}

/**
 * @returns {Promise<import('../domain/schema.js').Doc|null>}
 */
export async function getState() {
  const db = await openDb();
  try {
    const tx = db.transaction('state', 'readonly');
    const value = await asPromise(tx.objectStore('state').get(STATE_KEY));
    return /** @type {import('../domain/schema.js').Doc|null} */ (value) ?? null;
  } finally {
    db.close();
  }
}

/**
 * Reemplaza el documento atómicamente.
 * @param {import('../domain/schema.js').Doc} doc
 * @param {{ strict?: boolean }} [options]
 */
export async function putState(doc, { strict = false } = {}) {
  const db = await openDb();
  try {
    const tx = db.transaction('state', 'readwrite', {
      durability: strict ? 'strict' : 'relaxed',
    });
    tx.objectStore('state').put(doc, STATE_KEY);
    if (strict) tx.commit();
    await done(tx);
  } finally {
    db.close();
  }
}

/**
 * Reemplaza la meta atómicamente.
 * @param {Meta} meta
 * @param {{ strict?: boolean }} [options]
 */
export async function putMeta(meta, { strict = false } = {}) {
  const db = await openDb();
  try {
    const tx = db.transaction('meta', 'readwrite', {
      durability: strict ? 'strict' : 'relaxed',
    });
    tx.objectStore('meta').put(meta, META_KEY);
    if (strict) tx.commit();
    await done(tx);
  } finally {
    db.close();
  }
}

/**
 * Escritura atómica de doc+meta en UNA transacción: o queda todo o nada.
 * `strict` (import, vuelco verificado) pide durabilidad estricta; el uso
 * normal muta en modo relaxed (spec §5.1).
 * @param {import('../domain/schema.js').Doc} doc
 * @param {Meta} meta
 * @param {{ strict?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function putStateAndMeta(doc, meta, { strict = true } = {}) {
  const db = await openDb();
  try {
    const tx = db.transaction(['state', 'meta'], 'readwrite', {
      durability: strict ? 'strict' : 'relaxed',
    });
    tx.objectStore('state').put(doc, STATE_KEY);
    tx.objectStore('meta').put(meta, META_KEY);
    if (strict) tx.commit();
    await done(tx);
  } finally {
    db.close();
  }
}

/** Registro del enlace de archivo persistido. @typedef {{ name: string|null, handle: any }} HandleRecord */

/**
 * Lee el handle FSA guardado entre sesiones (clave 'file'); null si no hay.
 * @returns {Promise<HandleRecord|null>}
 */
export async function getHandleRecord() {
  const db = await openDb();
  try {
    const tx = db.transaction('handles', 'readonly');
    const value = await asPromise(tx.objectStore('handles').get(HANDLE_KEY));
    return /** @type {HandleRecord|null} */ (value) ?? null;
  } finally {
    db.close();
  }
}

/**
 * Guarda el handle FSA y el nombre del archivo para reconectar sin picker.
 * @param {any} handle FileSystemFileHandle; structured-cloneable en Chrome.
 * @param {string|null} name
 * @returns {Promise<void>}
 */
export async function putHandleRecord(handle, name) {
  const db = await openDb();
  try {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put({ name, handle }, HANDLE_KEY);
    await done(tx);
  } finally {
    db.close();
  }
}

/** Borra el handle guardado (p. ej., al resetear la sesión de enlace). */
export async function clearHandleRecord() {
  const db = await openDb();
  try {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(HANDLE_KEY);
    await done(tx);
  } finally {
    db.close();
  }
}
