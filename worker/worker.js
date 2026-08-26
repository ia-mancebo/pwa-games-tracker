/**
 * Proxy IGDB para Game Tracker (Cloudflare Worker, plan free).
 * Pieza desplegada por el usuario: los secretos CLIENT_ID/CLIENT_SECRET viven
 * solo aquí; el navegador jamás los ve. La admisión (ALLOWED_ORIGINS, CORS)
 * vive en admit.js y decide antes que cualquier ruta. Contrato en worker/CONTRACT.md.
 */
import {
  searchQuery,
  recentQuery,
  upcomingQuery,
  popularityTypesQuery,
  resolvePopularityTypeId,
  popularQuery,
  hypedQuery,
  idsQuery,
  toGame,
  dedupeById,
} from './lib.js';
import { admit, withAllowedOrigin } from './admit.js';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_BASE = 'https://api.igdb.com/v4';

const POPULAR_TYPE = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
const HYPED_TYPE = { names: ['Most Wishlisted Upcoming', 'Most Wishlisted'], keyword: 'wishlisted' };

const NOVEDADES_MAX_AGE = 21600;
// Respuesta degradada (sin bloque PopScore): se reconsulta antes, para que el
// tablón recupere populares/esperados en cuanto IGDB vuelva a responder.
const NOVEDADES_DEGRADED_MAX_AGE = 1800;
const POPULAR_BLOCK_MAX_AGE = 86400;

const TOKEN_DEFAULT_TTL_SECONDS = 55 * 24 * 60 * 60;
const TOKEN_RENEW_MARGIN_MS = 10 * 60 * 1000;

const RECENT_COUNT = 12;
const UPCOMING_COUNT = 12;
const POPULAR_COUNT = 6;
const HYPED_COUNT = 6;

/** Token de Twitch cacheado a nivel de módulo (vive mientras viva el isolate). */
/** @type {{ value: string, expiresAt: number } | null} */
let tokenCache = null;

/**
 * Configuración que el runtime inyecta en fetch(): secretos de IGDB y la
 * lista de orígenes autorizados (ver worker/admit.js y worker/CONTRACT.md).
 * @typedef {{ CLIENT_ID?: string, CLIENT_SECRET?: string, ALLOWED_ORIGINS?: string }} WorkerEnv
 */

/**
 * Caché de borde del runtime Workers (equivalente al objeto global `caches`).
 * @returns {Cache}
 */
function edgeCache() {
  return /** @type {Cache} */ ((/** @type {any} */ (caches)).default);
}

class NotConfiguredError extends Error {}
class UpstreamError extends Error {}

/**
 * @param {WorkerEnv | undefined} env
 * @returns {asserts env is WorkerEnv & { CLIENT_ID: string, CLIENT_SECRET: string }}
 */
function assertConfigured(env) {
  if (!env || !env.CLIENT_ID || !env.CLIENT_SECRET) {
    throw new NotConfiguredError('missing CLIENT_ID / CLIENT_SECRET secrets');
  }
}

/**
 * @param {WorkerEnv} env
 * @returns {Promise<string>}
 */
async function getTwitchToken(env) {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const params = new URLSearchParams({
    client_id: /** @type {string} */ (env.CLIENT_ID),
    client_secret: /** @type {string} */ (env.CLIENT_SECRET),
    grant_type: 'client_credentials',
  });
  const res = await fetch(`${TWITCH_TOKEN_URL}?${params}`, { method: 'POST' });
  if (!res.ok) throw new UpstreamError(`twitch token endpoint responded ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new UpstreamError('twitch token response missing access_token');
  const ttlMs = (data.expires_in ?? TOKEN_DEFAULT_TTL_SECONDS) * 1000 - TOKEN_RENEW_MARGIN_MS;
  tokenCache = { value: data.access_token, expiresAt: Date.now() + ttlMs };
  return tokenCache.value;
}

/**
 * @param {string} endpoint
 * @param {string} query
 * @param {string} clientId
 * @param {string} token
 * @returns {Promise<Response>}
 */
function postToIgdb(endpoint, query, clientId, token) {
  return fetch(`${IGDB_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body: query,
  });
}

