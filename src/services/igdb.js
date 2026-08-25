/**
 * Cliente del proxy Cloudflare Worker para IGDB (ticket 21, spec §6 y
 * worker/CONTRACT.md). La URL base es la Conexión del doc (CONTEXT.md):
 * doc.connection.workerUrl, que viaja dentro del .json del usuario; cualquier
 * fallo de red/HTTP/respuesta se degrada al mensaje único de la spec §7.3.
 * Novedades usa el mismo cliente desde el ticket 23.
 */
import { normalizeWorkerUrl } from '../domain/schema.js';
import { store } from '../app.js';

/** Mensaje único de modo degradado para cualquier fallo del servicio (spec §7.3). */
export const IGDB_SERVICE_ERROR = 'No se pudo contactar con el servicio';

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
 *   screenshots?: string[],
 * }} IgdbGame
 */

/**
 * URL base configurada en la Conexión del doc, sin espacios ni barra final;
 * '' si no hay biblioteca cargada o no hay conexión guardada.
 * @returns {string}
 */
export function getWorkerUrl() {
  const stored = store.get().doc?.connection?.workerUrl;
  return typeof stored === 'string' ? normalizeWorkerUrl(stored) : '';
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
