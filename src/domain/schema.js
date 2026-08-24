/**
 * Esquema del documento v1 (spec §4). Módulo puro: sin DOM, sin IDB, sin reloj.
 * Convenciones: fechas `YYYY-MM-DD`, campo ausente = desconocido.
 */

/** @typedef {'backlog'|'playing'|'finished'|'abandoned'} Status */

/** @type {Status[]} */
export const STATUSES = ['backlog', 'playing', 'finished', 'abandoned'];

/** Etiquetas españolas para la UI; los datos siempre usan tokens ingleses. @type {Record<Status, string>} */
export const STATUS_LABELS = {
  backlog: 'Quiero jugar',
  playing: 'Jugando',
  finished: 'Terminado',
  abandoned: 'Abandonado',
};

/**
 * Plataforma de una jugada. `id: null` = plataforma propia (p. ej. emulador).
 * @typedef {{ id: number|null, name: string }} Platform
 */

/**
 * Jugada: una partida de un juego, con lo vivido (spec §4.3).
 * `notes` es parte de v1 (decisión aditiva del ticket 12; no bumpea versión).
 * @typedef {{
 *   id: string,
 *   status: Status,
 *   rating?: number,
 *   platform?: Platform,
 *   addedAt: string,
 *   startedAt?: string,
 *   finishedAt?: string,
 *   notes?: string,
 * }} Play
 */

/**
 * Juego: datos compartidos guardados una sola vez (spec §4.2).
 * @typedef {{
 *   id: string,
 *   igdbId?: number,
 *   title: string,
 *   coverUrl?: string,
 *   description?: string,
 *   screenshots?: string[],
 *   genres?: {id: number, name: string}[],
 *   platforms?: {id: number, name: string}[],
 *   tags?: string[],
 *   plays: Play[],
 * }} Game
 */

/**
 * Raíz del documento `.json` (spec §4.1).
 * @typedef {{
 *   schema: 'game-tracker',
 *   version: 1,
 *   updatedAt: string,
 *   games: Game[],
 * }} Doc
 */

export const SCHEMA_ID = 'game-tracker';
export const DOC_VERSION = 1;

/** Regex estricta de fecha `YYYY-MM-DD`. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ¿Es una fecha de calendario real en formato `YYYY-MM-DD`?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * ¿Es una fecha-hora ISO válida (`Date.parse` la entiende y termina en Z u offset)?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDateTime(value) {
  if (typeof value !== 'string' || value === '') return false;
  const t = Date.parse(value);
  return !Number.isNaN(t) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/** @returns {string} uuid v4 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * Fecha de hoy en `YYYY-MM-DD` (UTC) derivada de un instante.
 * @param {Date} now
 * @returns {string}
 */
export function todayFrom(now) {
  return now.toISOString().slice(0, 10);
}

/**
 * Crea una Jugada validada. Lanza Error con mensaje español si el input es inválido.
 * @param {{ status?: Status, today: string, rating?: number, platform?: Platform, startedAt?: string, finishedAt?: string, notes?: string, id?: string }} input
 * @returns {Play}
 */
export function createPlay(input) {
  const play = /** @type {any} */ ({
    id: input.id ?? newId(),
    status: input.status ?? 'backlog',
    addedAt: input.today,
  });
  if (input.rating != null) play.rating = input.rating;
  if (input.platform != null) play.platform = input.platform;
  if (input.startedAt != null) play.startedAt = input.startedAt;
  if (input.finishedAt != null) play.finishedAt = input.finishedAt;
  if (input.notes != null) play.notes = input.notes;
  const { ok, reason } = validatePlayShape(play);
  if (!ok) throw new Error(reason);
  return /** @type {Play} */ (play);
}

/**
 * Crea un Juego con su primera Jugada. Solo `title` es obligatorio (alta manual).
 * @param {{ title: string, today: string, status?: Status, igdbId?: number, coverUrl?: string, description?: string, screenshots?: string[], genres?: {id:number,name:string}[], platforms?: {id:number,name:string}[], tags?: string[] }} input
 * @returns {Game}
 */
export function createGame(input) {
  const game = /** @type {any} */ ({
    id: newId(),
    title: input.title,
    plays: [createPlay({ status: input.status ?? 'backlog', today: input.today })],
  });
  if (input.igdbId != null) game.igdbId = input.igdbId;
  if (input.coverUrl != null) game.coverUrl = input.coverUrl;
  if (input.description != null) game.description = input.description;
  if (input.screenshots != null) game.screenshots = input.screenshots;
  if (input.genres != null) game.genres = input.genres;
  if (input.platforms != null) game.platforms = input.platforms;
  if (input.tags != null) game.tags = input.tags;
  const { ok, reason } = validateGameShape(game);
  if (!ok) throw new Error(reason);
  return /** @type {Game} */ (game);
}

/**
 * Crea la raíz de un documento.
 * @param {{ games?: Game[], now: Date }} input
 * @returns {Doc}
 */
export function createDoc({ games = [], now }) {
  return { schema: SCHEMA_ID, version: DOC_VERSION, updatedAt: now.toISOString(), games };
}

