/**
 * Selectores puros sobre el documento: Estado del juego, orden, medias,
 * baldas y listas para filtros. Sin DOM, sin IDB, sin reloj.
 */
import { STATUS_LABELS } from './schema.js';
import { normalizeText } from './search.js';

/**
 * Jugada más reciente de un juego: máximo por `addedAt`; en empate gana la
 * última posición del array (las jugadas se añaden al final).
 * @param {import('./schema.js').Game} game
 * @returns {import('./schema.js').Play}
 */
export function latestPlay(game) {
  let latest = game.plays[0];
  for (const play of game.plays) {
    if (play.addedAt >= latest.addedAt) latest = play;
  }
  return latest;
}

/**
 * Estado del juego: el de su jugada más reciente (spec §2).
 * @param {import('./schema.js').Game} game
 * @returns {import('./schema.js').Status}
 */
export function gameStatus(game) {
  return latestPlay(game).status;
}

/** Orden de las baldas de la estantería. @type {import('./schema.js').Status[]} */
export const SHELF_ORDER = ['playing', 'backlog', 'finished', 'abandoned'];

/**
 * Orden por defecto en estantería y panel: recencia descendente (addedAt de
 * la jugada más reciente), desempate alfabético (spec §8.3). Devuelve copia.
 * @param {import('./schema.js').Game[]} games
 * @returns {import('./schema.js').Game[]}
 */
export function sortGamesByRecency(games) {
  return [...games].sort((a, b) => {
    const da = latestPlay(a).addedAt;
    const db = latestPlay(b).addedAt;
    if (da !== db) return da < db ? 1 : -1;
    return a.title.localeCompare(b.title, 'es');
  });
}

/** Redondeo a un decimal. @param {number} x */
export function round1(x) {
  return Math.round(x * 10) / 10;
}

/**
 * Media ★ de un juego: media de sus jugadas valoradas; null si ninguna.
 * @param {import('./schema.js').Game} game
 * @returns {number|null}
 */
export function gameRating(game) {
  const rated = game.plays.filter((p) => p.rating != null);
  if (rated.length === 0) return null;
  return round1(rated.reduce((sum, p) => sum + (p.rating ?? 0), 0) / rated.length);
}

/**
 * Media ★ sobre todas las jugadas valoradas de una lista de juegos.
 * @param {import('./schema.js').Game[]} games
 * @returns {number|null}
 */
export function avgRatingOfGames(games) {
  const rated = games.flatMap((g) => g.plays.filter((p) => p.rating != null));
  if (rated.length === 0) return null;
  return round1(rated.reduce((sum, p) => sum + (p.rating ?? 0), 0) / rated.length);
}

/**
 * Datos de la estantería: una entrada por Estado, juegos agrupados según su
 * Estado del juego, orden recencia + alfabético, conteo y media ★.
 * @param {import('./schema.js').Doc} doc
 * @returns {{ status: import('./schema.js').Status, label: string, games: import('./schema.js').Game[], count: number, avgRating: number|null }[]}
 */
export function shelfData(doc) {
  return SHELF_ORDER.map((status) => {
    const games = sortGamesByRecency(doc.games.filter((g) => gameStatus(g) === status));
    return {
      status,
      label: STATUS_LABELS[status],
      games,
      count: games.length,
      avgRating: avgRatingOfGames(games),
    };
  });
}

/**
 * Juegos equivalentes al candidato (aviso de duplicados del Alta, spec §4.5):
 * mismo `igdbId` si se da, o mismo título normalizado (minúsculas y sin
 * tildes). Devuelve los juegos que coinciden, en el orden del documento.
 * @param {import('./schema.js').Doc} doc
 * @param {{ title: string, igdbId?: number }} candidate
 * @returns {import('./schema.js').Game[]}
 */
export function findDuplicates(doc, { title, igdbId }) {
  const norm = normalizeText(title.trim());
  return doc.games.filter((game) => {
    if (igdbId != null && game.igdbId === igdbId) return true;
    return norm !== '' && normalizeText(game.title.trim()) === norm;
  });
}

/**
 * @param {import('./schema.js').Game[]} games
 * @returns {string[]} etiquetas propias únicas, orden alfabético es
 */
function tagsOfGames(games) {
  return uniqueSorted(games.flatMap((g) => g.tags ?? []));
}

