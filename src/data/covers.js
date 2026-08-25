/**
 * Siembra de carátulas offline (ticket 22, spec §7.1): descarga cada coverUrl y
 * la guarda en la caché dedicada `covers-v1`, la misma que la ruta runtime del
 * service worker leerá y escribirá (ticket 25). Nunca persiste respuestas
 * fallidas y jamás bloquea la UI: todo el trabajo es fire-and-forget.
 */
import { store } from '../app.js';

export const COVERS_CACHE = 'covers-v1';

/** Caché interna de sellos temporales (url → ms); el service worker no la toca. */
export const COVERS_META_CACHE = 'covers-v1-meta';

const MAX_ENTRIES = 500;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * URLs de carátula presentes en un documento.
 * @param {import('../domain/schema.js').Doc|null} doc
 * @returns {Set<string>}
 */
function collectCoverUrls(doc) {
  const urls = new Set();
  for (const game of doc?.games ?? []) {
    if (typeof game.coverUrl === 'string' && game.coverUrl !== '') urls.add(game.coverUrl);
  }
  return urls;
}

/** ¿Respuesta utilizable como imagen? 200 explícito u opaca (no-cors, status 0). */
function usable(/** @type {Response} */ res) {
  return res.status === 200 || res.status === 0;
}

/**
 * Descarga una carátula: primero CORS (respuesta legible y barata en cuota,
 * spec §7.1); si la red lo impide, reintenta opaca con no-cors. Un fallo
 * explícito del servidor en CORS (p. ej. 404) NO se reintenta ni se persiste.
 * @param {string} url
 * @returns {Promise<Response|null>}
 */
async function fetchSeedable(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    return usable(res) ? res : null;
  } catch {
    // Error de red/CORS: única vía al reintento opaco.
  }
  try {
    const res = await fetch(url, { mode: 'no-cors' });
    return usable(res) ? res : null;
  } catch {
    return null;
  }
}

/** Sello temporal de inserción: las opacas no traen cabeceras de fecha. */
async function touchCover(/** @type {string} */ url) {
  const meta = await caches.open(COVERS_META_CACHE);
  await meta.put(url, new globalThis.Response(String(Date.now())));
}

/**
 * Siembra una URL en `covers-v1`. Nunca lanza.
 * @param {string} url
 * @returns {Promise<boolean>} true si quedó cacheada
 */
export async function seedCover(url) {
  try {
    const res = await fetchSeedable(url);
    if (!res) return false;
    const cache = await caches.open(COVERS_CACHE);
    await cache.put(url, res);
    await touchCover(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Siembra varias URLs en paralelo y devuelve cuántas quedaron cacheadas.
 * @param {Iterable<string>} urls
 * @returns {Promise<number>}
 */
export async function seedCovers(urls) {
  const unique = [...new Set(urls)];
  const results = await Promise.allSettled(unique.map(seedCover));
  const seeded = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  if (seeded > 0) void enforceLimits();
  return seeded;
}

/**
 * Borra de ambas cachés las URLs que ya no posee ningún juego del documento.
 * @param {import('../domain/schema.js').Doc|null} doc
 * @returns {Promise<number>} entradas borradas
 */
export async function pruneOrphanCovers(doc) {
  try {
    const owned = collectCoverUrls(doc);
    const cache = await caches.open(COVERS_CACHE);
    const keys = await cache.keys();
    const meta = await caches.open(COVERS_META_CACHE);
    let deleted = 0;
    for (const key of keys) {
      if (owned.has(key.url)) continue;
      if (await cache.delete(key)) deleted++;
      await meta.delete(key.url);
    }
    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Política de expiración (spec §7.1): máx. 500 entradas, edad máxima 1 año.
 * El orden lo marcan nuestros sellos de COVERS_META_CACHE, no las cabeceras.
 * @returns {Promise<number>} entradas borradas
 */
export async function enforceLimits() {
  try {
    const meta = await caches.open(COVERS_META_CACHE);
    const stamped = [];
    for (const key of await meta.keys()) {
      const ts = Number(await (await meta.match(key))?.text());
      stamped.push({ url: key.url, ts: Number.isFinite(ts) ? ts : 0 });
    }
    stamped.sort((a, b) => a.ts - b.ts);
    const now = Date.now();
    const fresh = stamped.filter((e) => now - e.ts <= MAX_AGE_MS);
    const victims = [
      ...stamped.filter((e) => now - e.ts > MAX_AGE_MS).map((e) => e.url),
      ...fresh.slice(0, Math.max(0, fresh.length - MAX_ENTRIES)).map((e) => e.url),
    ];
    if (victims.length > 0) {
      const cache = await caches.open(COVERS_CACHE);
      for (const url of victims) {
        await cache.delete(url);
        await meta.delete(url);
      }
    }
    return victims.length;
  } catch {
    return 0;
  }
}

let unsubscribe = /** @type {(() => boolean) | null} */ (null);
let started = false;

/** URLs ya intentadas esta sesión: sin re-siembra ni reintentos en bucle. */
const attempted = new Set();

/**
 * @param {ReturnType<typeof store.get>} state
 */
function onStoreChange(state) {
  const urls = collectCoverUrls(state.doc);
  // Doc reemplazado en bloque (import): poda solo si alguna URL perdió dueño.
  if (lastUrls !== null && [...lastUrls].some((url) => !urls.has(url))) {
    void pruneOrphanCovers(state.doc);
  }
  const fresh = [...urls].filter((url) => !attempted.has(url));
  for (const url of fresh) attempted.add(url);
  if (fresh.length > 0) void seedCovers(fresh);
  lastUrls = urls;
}

/** Conjunto de URLs del doc anterior; null = primera notificación. @type {Set<string> | null} */
let lastUrls = null;

/** Activa el observador del store: siembra nuevas carátulas y poda huérfanas. */
export function initCoverSeeding() {
  if (started || typeof caches === 'undefined') return;
  started = true;
  unsubscribe = store.subscribe(onStoreChange);
  onStoreChange(store.get());
}

/** Desactiva todo lo activado por {@link initCoverSeeding} (aislación en pruebas). */
export function resetCoverSeeding() {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  lastUrls = null;
  attempted.clear();
}
