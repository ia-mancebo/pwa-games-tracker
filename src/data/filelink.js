/**
 * Orquestación archivo ↔ espejo (ticket 18, spec §5.3–§5.5): conexión del
 * .json, vuelco verificado con pre-chequeo de hash, autoguardado con debounce
 * de 15 s, recarga al recuperar foco y conflicto real a tres opciones.
 */
import { store } from '../app.js';
import { debounce } from '../lib/debounce.js';
import { importDoc, markSaved } from './library.js';
import { validateDoc } from '../domain/validate.js';
import { getHandle, hasFsa, pickJsonText, setHandle } from '../services/fsa.js';
import { sha256Hex } from '../services/hash.js';

/**
 * Handle FSA con escritura y permisos; tipado estructural para que los tests
 * lo simulen con objetos planos.
 * @typedef {{
 *   getFile(): Promise<File>,
 *   createWritable(): Promise<{ write(data: string): Promise<void>, close(): Promise<void> }>,
 *   requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>,
 *   name?: string,
 * }} WritableFileHandle
 */

/**
 * Resultado uniforme de las operaciones de enlace.
 * @typedef {{
 *   status:
 *     | 'saved' | 'skipped' | 'busy'
 *     | 'connected' | 'imported' | 'cancelled' | 'denied' | 'error'
 *     | 'conflict' | 'resolved' | 'downloaded' | 'none' | 'same' | 'reloaded',
 *   fileDoc?: import('../domain/schema.js').Doc,
 *   choice?: 'file' | 'local',
 *   name?: string | null,
 *   hash?: string,
 *   error?: string,
 * }} LinkResult
 */

/**
 * Conflicto real pendiente de resolver (spec §5.5).
 * @typedef {{
 *   fileText: string,
 *   fileHash: string,
 *   fileDoc: import('../domain/schema.js').Doc,
 * }} ConflictInfo
 */

const AUTOSAVE_MS = 15000;

/** Puente hacia la UI: quien pinta el diálogo de conflicto. @type {(info: ConflictInfo) => void} */
let conflictHandler = () => {};

/** @type {ConflictInfo | null} */
let pendingConflict = null;

let saving = false;
let scheduled = false;
let started = false;

/** Desuscripción del store mientras corre el autoguardado. @type {(() => boolean) | null} */
let unsubscribe = null;

const debouncedSave = debounce(() => runScheduledSave(), AUTOSAVE_MS);

/**
 * Registra quién pinta el diálogo de conflicto (lo llama la UI al montarse).
 * @param {(info: ConflictInfo) => void} fn
 */
export function setConflictHandler(fn) {
  conflictHandler = fn;
}

/**
 * Marca la sesión como conectada tras una elección deliberada ya resuelta
 * (bienvenida/Datos): sin lógica de conflicto, spec §5.5 última viñeta.
 * @param {string | null} name
 */
export function markConnected(name) {
  store.set({ file: { status: 'connected', name, error: null } });
}

/** @returns {string | null} */
function currentName() {
  const { file, meta } = store.get();
  return file.name ?? meta.connectedFileName;
}

/** @param {WritableFileHandle | null} handle @returns {string | null} */
function handleName(handle) {
  return handle?.name ?? store.get().meta.connectedFileName ?? null;
}

/** @param {string | null} name */
function setConnected(name) {
  store.set({ file: { status: 'connected', name, error: null } });
}

/** @param {unknown} err */
function setFileError(err) {
  store.set({
    file: { status: 'error', name: currentName(), error: errorMessage(err) },
  });
}