/** Llama a IGDB renovando el token una sola vez si la credencial quedó invalidada (401).
 *
 * @template T
 * @param {string} endpoint
 * @param {string} query
 * @param {WorkerEnv} env
 * @returns {Promise<T>}
 */
async function igdbCall(endpoint, query, env) {
  let res = await postToIgdb(endpoint, query, /** @type {string} */ (env.CLIENT_ID), await getTwitchToken(env));
  if (res.status === 401) {
    tokenCache = null;
    res = await postToIgdb(endpoint, query, /** @type {string} */ (env.CLIENT_ID), await getTwitchToken(env));
  }
  if (!res.ok) throw new UpstreamError(`IGDB ${endpoint} responded ${res.status}`);
  return /** @type {T} */ (await res.json());
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {any[]} rows
 * @param {number} max
 * @returns {import('./lib.js').Game[]}
 */
function toGames(rows, max) {
  /** @type {import('./lib.js').Game[]} */
  const games = [];
  for (const row of rows) {
    const game = toGame(row);
    if (game) games.push(game);
  }
  return dedupeById(games, (game) => game.igdbId).slice(0, max);
}

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/**
 * @param {unknown} err
 * @returns {Response}
 */
function errorResponse(err) {
  if (err instanceof NotConfiguredError) {
    return jsonResponse(
      { error: 'Worker not configured: faltan los secretos CLIENT_ID y CLIENT_SECRET.' },
      500,
    );
  }
  if (err instanceof UpstreamError) {
    console.error(err.message);
    return jsonResponse({ error: 'No se pudo contactar con IGDB.' }, 502);
  }
  console.error(err);
  return jsonResponse({ error: 'Error interno del Worker.' }, 500);
}

/**
 * @param {URL} url
 * @param {WorkerEnv} env
 * @returns {Promise<Response>}
 */
async function handleSearch(url, env) {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return jsonResponse({ error: 'Falta el parámetro de búsqueda «q».' }, 400);
  const rows = await igdbCall('games', searchQuery(q), env);
  return jsonResponse({ results: toGames(/** @type {unknown[]} */ (rows), RECENT_COUNT) });
}

/**
 * Populares + esperados comparten bloque cacheado 24 h: las primitivas de
 * PopScore se refrescan a diario aunque el tablón lo haga cada 6 h.
 *
 * @param {string} requestUrl
 * @param {WorkerEnv} env
 * @returns {Promise<{ populares: import('./lib.js').Game[], esperados: import('./lib.js').Game[] }>}
 */
async function loadPopularBlock(requestUrl, env) {
  const cacheKey = new Request(new URL('/__internal__/popular-block', requestUrl).toString());
  const cached = await edgeCache().match(cacheKey);
  if (cached) return /** @type {any} */ (await cached.json());

  const types = await igdbCall('popularity_types', popularityTypesQuery(), env);
  const typeId = (/** @type {{ names: string[], keyword: string }} */ want) => {
    const id = resolvePopularityTypeId(types, want);
    if (id == null) throw new UpstreamError(`popularity type not found: ${want.names[0]}`);
    return id;
  };

  const [popularPrimitives, hypedPrimitives] = await Promise.all([
    igdbCall('popularity_primitives', popularQuery(typeId(POPULAR_TYPE)), env),
    igdbCall('popularity_primitives', hypedQuery(typeId(HYPED_TYPE)), env),
  ]);

  /** @type {{ game_id: number }[]} */
  const primitiveRows = [...popularPrimitives, ...hypedPrimitives];
  const gameIds = [...new Set(primitiveRows.map((p) => p.game_id))];
  const gameRows = await igdbCall('games', idsQuery(gameIds), env);
  const byId = new Map(toGames(/** @type {unknown[]} */ (gameRows), gameIds.length).map((game) => [game.igdbId, game]));

  /**
   * @param {{ game_id: number }[]} primitives
   * @param {number} max
   * @returns {import('./lib.js').Game[]}
   */
  const pickFromPrimitives = (primitives, max) => {
    /** @type {import('./lib.js').Game[]} */
    const picked = [];
    for (const primitive of primitives) {
      const game = byId.get(primitive.game_id);
      if (game) picked.push(game);
    }
    return picked.slice(0, max);
  };

  const block = {
    populares: pickFromPrimitives(popularPrimitives, POPULAR_COUNT),
    esperados: pickFromPrimitives(hypedPrimitives, HYPED_COUNT),
  };
  await edgeCache().put(
    cacheKey,
    jsonResponse(block, 200, { 'Cache-Control': `public, max-age=${POPULAR_BLOCK_MAX_AGE}` }).clone(),
  );
  return block;
}

/**
 * Bloque PopScore OPCIONAL: si IGDB rechaza cualquiera de sus llamadas, el
 * tablón se sirve igual con recientes/próximos (degradación elegante) en
 * lugar de fallar todo /api/novedades.
 *
 * @param {string} requestUrl
 * @param {WorkerEnv} env
 * @returns {Promise<{ populares: import('./lib.js').Game[], esperados: import('./lib.js').Game[], degraded: boolean }>}
 */
async function loadPopularBlockSafe(requestUrl, env) {
  try {
    const block = await loadPopularBlock(requestUrl, env);
    return { ...block, degraded: false };
  } catch (err) {
    if (err instanceof NotConfiguredError) throw err;
    console.error('Bloque PopScore omitido:', err instanceof Error ? err.message : err);
    return { populares: [], esperados: [], degraded: true };
  }
}

/**
 * @param {{ url: string }} request
 * @param {WorkerEnv} env
 * @returns {Promise<Response>}
 */
async function handleNovedades(request, env) {
  const cached = await edgeCache().match(/** @type {any} */ (request));
  if (cached) return cached;

  const [recentRows, upcomingRows] = await Promise.all([
    igdbCall('release_dates', recentQuery(todayIso()), env),
    igdbCall('release_dates', upcomingQuery(todayIso()), env),
  ]);
  const { populares, esperados, degraded } = await loadPopularBlockSafe(request.url, env);

  const response = jsonResponse(
    {
      recientes: toGames(/** @type {unknown[]} */ (recentRows), RECENT_COUNT),
      proximos: toGames(/** @type {unknown[]} */ (upcomingRows), UPCOMING_COUNT),
      populares,
      esperados,
      generatedAt: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': `public, max-age=${degraded ? NOVEDADES_DEGRADED_MAX_AGE : NOVEDADES_MAX_AGE}` },
  );
  await edgeCache().put(/** @type {any} */ (request), response.clone());
  return response;
}

export default {
  /**
   * @param {{ url: string, method?: string, headers?: { get?: (name: string) => string | null } }} request
   * @param {WorkerEnv | undefined} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const gate = admit(request, env);
    if (gate) return gate;

    const url = new URL(request.url);
    const knownRoute = ['/api/health', '/api/search', '/api/novedades'].includes(url.pathname);

    if (request.method !== 'GET' || !knownRoute) {
      return withAllowedOrigin(request, jsonResponse({ error: 'Ruta no encontrada.' }, 404));
    }

    try {
      // Health responde sin secretos para verificar el deploy antes de configurar nada.
      if (url.pathname === '/api/health') {
        return withAllowedOrigin(request, jsonResponse({ ok: true }));
      }

      assertConfigured(env);
      if (url.pathname === '/api/search') {
        return withAllowedOrigin(request, await handleSearch(url, env));
      }
      return withAllowedOrigin(request, await handleNovedades(request, env));
    } catch (err) {
      return withAllowedOrigin(request, errorResponse(err));
    }
  },
};
