/**
 * Admisión del proxy IGDB: única puerta de entrada del Worker y cabecera CORS
 * de salida. Las respuestas solo se decoran DESPUÉS de pasar por admit(), así
 * que Access-Control-Allow-Origin siempre refleja el Origen validado de ESA
 * petición (incluso al servir de caché).
 *
 * - Los orígenes autorizados viven en la secret/env ALLOWED_ORIGINS,
 *   separados por comas. Nunca en el código.
 * - Fail-closed: sin lista o con lista vacía se rechaza todo salvo
 *   /api/health (exenta: comprueba vida sin filtrar nada).
 * - Rechazo uniforme: 403 idéntico para Origin ausente, ajeno, o secret sin
 *   configurar. No revela si el Worker está configurado ni permite medirlo.
 * - Preflight (OPTIONS) desde origen autorizado: 204 con eco del origen.
 */
const HEALTH_PATH = '/api/health';

const UNAUTHORIZED_BODY = JSON.stringify({ error: 'Origen no autorizado.' });

/**
 * Normaliza un origen para comparación: trim, minúsculas y sin barras finales.
 * Un origen es `scheme://host[:port]`: sin ruta, igual por definición.
 * @param {string} value
 * @returns {string}
 */
function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Lee la cabecera Origin tolerando stubs planos en pruebas.
 * @param {{ headers?: { get?: (name: string) => string | null } }} request
 * @returns {string | null}
 */
function originOf(request) {
  const getter = request.headers?.get;
  return typeof getter === 'function' ? getter.call(request.headers, 'Origin') : null;
}

function unauthorizedResponse() {
  return new Response(UNAUTHORIZED_BODY, {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

function preflightResponse(/** @type {string} */ origin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Puerta de entrada: null significa «pasa», un Response significa «detente aquí».
 * Se invoca antes de cachés y rutas; ningún código de negocio ve peticiones no admitidas.
 *
 * @param {{ url: string, method?: string, headers?: { get?: (name: string) => string | null } }} request
 * @param {{ ALLOWED_ORIGINS?: string } | undefined} env
 * @returns {Response | null}
 */
export function admit(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === HEALTH_PATH) return null;

  const allowed = String(env?.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  const incoming = normalizeOrigin(originOf(request) ?? '');
  if (!incoming || !allowed.includes(incoming)) return unauthorizedResponse();

  if (request.method === 'OPTIONS') return preflightResponse(incoming);
  return null;
}

/**
 * Salida simétrica de admit(): añade el eco del Origen a la respuesta que va
 * camino del cliente, con Vary para que ninguna caché cruce variantes.
 * Llamar solo sobre respuestas producidas tras admit(); para /api/health hace
 * de eco neutro porque su contenido es público.
 *
 * @param {{ headers?: { get?: (name: string) => string | null } }} request
 * @param {Response} response
 * @returns {Response}
 */
export function withAllowedOrigin(request, response) {
  const incoming = normalizeOrigin(originOf(request) ?? '');
  if (!incoming) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', incoming);
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
