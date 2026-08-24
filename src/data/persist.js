/**
 * Almacenamiento persistente (ticket 19, spec §5.6): se pide UNA única vez
 * tras el primer vuelco exitoso; si deniega, no se insiste jamás (bandera
 * `persistAsked` en meta, sobrevive a recargas).
 */
import { store } from '../app.js';
import { putMeta } from './db.js';

/** @returns {StorageManager | null} */
function storage() {
  return typeof navigator !== 'undefined' ? (navigator.storage ?? null) : null;
}

/**
 * Marca la bandera ANTES de pedir para que llamadas concurrentes no dupliquen.
 * @returns {Promise<void>}
 */
export async function requestPersistOnce() {
  const api = storage();
  if (!api || typeof api.persist !== 'function') return;
  const { meta } = store.get();
  if (meta.persistAsked) return;
  store.set({ meta: { ...meta, persistAsked: true } });
  try {
    await putMeta(store.get().meta);
  } catch {
    // Sin espejo accesible la bandera en memoria basta por sesión.
  }
  try {
    await api.persist();
  } catch {
    // Denegada o no disponible: persistAsked evita reintentos.
  }
}

/**
 * Línea de estado para el diálogo «Datos»; vacía si no se puede saber.
 * @returns {Promise<string>}
 */
export async function persistenceStatusLine() {
  const api = storage();
  if (!api || typeof api.persisted !== 'function') return '';
  try {
    return (await api.persisted())
      ? 'Almacenamiento persistente concedido: el navegador no borrará tus datos automáticamente.'
      : 'Almacenamiento best-effort: el navegador podría limpiarlo si necesita espacio.';
  } catch {
    return '';
  }
}