/**
 * Validación de forma de una Jugada (sin mensajes de contexto externo).
 * @param {unknown} play
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validatePlayShape(play) {
  if (typeof play !== 'object' || play === null || Array.isArray(play)) {
    return { ok: false, reason: 'Jugada malformada' };
  }
  const p = /** @type {Record<string, unknown>} */ (play);
  const known = ['id', 'status', 'rating', 'platform', 'addedAt', 'startedAt', 'finishedAt', 'notes'];
  for (const key of Object.keys(p)) {
    if (!known.includes(key)) return { ok: false, reason: `Campo desconocido en jugada: «${key}»` };
  }
  if (typeof p.id !== 'string' || p.id === '') return { ok: false, reason: 'Jugada sin id' };
  if (typeof p.status !== 'string' || !STATUSES.includes(/** @type {Status} */ (p.status))) {
    return { ok: false, reason: 'Estado de jugada inválido' };
  }
  if (p.rating !== undefined && p.rating !== null) {
    const rating = /** @type {number} */ (p.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { ok: false, reason: 'La valoración debe ser un entero de 1 a 5' };
    }
  }
  if (p.platform !== undefined && p.platform !== null) {
    const pf = /** @type {Record<string, unknown>} */ (p.platform);
    if (
      typeof pf !== 'object' ||
      typeof pf.name !== 'string' ||
      pf.name === '' ||
      !(typeof pf.id === 'number' || pf.id === null) ||
      Object.keys(pf).some((k) => k !== 'id' && k !== 'name')
    ) {
      return { ok: false, reason: 'Plataforma inválida' };
    }
  }
  if (!isDate(p.addedAt)) return { ok: false, reason: 'Fecha de alta inválida' };
  if (p.startedAt !== undefined && !isDate(p.startedAt)) {
    return { ok: false, reason: 'Fecha de inicio inválida' };
  }
  if (p.finishedAt !== undefined && !isDate(p.finishedAt)) {
    return { ok: false, reason: 'Fecha de fin inválida' };
  }
  if (p.notes !== undefined && typeof p.notes !== 'string') {
    return { ok: false, reason: 'Las notas deben ser texto' };
  }
  return { ok: true };
}

/**
 * Validación de forma de un Juego.
 * @param {unknown} game
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateGameShape(game) {
  if (typeof game !== 'object' || game === null || Array.isArray(game)) {
    return { ok: false, reason: 'Juego malformado' };
  }
  const g = /** @type {Record<string, unknown>} */ (game);
  const known = [
    'id',
    'igdbId',
    'title',
    'coverUrl',
    'description',
    'screenshots',
    'genres',
    'platforms',
    'tags',
    'plays',
  ];
  for (const key of Object.keys(g)) {
    if (!known.includes(key)) return { ok: false, reason: `Campo desconocido en juego: «${key}»` };
  }
  if (typeof g.id !== 'string' || g.id === '') return { ok: false, reason: 'Juego sin id' };
  if (g.igdbId !== undefined && (!Number.isInteger(g.igdbId) || /** @type {number} */ (g.igdbId) < 1)) {
    return { ok: false, reason: 'igdbId inválido' };
  }
  if (typeof g.title !== 'string' || g.title.trim() === '') {
    return { ok: false, reason: 'El título es obligatorio' };
  }
  if (g.coverUrl !== undefined && typeof g.coverUrl !== 'string') {
    return { ok: false, reason: 'URL de carátula inválida' };
  }
  if (g.description !== undefined && typeof g.description !== 'string') {
    return { ok: false, reason: 'Descripción inválida' };
  }
  if (g.screenshots !== undefined) {
    if (
      !Array.isArray(g.screenshots) ||
      g.screenshots.some((s) => typeof s !== 'string') ||
      g.screenshots.length > 5
    ) {
      return { ok: false, reason: 'Las capturas deben ser máximo 5 URLs' };
    }
  }
  for (const field of ['genres', 'platforms']) {
    if (g[field] !== undefined) {
      const list = /** @type {unknown[]} */ (g[field]);
      if (
        !Array.isArray(list) ||
        list.some(
          (it) =>
            typeof it !== 'object' ||
            it === null ||
            typeof (/** @type {Record<string, unknown>} */ (it).id) !== 'number' ||
            typeof (/** @type {Record<string, unknown>} */ (it).name) !== 'string' ||
            Object.keys(/** @type {object} */ (it)).some((k) => k !== 'id' && k !== 'name'),
        )
      ) {
        return { ok: false, reason: `Lista inválida: ${field}` };
      }
    }
  }
  if (g.tags !== undefined) {
    if (!Array.isArray(g.tags) || g.tags.some((t) => typeof t !== 'string')) {
      return { ok: false, reason: 'Las etiquetas deben ser texto' };
    }
  }
  if (!Array.isArray(g.plays) || g.plays.length < 1) {
    return { ok: false, reason: 'Todo juego necesita al menos una jugada' };
  }
  for (const play of /** @type {unknown[]} */ (g.plays)) {
    const res = validatePlayShape(play);
    if (!res.ok) return res;
  }
  return { ok: true };
}
