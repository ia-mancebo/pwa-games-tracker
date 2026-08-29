/**
 * Orquestación archivo ↔ espejo (ticket 18, spec §5.3–§5.5): conexión del
 * .json, vuelco verificado con pre-chequeo de hash, autoguardado con debounce
 * de 15 s, recarga al recuperar foco y conflicto real a tres opciones.
 *
 * El conflicto pendiente vive en el slice `file` del estado (ADR-0004):
 * elevarlo escribe el slice completo y avisa al handler registrado en el
 * arranque; la regla documentada es que los guards existentes (no volcar y no
 * chequear externo mientras hay conflicto) son lo que mantiene vivo ese
 * campo — ninguna otra ruta escribe el slice durante un conflicto.
 */
import { store } from '../app.js';
import { debounce } from '../lib/debounce.js';
import { downloadTextBlob } from '../lib/download.js';
import { formatError, isAbortError } from '../lib/errors.js';
import { importDoc, markSaved } from './library.js';
import { validateDoc } from '../domain/validate.js';
import {
  getHandle,
  hasFsa,
  JSON_ACCEPT,
  pickJsonText,
  permissionState,
  setHandle,
} from '../services/fsa.js';
import { sha256Hex } from '../services/hash.js';
import { snapshotBackup } from './opfs.js';
import { requestPersistOnce } from './persist.js';
import { assertWritable } from './tablock.js';
import {
  clearHandleRecord,
  getHandleRecord,
  putHandleRecord,
} from './db.js';

/**
 * Registro del enlace persistido: {name, handle}.
 * @typedef {{ name: string|null, handle: any }} HandleRecord
 */

/**
 * Almacén del handle FSA entre sesiones (IDB en producción). Seam inyectable:
 * los FileSystemFileHandle reales son structured-cloneable, pero los fakes de
 * prueba llevan métodos y no pueden cruzar IDB; cada escenario monta el suyo.
 * @typedef {{
 *   get(): Promise<HandleRecord|null>,
 *   put(handle: any, name: string|null): Promise<void>,
 *   clear(): Promise<void>,
 * }} HandleStore
 */

/**
 * Almacén por defecto del handle: registros FSA en IDB vía db.js.
 * @returns {HandleStore}
 */
function createDefaultHandleStore() {
  return {
    /** @returns {Promise<HandleRecord|null>} */
    async get() {
      return getHandleRecord();
    },
    /**
     * @param {any} handle
     * @param {string|null} name
     */
    async put(handle, name) {
      await putHandleRecord(handle, name);
    },
    async clear() {
      await clearHandleRecord();
    },
  };
}

/** @type {HandleStore} */
let handleStore = createDefaultHandleStore();

/**
 * Sustituye (o, con null, restablece) el almacén del enlace.
 * @param {HandleStore | null} [next]
 */
export function setHandleStore(next) {
  handleStore = next ?? createDefaultHandleStore();
}

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
 * Conflicto real pendiente, definido en el slice `file` (src/app.js).
 * @typedef {import('../app.js').ConflictInfo} ConflictInfo
 */

/**
 * Resultado de {@link decideLink}.
 * @typedef {{
 *   kind: 'same',
 * } | {
 *   kind: 'reload' | 'conflict',
 *   text: string,
 *   hash: string,
 * }} LinkDecision
 */

/**
 * Decisión de tres vías del enlace (spec §5.5): hash del archivo contra
 * `meta.lastSavedFileHash` — igual; distinto + espejo limpio → recarga (manda
 * el archivo); distinto + dirty → conflicto real. Pura: sin I/O, sin store ni
 * handle; cada flujo conserva su lectura, su manejo de errores y su mapeo a
 * resultados del enlace.
 * @param {string} fileText
 * @param {string} fileHash
 * @param {Pick<import('../app.js').Meta, 'dirty' | 'lastSavedFileHash'>} meta
 * @returns {LinkDecision}
 */
export function decideLink(fileText, fileHash, meta) {
  if (fileHash === meta.lastSavedFileHash) return { kind: 'same' };
  if (meta.dirty) return { kind: 'conflict', text: fileText, hash: fileHash };
  return { kind: 'reload', text: fileText, hash: fileHash };
}

