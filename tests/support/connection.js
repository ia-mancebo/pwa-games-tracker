import { store } from '../../src/app.js';

/**
 * Siembra la Conexión (URL del proxy IGDB) directamente en el doc del store,
 * sin pasar por la mutación de biblioteca ni IndexedDB: sustituye a la vieja
 * `setWorkerUrl` respaldada en localStorage. Requiere una biblioteca cargada
 * (newLibrary/importDoc antes), igual que ocurre en producción.
 * @param {string} url URL sin normalizar; cadena vacía ⇒ quita la conexión.
 */
export function seedWorkerUrl(url) {
  const current = store.get().doc;
  if (!current) throw new Error('seedWorkerUrl requiere una biblioteca cargada');
  const doc = /** @type {any} */ (structuredClone(current));
  if (url.trim() === '') delete doc.connection;
  else doc.connection = { workerUrl: url };
  store.set({ doc });
}