/** @param {unknown} err @returns {string} */
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** @param {unknown} err @returns {boolean} */
function isAbortError(err) {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Eleva conflicto real: guarda el pendiente, conecta la sesión y avisa a la UI.
 * @param {string} fileText
 * @param {string} fileHash
 * @returns {LinkResult}
 */
function raiseConflict(fileText, fileHash) {
  const parsed = validateDoc(fileText);
  if (!parsed.ok) return { status: 'error', error: parsed.reason };
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  pendingConflict = { fileText, fileHash, fileDoc: parsed.doc };
  setConnected(handleName(handle));
  conflictHandler(pendingConflict);
  return { status: 'conflict', fileDoc: parsed.doc };
}

/**
 * Elección deliberada de archivo (bienvenida o futuro Datos): picker FSA →
 * leer → hash → importDoc. SIN lógica de conflicto (decisión de spec §5.5).
 * Cancelar (AbortError) es silencioso.
 * @returns {Promise<LinkResult>}
 */
export async function pickAndConnect() {
  if (!hasFsa()) return pickViaInput();
  let picked;
  try {
    picked = await pickJsonText();
  } catch (err) {
    if (isAbortError(err)) return { status: 'cancelled' };
    return { status: 'error', error: errorMessage(err) };
  }
  try {
    const hash = await sha256Hex(picked.text);
    await importDoc(picked.text, { hash, fileName: picked.name });
  } catch (err) {
    // Un candidato inválido no deja handle colgando de sesión.
    setHandle(null);
    return { status: 'error', error: errorMessage(err) };
  }
  setConnected(picked.name);
  return { status: 'connected', name: picked.name };
}

/**
 * Respaldo universal `<input type="file">` cuando no hay FSA. Importa y fija
 * hash base pero NO marca sesión conectada: sin handle no hay vuelco posible.
 * @returns {Promise<LinkResult>}
 */
function pickViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return resolve({ status: 'cancelled' });
        void (async () => {
          try {
            const text = await file.text();
            const hash = await sha256Hex(text);
            await importDoc(text, { hash, fileName: file.name });
            resolve({ status: 'imported', name: file.name });
          } catch (err) {
            resolve({ status: 'error', error: errorMessage(err) });
          }
        })();
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Vuelco al archivo (spec §5.4): serializa el doc, pre-chequea el hash del
 * archivo y escribe de forma atómica; solo tras el éxito marca `markSaved`.
 * Un fallo deja la sesión en error y el espejo sigue dirty (la app funciona).
 * @param {{ force?: boolean }} [options] `force` salta el pre-chequeo (resolver
 *   conflicto manteniendo locales).
 * @returns {Promise<LinkResult>}
 */
export async function saveNow({ force = false } = {}) {
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  const { doc, meta, file } = store.get();
  if (!handle || !doc || file.status === 'disconnected') return { status: 'skipped' };
  // Con conflicto pendiente solo el vuelco forzado (mantener locales) escribe.
  if (pendingConflict && !force) return { status: 'skipped' };
  if (saving) return { status: 'busy' };
  saving = true;
  try {
    const name = file.name ?? meta.connectedFileName;
    const text = JSON.stringify(doc);
    const hash = await sha256Hex(text);
    if (!force && meta.dirty) {
      let fileText;
      let fileHash;
      try {
        const current = await handle.getFile();
        fileText = await current.text();
        fileHash = await sha256Hex(fileText);
      } catch (err) {
        setFileError(err);
        return { status: 'error', error: errorMessage(err) };
      }
      // El archivo cambió fuera Y hay cambios sin volcar → conflicto, sin escribir.
      if (fileHash !== meta.lastSavedFileHash) {
        return raiseConflict(fileText, fileHash);
      }
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    } catch (err) {
      setFileError(err);
      return { status: 'error', error: errorMessage(err) };
    }
    await markSaved({ hash, now: new Date() });
    setConnected(name);
    return { status: 'saved', hash };
  } finally {
    saving = false;
  }
}

/**
 * Reconexión en un tap (spec §5.3): `requestPermission` sobre el handle de
 * sesión y comparación de hashes contra `meta.lastSavedFileHash`:
 * igual → sesión normal volcando pendientes; distinto + limpio → recarga
 * limpia; distinto + dirty → conflicto real.
 * @returns {Promise<LinkResult>}
 */
export async function reconnect() {
  const session = /** @type {WritableFileHandle | null} */ (getHandle());
  if (!session || !hasFsa()) return pickAndConnect();
  try {
    const permission = await session.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return { status: 'denied' };
  } catch (err) {
    if (isAbortError(err)) return { status: 'cancelled' };
    return { status: 'error', error: errorMessage(err) };
  }
  const { meta } = store.get();
  let fileText;
  let fileHash;
  try {
    const file = await session.getFile();
    fileText = await file.text();
    fileHash = await sha256Hex(fileText);
  } catch (err) {
    if (isAbortError(err)) return { status: 'cancelled' };
    setFileError(err);
    return { status: 'error', error: errorMessage(err) };
  }
  if (fileHash === meta.lastSavedFileHash) {
    setConnected(handleName(session));
    if (meta.dirty) await saveNow();
    return { status: 'connected' };
  }
  if (!meta.dirty) {
    // Recarga limpia: elección implícita del contenido nuevo del archivo.
    try {
      await importDoc(fileText, { hash: fileHash, fileName: handleName(session) });
    } catch (err) {
      setFileError(err);
      return { status: 'error', error: errorMessage(err) };
    }
    return { status: 'connected' };
  }
  return raiseConflict(fileText, fileHash);
}

/**
 * Comprueba si el archivo cambió fuera (al recuperar foco): changed + limpio →
 * recarga limpia; changed + dirty → conflicto real. Igual → nada.
 * @returns {Promise<LinkResult>}
 */
async function checkExternalChange() {
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  const { doc, meta } = store.get();
  if (!handle || !doc || !meta.lastSavedFileHash || pendingConflict) {
    return { status: 'skipped' };
  }
  let fileText;
  let fileHash;
  try {
    const file = await handle.getFile();
    fileText = await file.text();
    fileHash = await sha256Hex(fileText);
  } catch (err) {
    return { status: 'error', error: errorMessage(err) };
  }
  if (fileHash === meta.lastSavedFileHash) return { status: 'same' };
  if (meta.dirty) return raiseConflict(fileText, fileHash);
  try {
    await importDoc(fileText, { hash: fileHash, fileName: handleName(handle) });
  } catch (err) {
    return { status: 'error', error: errorMessage(err) };
  }
  return { status: 'reloaded' };
}

/**
 * Resuelve el conflicto pendiente (spec §5.5). «download» NO resuelve: deja el
 * pendiente para que la persona compare y elija de nuevo.
 * @param {'file' | 'local' | 'download'} choice
 * @returns {Promise<LinkResult>}
 */
export async function resolveConflict(choice) {
  const pending = pendingConflict;
  if (!pending) return { status: 'none' };
  if (choice === 'download') {
    downloadLocalCopy();
    return { status: 'downloaded' };
  }
  if (choice === 'file') {
    try {
      await importDoc(pending.fileText, {
        hash: pending.fileHash,
        fileName: store.get().meta.connectedFileName,
      });
    } catch (err) {
      return { status: 'error', error: errorMessage(err) };
    }
    pendingConflict = null;
    return { status: 'resolved', choice: 'file' };
  }
  const result = await saveNow({ force: true });
  if (result.status === 'saved') {
    pendingConflict = null;
    return { status: 'resolved', choice: 'local' };
  }
  return result;
}

/** Descarga una copia del doc local para comparar (nunca resuelve sola). */
function downloadLocalCopy() {
  const { doc } = store.get();
  if (!doc) return;
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `game-tracker-conflicto-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Vuelco diferido: solo si sigue la sesión conectada y pendiente algo. */
function runScheduledSave() {
  if (!scheduled) return;
  scheduled = false;
  const { meta, file } = store.get();
  if (!meta.dirty || file.status !== 'connected') return;
  void saveNow();
}

/**
 * Agenda el vuelco 15 s después de la ÚLTIMA llamada (debounce, spec §5.4).
 */
export function scheduleAutosave() {
  scheduled = true;
  debouncedSave();
}

function onStoreChange() {
  const { meta, file } = store.get();
  if (meta.dirty && file.status === 'connected') scheduleAutosave();
}

function onVisibilityChange() {
  if (document.visibilityState !== 'hidden') return;
  const { meta, file } = store.get();
  if (meta.dirty && file.status === 'connected') void saveNow();
}

function onFocus() {
  void checkExternalChange();
}

/** Activa autoguardado, chequeo al ocultar la pestaña y chequeo al recuperar foco. */
export function startAutosave() {
  if (started) return;
  started = true;
  unsubscribe = store.subscribe(onStoreChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);
}

/** Desactiva todo lo activado por {@link startAutosave} (aislación en pruebas). */
export function stopAutosave() {
  if (!started) return;
  started = false;
  scheduled = false;
  unsubscribe?.();
  unsubscribe = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('focus', onFocus);
}

/** Limpieza total del módulo entre escenarios de prueba. */
export function resetFilelink() {
  stopAutosave();
  pendingConflict = null;
  saving = false;
  setHandle(null);
}