/**
 * @param {import('./schema.js').Game[]} games
 * @returns {{id: number, name: string}[]} géneros únicos por id, por nombre
 */
function genresOfGames(games) {
  return uniqueByKeySorted(games.flatMap((g) => g.genres ?? []));
}

/**
 * Plataformas del catálogo de los juegos (`platforms[]`); excluye las propias
 * (`id: null`), que solo existen en jugadas.
 * @param {import('./schema.js').Game[]} games
 * @returns {{id: number, name: string}[]}
 */
function platformsOfGames(games) {
  return uniqueByKeySorted(games.flatMap((g) => g.platforms ?? []));
}

/**
 * @param {import('./schema.js').Doc} doc
 * @returns {string[]} etiquetas propias únicas, orden alfabético es
 */
export function allTags(doc) {
  return tagsOfGames(doc.games);
}

/**
 * @param {import('./schema.js').Doc} doc
 * @returns {{id: number, name: string}[]} géneros únicos por id, por nombre
 */
export function allGenres(doc) {
  return genresOfGames(doc.games);
}

/**
 * Plataformas del catálogo del juego (`platforms[]`); excluye las propias
 * (`id: null`), que solo existen en jugadas.
 * @param {import('./schema.js').Doc} doc
 * @returns {{id: number, name: string}[]}
 */
export function allPlatforms(doc) {
  return platformsOfGames(doc.games);
}

/**
 * Chips de las filas de filtros para una lista de juegos: solo nombres.
 * @param {import('./schema.js').Game[]} games
 * @returns {{ genres: string[], platforms: string[], tags: string[] }}
 */
export function chipsForGames(games) {
  return {
    genres: genresOfGames(games).map((g) => g.name),
    platforms: platformsOfGames(games).map((p) => p.name),
    tags: tagsOfGames(games),
  };
}

/**
 * Chips de las filas de filtros para el documento actual: solo nombres.
 * @param {import('./schema.js').Doc} doc
 * @returns {{ genres: string[], platforms: string[], tags: string[] }}
 */
export function chipsForDoc(doc) {
  return chipsForGames(doc.games);
}

/**
 * @param {string[]} items
 * @returns {string[]}
 */
function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * @param {{id: number, name: string}[]} items
 * @returns {{id: number, name: string}[]}
 */
function uniqueByKeySorted(items) {
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Segundos de pared del tramo en marcha de un Contador, desde su ancla hasta
 * `now` (entero, sin tope: lo revisa el usuario). Único cálculo compartido por
 * el motor (src/data/library.js), la Ficha y el Aviso.
 * @param {import('./schema.js').CounterAnchor} counter
 * @param {Date} now
 * @returns {number}
 */
export function counterElapsedSeconds(counter, now) {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(counter.startedAt)) / 1000));
}

/**
 * Total vivo de una jugada: Tiempo jugado consolidado más el tramo en marcha
 * si el Contador está anclado a su juego y jugada. Cálculo efímero: el Doc
 * nunca se escribe por segundo.
 * @param {import('./schema.js').Play} play
 * @param {import('./schema.js').CounterAnchor|null|undefined} counter ancla del Doc
 * @param {Date} now
 * @returns {number}
 */
export function livePlaySeconds(play, counter, now) {
  const base = play.playedSeconds ?? 0;
  if (!counter) return base;
  const elapsed =
    counter.playId === play.id ? counterElapsedSeconds(counter, now) : 0;
  return base + elapsed;
}

/**
 * Tramos pendientes de revisión de toda la Biblioteca.
 * @param {import('./schema.js').Doc} doc
 * @returns {number}
 */
export function pendingSegmentCount(doc) {
  let total = 0;
  for (const game of doc.games) {
    for (const play of game.plays) total += play.pendingSegments?.length ?? 0;
  }
  return total;
}

/**
 * Primer juego del Doc con algún Tramo pendiente (orden del documento): el que
 * abre el Aviso cuando no hay Contador en marcha.
 * @param {import('./schema.js').Doc} doc
 * @returns {import('./schema.js').Game|null}
 */
export function firstPendingGame(doc) {
  return (
    doc.games.find((game) => game.plays.some((play) => (play.pendingSegments?.length ?? 0) > 0)) ??
    null
  );
}
