/**
 * Selectores puros sobre el documento: Estado del juego, orden, medias,
 * baldas y listas para filtros. Sin DOM, sin IDB, sin reloj.
 */
import { STATUS_LABELS } from './schema.js';

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
 * @param {import('./schema.js').Doc} doc
 * @returns {string[]} etiquetas propias únicas, orden alfabético es
 */
export function allTags(doc) {
  return uniqueSorted(doc.games.flatMap((g) => g.tags ?? []));
}

/**
 * @param {import('./schema.js').Doc} doc
 * @returns {{id: number, name: string}[]} géneros únicos por id, por nombre
 */
export function allGenres(doc) {
  return uniqueByKeySorted(doc.games.flatMap((g) => g.genres ?? []));
}

/**
 * Plataformas del catálogo del juego (`platforms[]`); excluye las propias
 * (`id: null`), que solo existen en jugadas.
 * @param {import('./schema.js').Doc} doc
 * @returns {{id: number, name: string}[]}
 */
export function allPlatforms(doc) {
  return uniqueByKeySorted(doc.games.flatMap((g) => g.platforms ?? []));
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
