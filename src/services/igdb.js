/**
 * Cliente del proxy Cloudflare Worker para IGDB (ticket 21, spec §6 y
 * worker/CONTRACT.md). La URL base vive en localStorage ('gt.workerUrl');
 * cualquier fallo de red/HTTP/respuesta se degrada al mensaje único de la
 * spec §7.3. Novedades usa el mismo cliente desde el ticket 23.
 */

/** Mensaje único de modo degradado para cualquier fallo del servicio (spec §7.3). */
export const IGDB_SERVICE_ERROR = 'No se pudo contactar con el servicio';

const WORKER_KEY = 'gt.workerUrl';
const TIMEOUT_MS = 10_000;

const NOVEDADES_SECTIONS = ['recientes', 'proximos', 'populares', 'esperados'];

/** Error tipado del cliente IGDB: la UI lo muestra inline. */
export class IgdbError extends Error {
  constructor() {
    super(IGDB_SERVICE_ERROR);
    this.name = 'IgdbError';
  }
}

/**
 * Resultado de búsqueda según worker/CONTRACT.md.
 * @typedef {{
 *   igdbId: number,
 *   title: string,
 *   releaseDate: string | null,
 *   coverUrl: string | null,
 *   description: string,
 *   genres: {id: number, name: string}[],
 *   platforms: {id: number, name: string}[],
 * }} IgdbGame
 */

/**
 * Almacenamiento local disponible (undefined si el entorno lo bloquea).
 * @returns {Storage | undefined}
 */
function localStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * URL base configurada, sin espacios ni barra final; '' si no hay nada.
 * @returns {string}
 */
export function getWorkerUrl() {
  const value = (localStorage()?.getItem(WORKER_KEY) ?? '').trim();
  return value.replace(/\/+$/, '');
}

/**
 * Persiste la URL base; cadena vacía o de espacios la borra.
 * @param {string} url
 */
export function setWorkerUrl(url) {
  const cleaned = url.trim().replace(/\/+$/, '');
  const storage = localStorage();
  if (!storage) return;
  if (cleaned === '') storage.removeItem(WORKER_KEY);
  else storage.setItem(WORKER_KEY, cleaned);
}

/**
 * @returns {boolean} true solo con URL http(s) no vacía.
 */
export function isConfigured() {
  try {
    const parsed = new URL(getWorkerUrl());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * GET JSON contra el Worker con timeout de 10 s; todo fallo → IgdbError.
 * @param {string} path Ruta con query incluida («/api/search?q=…»).
 * @returns {Promise<unknown>}
 */
async function requestJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getWorkerUrl()}${path}`, { signal: controller.signal });
    if (!res.ok) throw new IgdbError();
    return await res.json();
  } catch (error) {
    if (error instanceof IgdbError) throw error;
    throw new IgdbError();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Búsqueda por título contra el proxy (hasta 12 resultados del Worker).
 * @param {string} query
 * @returns {Promise<IgdbGame[]>}
 */
export async function searchGames(query) {
  if (!isConfigured()) throw new IgdbError();
  const body = await requestJson(`/api/search?q=${encodeURIComponent(query)}`);
  if (!body || typeof body !== 'object' || !Array.isArray(/** @type {any} */ (body).results)) {
    throw new IgdbError();
  }
  return /** @type {{results: IgdbGame[]}} */ (body).results;
}

/**
 * Instantánea completa del tablón Novedades (ticket 23, spec §7.2).
 * @typedef {{
 *   recientes: IgdbGame[],
 *   proximos: IgdbGame[],
 *   populares: IgdbGame[],
 *   esperados: IgdbGame[],
 *   generatedAt?: string,
 * }} NovedadesSnapshot
 */

/**
 * @returns {Promise<NovedadesSnapshot>}
 */
export async function fetchNovedades() {
  if (!isConfigured()) throw new IgdbError();
  const body = await requestJson('/api/novedades');
  const snapshot = /** @type {Record<string, unknown>} */ (
    body && typeof body === 'object' ? body : null
  );
  if (!snapshot || NOVEDADES_SECTIONS.some((key) => !Array.isArray(snapshot[key]))) {
    throw new IgdbError();
  }
  return /** @type {NovedadesSnapshot} */ (snapshot);
}