const AUTOSAVE_MS = 15000;

/** Puente hacia la UI: quien pinta el diálogo de conflicto. @type {(info: ConflictInfo) => void} */
let conflictHandler = () => {};

let saving = false;
let scheduled = false;
let started = false;

/** Desuscripción del store mientras corre el autoguardado. @type {(() => boolean) | null} */
let unsubscribe = null;

const debouncedSave = debounce(() => runScheduledSave(), AUTOSAVE_MS);

/**
 * Registra quién pinta el diálogo de conflicto (lo llama el arranque de la
 * app; la pastilla de archivo NO registra nada al importarse — ticket 03).
 * @param {(info: ConflictInfo) => void} fn
 */
export function setConflictHandler(fn) {
  conflictHandler = fn;
}

/**
 * Conflicto pendiente leído del estado: «¿hay conflicto pendiente?» tiene
 * respuesta observable (ADR-0004).
 * @returns {ConflictInfo | null}
 */
function pendingConflict() {
  return store.get().file.conflict ?? null;
}

/** Limpia el conflicto pendiente del slice `file` (resuelto o reset). */
function clearPendingConflict() {
  store.set({ file: { ...store.get().file, conflict: null } });
}

/**
 * Marca la sesión como conectada tras una elección deliberada ya resuelta
 * (bienvenida/Datos): sin lógica de conflicto, spec §5.5 última viñeta.
 * @param {string | null} name
 */
export function markConnected(name) {
  store.set({ file: { ...store.get().file, status: 'connected', name, error: null } });
  // La conexión fue deliberada: guarda el handle para reconectar sin picker
  // en la próxima sesión y que el autoguardado retome solo. Se espera a IDB
  // dentro: lectores inmediatos (pruebas, arranque) asumen registro escrito.
  /** @returns {Promise<void>} */
  const persist = async () => {
    const handle = getHandle();
    if (!name || !handle) return;
    try {
      await handleStore.put(handle, name);
    } catch {
      // Sin registro la próxima sesión pedirá el archivo a mano; nada rompe.
    }
  };
  return persist();
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
  store.set({ file: { ...store.get().file, status: 'connected', name, error: null } });
}

/** @param {unknown} err */
function setFileError(err) {
  store.set({
    file: { ...store.get().file, status: 'error', name: currentName(), error: formatError(err) },
  });
}

/**
 * Eleva conflicto real: escribe el slice completo del enlace (estado
 * conectado + conflicto pendiente observable) y avisa al handler registrado.
 * @param {string} fileText
 * @param {string} fileHash
 * @returns {LinkResult}
 */
function raiseConflict(fileText, fileHash) {
  const parsed = validateDoc(fileText);
  if (!parsed.ok) return { status: 'error', error: parsed.reason };
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  const conflict = /** @type {ConflictInfo} */ ({ fileText, fileHash, fileDoc: parsed.doc });
  store.set({
    file: {
      ...store.get().file,
      status: 'connected',
      name: handleName(handle),
      error: null,
      conflict,
    },
  });
  conflictHandler(conflict);
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
    return { status: 'error', error: formatError(err) };
  }
  try {
    const hash = await sha256Hex(picked.text);
    await importDoc(picked.text, { hash, fileName: picked.name });
  } catch (err) {
    // Un candidato inválido no deja handle colgando de sesión.
    setHandle(null);
    return { status: 'error', error: formatError(err) };
  }
  setConnected(picked.name);
  const handle = getHandle();
  if (handle) {
    try {
      await handleStore.put(handle, picked.name);
    } catch {
      // Sin registro la próxima sesión pedirá el archivo a mano.
    }
  }
  return { status: 'connected', name: picked.name };
}

/**
 * Reconexión silenciosa al arrancar (autoguardado sin fricción): recupera el
 * handle guardado en IDB y, si el permiso sigue vigente SIN gesto, compara
 * hashes igual que {@link reconnect}. Con permiso caducado devuelve
 * 'needs-gesture' para que la UI ofrezca el botón de reconectar. Cualquier
 * fallo de lectura queda como error de sesión; nunca tumba el arranque.
 * @returns {Promise<'connected'|'needs-gesture'|'none'>}
 */
