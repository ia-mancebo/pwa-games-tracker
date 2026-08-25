/**
 * Shim de Storage para pruebas: Node ≥22 trae un global `localStorage`
 * experimental que dentro de vitest/jsdom deja `window.localStorage`
 * indefinido (no se puede tocar tests/setup.js). Importar este módulo tiene
 * efecto por sí solo.
 */
const backing = new Map();

if (typeof window !== 'undefined' && !window.localStorage) {
  const shim = {
    /** @param {string} key */
    getItem(key) {
      return backing.has(key) ? /** @type {string} */ (backing.get(key)) : null;
    },
    /**
     * @param {string} key
     * @param {string} value
     */
    setItem(key, value) {
      backing.set(key, String(value));
    },
    /** @param {string} key */
    removeItem(key) {
      backing.delete(key);
    },
    clear() {
      backing.clear();
    },
    /** @returns {number} */
    get length() {
      return backing.size;
    },
    /**
     * @param {number} index
     * @returns {string | null}
     */
    key(index) {
      return [...backing.keys()][index] ?? null;
    },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: shim });
}

/** Vacía el almacenamiento simulado entre pruebas. */
export function clearStorageShim() {
  backing.clear();
}
