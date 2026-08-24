/**
 * Backups rotativos en OPFS (ticket 19, spec §5.6): los últimos 3 vuelcos
 * exitosos quedan como snapshot { savedAt, doc } restaurable desde «Datos».
 * Sin OPFS (feature detection) todo es no-op/vacío.
 */

const DIR_NAME = 'backups';
const MAX_BACKUPS = 3;
const NAME_RE = /^backup-(\d+)\.json$/;

/** @typedef {{ name: string, savedAt: string }} BackupInfo */

/** @returns {boolean} */
function available() {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/** @returns {Promise<FileSystemDirectoryHandle>} */
async function dir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

/** El polyfill de pruebas produce strings; OPFS real produce handles. @param {unknown} entry @returns {string} */
function entryName(entry) {
  if (typeof entry === 'string') return entry;
  const name = /** @type {{ name?: unknown }} */ (entry)?.name;
  return typeof name === 'string' ? name : '';
}

/**
 * Snapshots existentes ordenados por número creciente (= orden de creación).
 * @param {FileSystemDirectoryHandle} d
 * @returns {Promise<{ name: string, n: number, savedAt: string }[]>}
 */
async function scan(d) {
  const iter = /** @type {AsyncIterableIterator<unknown>} */ (/** @type {any} */ (d).values());
  const found = /** @type {{ name: string, n: number, savedAt: string }[]} */ ([]);
  for await (const entry of iter) {
    const name = entryName(entry);
    const m = NAME_RE.exec(name);
    if (!m) continue;
    let savedAt = '';
    try {
      const fh = await d.getFileHandle(name);
      const parsed = JSON.parse(await (await fh.getFile()).text());
      if (parsed && typeof parsed.savedAt === 'string' && !Number.isNaN(Date.parse(parsed.savedAt))) {
        savedAt = parsed.savedAt;
      }
    } catch {
      // Copia corrupta: se lista sin fecha y el podado la eliminará a su tiempo.
    }
    found.push({ name, n: Number(m[1]), savedAt });
  }
  found.sort((a, b) => a.n - b.n);
  return found;
}

/**
 * Snapshot fire-and-forget del doc tras un vuelco exitoso. NUNCA lanza ni
 * bloquea al llamador; rota hasta dejar exactamente MAX_BACKUPS ficheros.
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {Promise<void>}
 */
export async function snapshotBackup(doc) {
  if (!available()) return;
  try {
    const d = await dir();
    const existing = await scan(d);
    const next = existing.length > 0 ? Math.max(...existing.map((b) => b.n)) + 1 : 1;
    const payload = JSON.stringify({ savedAt: new Date().toISOString(), doc });
    const fh = await d.getFileHandle(`backup-${next}.json`, { create: true });
    const writable = await fh.createWritable();
    await writable.write(payload);
    await writable.close();
    const total = existing.length + 1;
    for (const old of (await scan(d)).slice(0, Math.max(0, total - MAX_BACKUPS))) {
      try {
        await d.removeEntry(old.name);
      } catch {
        // Ya gone: la rotación sigue.
      }
    }
  } catch {
    // Un backup fallido nunca rompe el flujo de guardado.
  }
}

/**
 * Lista las copias válidas, más reciente primero.
 * @returns {Promise<BackupInfo[]>}
 */
export async function listBackups() {
  if (!available()) return [];
  try {
    const entries = await scan(await dir());
    return entries
      .filter((e) => e.savedAt !== '')
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.n - a.n)
      .map((e) => ({ name: e.name, savedAt: e.savedAt }));
  } catch {
    return [];
  }
}

/**
 * Lee una copia por nombre (solo nombres propios del set rotativo).
 * @param {string} name
 * @returns {Promise<{ savedAt: string, doc: import('../domain/schema.js').Doc } | null>}
 */
export async function readBackup(name) {
  if (!available() || !NAME_RE.test(name)) return null;
  const fh = await (await dir()).getFileHandle(name);
  const parsed = JSON.parse(await (await fh.getFile()).text());
  if (!parsed || typeof parsed.savedAt !== 'string' || typeof parsed.doc !== 'object' || parsed.doc === null) {
    throw new Error('La copia de seguridad está dañada.');
  }
  return { savedAt: parsed.savedAt, doc: /** @type {import('../domain/schema.js').Doc} */ (parsed.doc) };
}
