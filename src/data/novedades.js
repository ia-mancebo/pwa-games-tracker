/**
 * Ciclo de vida del tablón Novedades (ticket 23, spec §7.2–§7.3): refresco
 * contra el proxy IGDB, escritura atómica de la instantánea, siembra de las
 * carátulas en covers-v1 y los refrescos automáticos silenciosos (al abrir la
 * pestaña con >12 h, y reintento cuando vuelve la red tras un fallo).
 */
import { store } from '../app.js';
import { igdb } from '../services/igdb.js';
import { getSnapshot, saveSnapshot } from './snapshot.js';
import { seedCovers } from './covers.js';

/** Edad máxima de la instantánea antes del refresco automático (spec §7.3). */
const REFRESH_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Resultado de un intento de refresco.
 * @typedef {'ok'|'unconfigured'|'offline'|'service-error'} RefreshStatus
 */

/** El último intento terminó mal (offline/servicio): alimenta el reintento. */
let lastAttemptFailed = false;

/** La Instantánea ya se cargó al slice: ensureNovedadesContent es idempotente. */
let contentLoaded = false;

/**
 * URLs de carátula presentes en la instantánea (para covers-v1).
 * @param {import('../services/igdb.js').NovedadesSnapshot} data
 * @returns {string[]}
 */
function collectCoverUrls(data) {
  const urls = [];
  for (const list of [data.recientes, data.proximos, data.populares, data.esperados]) {
    for (const game of list ?? []) {
      if (typeof game.coverUrl === 'string' && game.coverUrl !== '') urls.push(game.coverUrl);
    }
  }
  return urls;
}

/**
 * Descarga el tablón y guarda la instantánea atómica + carátulas. Nunca
 * lanza: el resultado tipado alimenta la banda de modo degradado. Escribe el
 * ciclo en el slice novedadesUi: refreshing en vuelo, degraded al terminar
 * (null si triunfa) y la Instantánea nueva en el slice.
 * @returns {Promise<{ status: RefreshStatus }>}
 */
export async function refreshNovedades() {
  store.set({ novedadesUi: { ...store.get().novedadesUi, refreshing: true } });
  /** @type {RefreshStatus} */
  let status;
  /** @type {import('./snapshot.js').SavedSnapshot|null} */
  let record = null;
  if (!igdb.isConfigured()) {
    lastAttemptFailed = false;
    status = 'unconfigured';
  } else if (!navigator.onLine) {
    lastAttemptFailed = true;
    status = 'offline';
  } else {
    try {
      const data = await igdb.fetchNovedades();
      record = await saveSnapshot(data);
      // Siembra fire-and-forget: nunca bloquea ni decide el estado del refresco.
      void seedCovers(collectCoverUrls(data));
      lastAttemptFailed = false;
      status = 'ok';
    } catch {
      lastAttemptFailed = true;
      status = 'service-error';
    }
  }
  store.set({
    novedadesUi: {
      ...store.get().novedadesUi,
      refreshing: false,
      degraded: status === 'ok' ? null : status,
      ...(record ? { snapshot: record } : {}),
    },
  });
  return { status };
}

/**
 * Refresco automático al abrir la pestaña: solo si no hay instantánea, o la
 * hay con >12 h y conexión. En el resto de casos no toca la red.
 * @returns {Promise<{ status: RefreshStatus }|null>} null = no tocó la red
 */
export async function autoRefreshIfNeeded() {
  const snap = await getSnapshot();
  if (!snap) return refreshNovedades();
  const ageMs = Date.now() - Date.parse(snap.savedAt);
  if ((!Number.isFinite(ageMs) || ageMs > REFRESH_AGE_MS) && navigator.onLine) {
    return refreshNovedades();
  }
  return null;
}

/**
 * Carga la Instantánea desde IDB al slice novedadesUi (idempotente, guarda
 * interna del módulo): siembra loading, escribe el snapshot y apaga loading.
 * La guarda solo se fija tras una carga EXITOSA: si getSnapshot rechaza, la
 * siguiente llamada reintenta (la vista la invoca en cada render). La vista
 * la llama desde su render; el refresco escribe la Instantánea nueva
 * directamente en el slice.
 * @returns {Promise<void>}
 */
export async function ensureNovedadesContent() {
  const ui = store.get().novedadesUi;
  if (contentLoaded || ui.loading) return;
  store.set({ novedadesUi: { ...ui, loading: true } });
  try {
    const snap = await getSnapshot();
    contentLoaded = true;
    store.set({ novedadesUi: { ...store.get().novedadesUi, snapshot: snap } });
  } finally {
    store.set({ novedadesUi: { ...store.get().novedadesUi, loading: false } });
  }
}

/**
 * Reintento silencioso cuando vuelve la red tras un intento fallido
 * (spec §7.3). Devuelve la función de limpieza para pruebas.
 * @returns {() => void}
 */
export function initNovedadesRetry() {
  const onOnline = () => {
    if (!lastAttemptFailed || !igdb.isConfigured()) return;
    void refreshNovedades().catch(() => {});
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

/** Reinicia el estado interno del refresco y la carga (aislación en pruebas). */
export function resetNovedadesRefresh() {
  lastAttemptFailed = false;
  contentLoaded = false;
}