export async function restoreSavedLink() {
  if (!hasFsa() || !store.get().doc) return 'none';
  let record;
  try {
    record = await handleStore.get();
  } catch {
    return 'none';
  }
  if (!record?.handle) {
    await handleStore.clear().catch(() => {});
    return 'none';
  }
  const { meta } = store.get();
  const name = record.name ?? meta.connectedFileName ?? null;
  setHandle(/** @type {WritableFileHandle} */ (record.handle));
  const permission = await permissionState(record.handle);
  if (permission !== 'granted') return 'needs-gesture';
  let fileText;
  let fileHash;
  try {
    const file = await /** @type {WritableFileHandle} */ (record.handle).getFile();
    fileText = await file.text();
    fileHash = await sha256Hex(fileText);
  } catch (err) {
    setFileError(err);
    return 'needs-gesture';
  }
  const decision = decideLink(fileText, fileHash, meta);
  if (decision.kind === 'same') {
    setConnected(name);
    if (meta.dirty) await saveNow();
    return 'connected';
  }
  if (decision.kind === 'reload') {
    try {
      await importDoc(decision.text, { hash: decision.hash, fileName: name });
    } catch (err) {
      setFileError(err);
      return 'needs-gesture';
    }
    setConnected(name);
    return 'connected';
  }
  raiseConflict(decision.text, decision.hash);
  return 'connected';
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
    // Android 11/Chrome: los providers suelen reportar .json como
    // application/octet-stream o text/plain; si solo filtramos por MIME estricto,
    // el picker los deja en gris. La validación real la hace importDoc.
    input.accept = JSON_ACCEPT;
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
            resolve({ status: 'error', error: formatError(err) });
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
  if (!assertWritable()) return { status: 'skipped' };
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  const { doc, meta, file } = store.get();
  if (!handle || !doc || file.status === 'disconnected') return { status: 'skipped' };
  // Con conflicto pendiente solo el vuelco forzado (mantener locales) escribe.
  if (pendingConflict() && !force) return { status: 'skipped' };
  if (saving) return { status: 'busy' };
  saving = true;
  try {
    const name = file.name ?? meta.connectedFileName;
    const text = JSON.stringify(doc);
    const hash = await sha256Hex(text);
    if (!force && meta.lastSavedFileHash != null) {
      // Comprobación de hash justo antes de CADA vuelco (spec §5.5), limpio o no.
      let fileText;
      let fileHash;
      try {
        const current = await handle.getFile();
        fileText = await current.text();
        fileHash = await sha256Hex(fileText);
      } catch (err) {
        setFileError(err);
        return { status: 'error', error: formatError(err) };
      }
      const decision = decideLink(fileText, fileHash, meta);
      if (decision.kind === 'conflict') return raiseConflict(decision.text, decision.hash);
      if (decision.kind === 'reload') {
        // Limpio → manda el archivo.
        try {
          await importDoc(decision.text, { hash: decision.hash, fileName: name });
        } catch (err) {
          setFileError(err);
          return { status: 'error', error: formatError(err) };
        }
        return { status: 'reloaded' };
      }
      // Igual: el vuelco continúa y escribe.
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    } catch (err) {
      setFileError(err);
      return { status: 'error', error: formatError(err) };
    }
    await markSaved({ hash, now: new Date() });
    setConnected(name);
    // Copia rotativa OPFS y petición de persistencia: fire-and-forget (§5.6),
    // nunca bloquean ni rompen el vuelco ya completado.
    void snapshotBackup(/** @type {import('../domain/schema.js').Doc} */ (store.get().doc ?? doc));
    void requestPersistOnce();
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
  if (!assertWritable()) return { status: 'skipped' };
  const session = /** @type {WritableFileHandle | null} */ (getHandle());
  if (!session || !hasFsa()) return pickAndConnect();
  try {
    const permission = await session.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return { status: 'denied' };
  } catch (err) {
    if (isAbortError(err)) return { status: 'cancelled' };
    return { status: 'error', error: formatError(err) };
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
    return { status: 'error', error: formatError(err) };
  }
  const decision = decideLink(fileText, fileHash, meta);
  if (decision.kind === 'same') {
    setConnected(handleName(session));
    if (meta.dirty) await saveNow();
    return { status: 'connected' };
  }
  if (decision.kind === 'reload') {
    // Recarga limpia: elección implícita del contenido nuevo del archivo.
    try {
      await importDoc(decision.text, { hash: decision.hash, fileName: handleName(session) });
    } catch (err) {
      setFileError(err);
      return { status: 'error', error: formatError(err) };
    }
    return { status: 'connected' };
  }
  return raiseConflict(decision.text, decision.hash);
}

/**
 * Comprueba si el archivo cambió fuera (al recuperar foco): changed + limpio →
 * recarga limpia; changed + dirty → conflicto real. Igual → nada.
 * @returns {Promise<LinkResult>}
 */
async function checkExternalChange() {
  const handle = /** @type {WritableFileHandle | null} */ (getHandle());
  const { doc, meta } = store.get();
  if (!handle || !doc || !meta.lastSavedFileHash || pendingConflict()) {
    return { status: 'skipped' };
  }
  let fileText;
  let fileHash;
  try {
    const file = await handle.getFile();
    fileText = await file.text();
    fileHash = await sha256Hex(fileText);
  } catch (err) {
    return { status: 'error', error: formatError(err) };
  }
  const decision = decideLink(fileText, fileHash, meta);
  if (decision.kind === 'same') return { status: 'same' };
  if (decision.kind === 'conflict') return raiseConflict(decision.text, decision.hash);
  try {
    await importDoc(decision.text, { hash: decision.hash, fileName: handleName(handle) });
  } catch (err) {
    return { status: 'error', error: formatError(err) };
  }
  return { status: 'reloaded' };
}

/**
 * Resuelve el conflicto pendiente (spec §5.5). «download» NO resuelve: deja el
 * pendiente en el estado para que la persona compare y elija de nuevo.
 * @param {'file' | 'local' | 'download'} choice
 * @returns {Promise<LinkResult>}
 */
export async function resolveConflict(choice) {
  const pending = pendingConflict();
  if (!pending) return { status: 'none' };
  if (choice === 'download') {
    // Descarga una copia local para comparar (nunca resuelve sola).
    const { doc } = store.get();
    if (doc) {
      downloadTextBlob(
        JSON.stringify(doc),
        `game-tracker-conflicto-${new Date().toISOString().slice(0, 10)}.json`,
      );
    }
    return { status: 'downloaded' };
  }
  if (choice === 'file') {
    try {
      await importDoc(pending.fileText, {
        hash: pending.fileHash,
        fileName: store.get().meta.connectedFileName,
      });
    } catch (err) {
      return { status: 'error', error: formatError(err) };
    }
    clearPendingConflict();
    return { status: 'resolved', choice: 'file' };
  }
  const result = await saveNow({ force: true });
  if (result.status === 'saved') {
    clearPendingConflict();
    return { status: 'resolved', choice: 'local' };
  }
  return result;
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
 * En secundaria no se agenda nada: la pestaña activa es quien vuelca.
 */
export function scheduleAutosave() {
  if (!assertWritable()) return;
  scheduled = true;
  debouncedSave();
}

function onStoreChange() {
  const { meta, file } = store.get();
  if (meta.dirty && file.status === 'connected') scheduleAutosave();
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    const { meta, file } = store.get();
    if (meta.dirty && file.status === 'connected') void saveNow();
    return;
  }
  // Al volver visible: un vuelco oculto congelado (Chrome Android) puede haber
  // dejado `saving` colgado para siempre; se libera para no bloquear la sesión
  // y se retoma el vuelco pendiente sin esperar al debounce.
  saving = false;
  const { meta, file } = store.get();
  if (meta.dirty && file.status === 'connected' && !pendingConflict()) void saveNow();
}

async function onFocus() {
  await checkExternalChange();
  const { meta, file } = store.get();
  if (meta.dirty && file.status === 'connected' && !pendingConflict()) void saveNow();
}

/** Activa autoguardado, chequeo al ocultar la pestaña, retoma al volver visible y chequeo al recuperar foco. */
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
  clearPendingConflict();
  saving = false;
  scheduled = false;
  setHandle(null);
  void handleStore.clear().catch(() => {});
}
