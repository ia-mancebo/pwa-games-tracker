/**
 * Cliente del proxy Cloudflare Worker para IGDB (ticket 21, spec §6 y
 * worker/CONTRACT.md). La Conexión entra por la interface: el módulo no lee
 * el store; quien construye un cliente decide de dónde sale la URL base.
 * Cualquier fallo de red/HTTP/respuesta se degrada al mensaje único de la
 * spec §7.3. Novedades usa el mismo cliente desde el ticket 23.
 */
import { normalizeWorkerUrl } from '../domain/schema.js';
import { store } from '../app.js';

/** Mensaje único de modo degradado para cualquier fallo del servicio (spec §7.3). */
export const IGDB_SERVICE_ERROR = 'No se pudo contactar con el servicio';

/**
 * Corte de cada petición al Worker. 25 s deja sitio al arranque en frío del
 * Worker y a la limitación de IGDB (novedades trae cuatro secciones); antes
 * de bajarlo de aquí, comprobar worker/CONTRACT.md.
 */
const TIMEOUT_MS = 25_000;

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
 * Cliente de la Fuente de datos. Dos adapters justifican el seam: en
 * producción `igdb` lee la URL base de la Conexión del doc; en pruebas se
 * construye uno propio con una URL fija — sin tocar estado global.
 *
 * @typedef {{
 *   workerUrl(): string,
 *   isConfigured(): boolean,
 *   searchGames(query: string): Promise<IgdbGame[]>,
 *   fetchNovedades(): Promise<NovedadesSnapshot>,
 * }} DataSource
 */

/**
 * @param {() => string} readConnection URL base sin normalizar; '' si no hay conexión.
 * @returns {DataSource}
 */
export function createDataSource(readConnection) {
  /**
   * URL base normalizada (sin espacios ni barra final); '' si no hay conexión.
   * @returns {string}
   */
  function workerUrl() {
    const stored = readConnection();
    return typeof stored === 'string' ? normalizeWorkerUrl(stored) : '';
  }

  /**
   * @returns {boolean} true solo con URL http(s) no vacía.
   */
  function isConfigured() {
    try {
      const parsed = new URL(workerUrl());
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /**
   * GET JSON contra el Worker con timeout de 25 s; todo fallo → IgdbError.
   * @param {string} path Ruta con query incluida («/api/search?q=…»).
   * @returns {Promise<unknown>}
   */
  async function requestJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${workerUrl()}${path}`, { signal: controller.signal });
      if (!res.ok) throw new IgdbError();
      return await res.json();
    } catch (error) {
      if (error instanceof IgdbError) throw error;
      throw new IgdbError();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    workerUrl,
    isConfigured,

    /**
     * Búsqueda por título contra el proxy (hasta 12 resultados del Worker).
     * @param {string} query
     * @returns {Promise<IgdbGame[]>}
     */
    async searchGames(query) {
      if (!isConfigured()) throw new IgdbError();
      const body = await requestJson(`/api/search?q=${encodeURIComponent(query)}`);
      if (!body || typeof body !== 'object' || !Array.isArray(/** @type {any} */ (body).results)) {
        throw new IgdbError();
      }
      return /** @type {{results: IgdbGame[]}} */ (body).results;
    },

    /**
     * @returns {Promise<NovedadesSnapshot>}
     */
    async fetchNovedades() {
      if (!isConfigured()) throw new IgdbError();
      const body = await requestJson('/api/novedades');
      const snapshot = /** @type {Record<string, unknown>} */ (
        body && typeof body === 'object' ? body : null
      );
      if (!snapshot || NOVEDADES_SECTIONS.some((key) => !Array.isArray(snapshot[key]))) {
        throw new IgdbError();
      }
      return /** @type {NovedadesSnapshot} */ (snapshot);
    },
  };
}

/**
 * Adapter de producción: lee la Conexión del doc del usuario (viaja en su
 * .json; CONTEXT.md).
 */
export const igdb = createDataSource(() => {
  const stored = store.get().doc?.connection?.workerUrl;
  return typeof stored === 'string' ? stored : '';
});
