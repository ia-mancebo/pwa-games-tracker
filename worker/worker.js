/**
 * Proxy IGDB para Game Tracker (Cloudflare Worker, plan free).
 * Pieza desplegada por el usuario: los secretos CLIENT_ID/CLIENT_SECRET viven
 * solo aquí; el navegador jamás los ve. Contrato en worker/CONTRACT.md.
 */
import {
  searchQuery,
  recentQuery,
  upcomingQuery,
  popularityTypesQuery,
  popularQuery,
  hypedQuery,
  idsQuery,
  toGame,
  dedupeById,
} from './lib.js';

// Origen autorizado a llamar al proxy. Sustituye el placeholder por tu URL real
// (la de GitHub Pages, p. ej. 'https://mi-usuario.github.io') ANTES del Deploy:
// si despliegas con el placeholder, el navegador bloqueará todas las peticiones.
const ALLOWED_ORIGIN = 'https://ia-mancebo.github.io';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_BASE = 'https://api.igdb.com/v4';

const POPULAR_TYPE_NAME = 'IGDB Visits';
const HYPED_TYPE_NAME = 'Most Wishlisted Upcoming';

const NOVEDADES_MAX_AGE = 21600;
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

class NotConfiguredError extends Error {}
class UpstreamError extends Error {}

function assertConfigured(env) {
  if (!env || !env.CLIENT_ID || !env.CLIENT_SECRET) {
    throw new NotConfiguredError('missing CLIENT_ID / CLIENT_SECRET secrets');
  }
}

async function getTwitchToken(env) {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const params = new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
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

/** Llama a IGDB renovando el token una sola vez si la credencial quedó invalidada (401). */
async function igdbCall(endpoint, query, env) {
  let res = await postToIgdb(endpoint, query, env.CLIENT_ID, await getTwitchToken(env));
  if (res.status === 401) {
    tokenCache = null;
    res = await postToIgdb(endpoint, query, env.CLIENT_ID, await getTwitchToken(env));
  }
  if (!res.ok) throw new UpstreamError(`IGDB ${endpoint} responded ${res.status}`);
  return res.json();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toGames(rows, max) {
  return dedupeById(rows.map(toGame).filter(Boolean), (game) => game.igdbId).slice(0, max);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      ...extraHeaders,
    },
  });
}

function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

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

async function handleSearch(url, env) {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return jsonResponse({ error: 'Falta el parámetro de búsqueda «q».' }, 400);
  const rows = await igdbCall('games', searchQuery(q), env);
  return jsonResponse({ results: toGames(rows, RECENT_COUNT) });
}

/**
 * Populares + esperados comparten bloque cacheado 24 h: las primitivas de
 * PopScore se refrescan a diario aunque el tablón lo haga cada 6 h.
 */
async function loadPopularBlock(requestUrl, env) {
  const cacheKey = new Request(new URL('/__internal__/popular-block', requestUrl).toString());
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached.json();

  const types = await igdbCall('popularity_types', popularityTypesQuery(), env);
  const typeIdByName = (name) => {
    const found = types.find((type) => type.name === name);
    if (!found) throw new UpstreamError(`popularity type not found: ${name}`);
    return found.id;
  };

  const [popularPrimitives, hypedPrimitives] = await Promise.all([
    igdbCall('popularity_primitives', popularQuery(typeIdByName(POPULAR_TYPE_NAME)), env),
    igdbCall('popularity_primitives', hypedQuery(typeIdByName(HYPED_TYPE_NAME)), env),
  ]);

  const gameIds = [...new Set([...popularPrimitives, ...hypedPrimitives].map((p) => p.game_id))];
  const gameRows = await igdbCall('games', idsQuery(gameIds), env);
  const byId = new Map(toGames(gameRows, gameIds.length).map((game) => [game.igdbId, game]));

  const pickFromPrimitives = (primitives, max) =>
    primitives.map((p) => byId.get(p.game_id)).filter(Boolean).slice(0, max);

  const block = {
    populares: pickFromPrimitives(popularPrimitives, POPULAR_COUNT),
    esperados: pickFromPrimitives(hypedPrimitives, HYPED_COUNT),
  };
  await caches.default.put(
    cacheKey,
    jsonResponse(block, 200, { 'Cache-Control': `public, max-age=${POPULAR_BLOCK_MAX_AGE}` }).clone(),
  );
  return block;
}

async function handleNovedades(request, env) {
  const cached = await caches.default.match(request);
  if (cached) return cached;

  const [recentRows, upcomingRows] = await Promise.all([
    igdbCall('release_dates', recentQuery(todayIso()), env),
    igdbCall('release_dates', upcomingQuery(todayIso()), env),
  ]);
  const { populares, esperados } = await loadPopularBlock(request.url, env);

  const response = jsonResponse(
    {
      recientes: toGames(recentRows, RECENT_COUNT),
      proximos: toGames(upcomingRows, UPCOMING_COUNT),
      populares,
      esperados,
      generatedAt: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': `public, max-age=${NOVEDADES_MAX_AGE}` },
  );
  await caches.default.put(request, response.clone());
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const knownRoute = ['/api/health', '/api/search', '/api/novedades'].includes(url.pathname);

    if (request.method === 'OPTIONS') return preflightResponse();
    if (request.method !== 'GET' || !knownRoute) {
      return jsonResponse({ error: 'Ruta no encontrada.' }, 404);
    }

    try {
      // Health responde sin secretos para verificar el deploy antes de configurar nada.
      if (url.pathname === '/api/health') return jsonResponse({ ok: true });

      assertConfigured(env);
      if (url.pathname === '/api/search') return await handleSearch(url, env);
      return await handleNovedades(request, env);
    } catch (err) {
      return errorResponse(err);
    }
  },
};
