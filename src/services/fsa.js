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
  types: [
    {
      description: 'Game Tracker',
      // Los providers de Android (Descargas, apps de sync) suelen reportar
      // .json como application/octet-stream o text/plain; si el filtro solo
      // acepta application/json, el picker los deja en gris. La validación
      // real la hace validateDoc/importDoc después del pick.
      accept: {
        'application/json': ['.json'],
        'application/octet-stream': ['.json'],
        'text/plain': ['.json'],
      },
    },
  ],
  multiple: false,
};

/**
 * Lista MIME/accept del .json para el `<input type="file">` de reserva,
 * derivada de {@link PICKER_OPTS}: una única fuente para que el picker y el
 * input no puedan divergir (spec «Lista MIME»).
 * @type {string}
 */
export const JSON_ACCEPT = (() => {
  const accept = PICKER_OPTS.types[0].accept;
  return [...new Set([...Object.values(accept).flat(), ...Object.keys(accept)])].join(',');
})();

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
