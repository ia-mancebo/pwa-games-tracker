/**
 * Segunda pestaña vía Web Locks (ticket 19, spec §5.6): la pestaña que retiene
 * «game-tracker-primary» es la primaria; las demás entran en solo lectura y
 * pueden hacerse activas en cuanto el lock quede libre.
 */
import { store } from '../app.js';
import { isAbortError } from '../lib/errors.js';

const LOCK_NAME = 'game-tracker-primary';
const RETRY_MS = 150;
const RETRY_MAX_MS = 4000;

/** @returns {LockManager | null} */
function locks() {
  return typeof navigator !== 'undefined' ? (navigator.locks ?? null) : null;
}

/**
 * Guard de escritura: false ⇒ esta pestaña está en solo lectura.
 * @returns {boolean}
 */
export function assertWritable() {
  return store.get().tabRole !== 'secondary';
}

/**
 * Intenta retener el lock primario SIN esperar: si otra pestaña lo tiene,
 * devuelve false al instante (AbortError/NotSupportedError ⇒ false). Sin Web
 * Locks se asume pestaña única. Al conseguirlo resuelve true en el acto y el
 * callback queda pendiente para siempre: eso ES retener el lock.
 * @returns {Promise<boolean>}
 */
export function acquireTabLock() {
  const api = locks();
  if (!api?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    /** @param {boolean} value */
    const settleOnce = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    api
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        settleOnce(Boolean(lock));
        return lock ? new Promise(() => {}) : undefined;
      })
      .then(
        () => {},
        () => settleOnce(false),
      );
  });
}

/** @param {number} ms @returns {Promise<void>} */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Notificación pendiente del watcher activo (la última llamada gana). @type {(() => void) | null} */
let pendingNotify = null;

let watching = false;

async function watchLoop() {
  let delay = RETRY_MS;
  for (;;) {
    const api = locks();
    if (!api?.request) {
      watching = false;
      const notify = pendingNotify;
      pendingNotify = null;
      notify?.();
      return;
    }
    try {
      await api.request(LOCK_NAME, () => {
        const notify = pendingNotify;
        watching = false;
        pendingNotify = null;
        notify?.();
        return new Promise(() => {});
      });
      return;
    } catch (err) {
      if (isAbortError(err) || (err instanceof Error && err.name === 'NotSupportedError')) {
        // Sin remedio: se abandona la vigilancia (y el rol secundario se mantiene).
        watching = false;
        pendingNotify = null;
        return;
      }
      // Rechazo transitorio: seguimos reintentando con los mismos datos.
    }
    await sleep(delay);
    delay = Math.min(delay * 2, RETRY_MAX_MS);
  }
}

/**
 * Observa hasta que el lock primario quede libre; entonces ejecuta el callback
 * registrado UNA vez (esta pestaña pasa a activa) y retiene el lock
 * definitivamente. Reintenta con backoff suave; llamadas posteriores actualizan
 * el callback en lugar de duplicar vigilas.
 * @param {() => void} fn
 * @returns {Promise<void>}
 */
export function onLockReleased(fn) {
  const api = locks();
  if (!api?.request) {
    fn();
    return Promise.resolve();
  }
  pendingNotify = fn;
  if (!watching) {
    watching = true;
    void watchLoop();
  }
  return Promise.resolve();
}

/** Limpieza del módulo entre escenarios de prueba. */
export function resetTablock() {
  watching = false;
  pendingNotify = null;
}
