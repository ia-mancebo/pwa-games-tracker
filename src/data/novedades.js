/**
 * Ciclo de vida del tablón Novedades (ticket 23, spec §7.2–§7.3): refresco
 * contra el proxy IGDB, escritura atómica de la instantánea, siembra de las
 * carátulas en covers-v1 y los refrescos automáticos silenciosos (al abrir la
 * pestaña con >12 h, y reintento cuando vuelve la red tras un fallo).
 */
import { fetchNovedades, isConfigured } from '../services/igdb.js';
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
 * lanza: el resultado tipado alimenta la banda de modo degradado.
 * @returns {Promise<{ status: RefreshStatus }>}
 */
export async function refreshNovedades() {
  if (!isConfigured()) {
    lastAttemptFailed = false;
    return { status: 'unconfigured' };
  }
  if (!navigator.onLine) {
    lastAttemptFailed = true;
    return { status: 'offline' };
  }
  try {
    const data = await fetchNovedades();
    await saveSnapshot(data);
    // Siembra fire-and-forget: nunca bloquea ni decide el estado del refresco.
    void seedCovers(collectCoverUrls(data));
    lastAttemptFailed = false;
    return { status: 'ok' };
  } catch {
    lastAttemptFailed = true;
    return { status: 'service-error' };
  }
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
 * Reintento silencioso cuando vuelve la red tras un intento fallido
 * (spec §7.3). Devuelve la función de limpieza para pruebas.
 * @returns {() => void}
 */
export function initNovedadesRetry() {
  const onOnline = () => {
    if (!lastAttemptFailed || !isConfigured()) return;
    void refreshNovedades().catch(() => {});
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

/** Reinicia el estado interno del refresco (aislación en pruebas). */
export function resetNovedadesRefresh() {
  lastAttemptFailed = false;
}
