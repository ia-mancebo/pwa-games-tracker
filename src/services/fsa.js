/**
 * File System Access API (spec §5.3): feature detection y handle de sesión.
 * El handle vive solo en memoria para reconexión posterior; el ticket 18 lo
 * persistirá en IDB y reemplazará este módulo puente.
 */

/**
 * Handle de archivo FSA (tipado estructural para no depender de lib.dom).
 * @typedef {{ getFile(): Promise<File> }} FsFileHandle
 */

let currentFileHandle = /** @type {FsFileHandle|null} */ (null);

/** @returns {FsFileHandle|null} */
export function getHandle() {
  return currentFileHandle;
}

/** @param {FsFileHandle|null} handle */
export function setHandle(handle) {
  currentFileHandle = handle;
}

/** @returns {boolean} */
export function hasFsa() {
  return typeof self !== 'undefined' && 'showOpenFilePicker' in self;
}

/**
 * Estado de permiso del handle SIN gesto de usuario (`queryPermission`).
 * Handles sin el método (fakes de prueba, motores antiguos) se asumen
 * concedidos: la conexión reciente siempre llegó con permiso explícito.
 * @param {{ getFile(): Promise<File>, queryPermission?: (o?: { mode: string }) => Promise<string> } | null} handle
 * @param {'read' | 'readwrite'} [mode]
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function permissionState(handle, mode = 'readwrite') {
  const query = /** @type {any} */ (handle)?.queryPermission;
  if (typeof query !== 'function') return 'granted';
  try {
    return await query.call(handle, { mode });
  } catch {
    return 'denied';
  }
}

const PICKER_OPTS = {
  types: [{ description: 'Game Tracker', accept: { 'application/json': ['.json'] } }],
  multiple: false,
};

/**
 * Abre el picker nativo de apertura; guarda el handle y devuelve el texto del
 * archivo con su nombre. Rechaza con `AbortError` si el usuario cancela.
 * @returns {Promise<{ text: string, name: string }>}
 */
export async function pickJsonText() {
  const picker = /** @type {(opts?: unknown) => Promise<unknown[]>} */ (
    /** @type {any} */ (self).showOpenFilePicker
  );
  const handles = await picker.call(self, PICKER_OPTS);
  const handle = /** @type {FsFileHandle} */ (handles[0]);
  setHandle(handle);
  const file = await handle.getFile();
  return { text: await file.text(), name: file.name };
}
