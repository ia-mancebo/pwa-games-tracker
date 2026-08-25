/**
 * Agregaciones del dashboard de estadísticas (ticket 24, spec §8.7). Módulo
 * puro: sin DOM, sin IDB, sin reloj — el instante `now` llega por parámetro.
 *
 * Semántica de recuento: los juegos cuentan una vez cada uno según su
 * «Estado del juego» (jugada más reciente); las distribuciones por plataforma
 * usan solo el catálogo del juego (`platforms[]`, nunca las propias con
 * `id: null` que viven en jugadas); género y etiqueta cuentan un juego en
 * cada uno que tenga; los terminados por mes cuentan jugadas.
 */
import { STATUSES } from './schema.js';
import { filterGames } from './search.js';
import { gameStatus, gameRating, avgRatingOfGames, chipsForDoc } from './selectors.js';

/** Filtros del dashboard: un valor por dimensión, null = sin filtrar. @typedef {{ platform: string|null, genre: string|null, tag: string|null }} StatsFilters */

/** Fila de una distribución. @typedef {{ name: string, count: number }} NameCount */

/**
 * Agregados completos de la vista Estadísticas. `finishedByMonth` son los 12
 * meses incluido el actual, más antiguo primero.
 * @typedef {{
 *   counts: Record<import('./schema.js').Status, number>,
 *   total: number,
 *   avgRating: number|null,
 *   byPlatform: NameCount[],
 *   byGenre: NameCount[],
 *   byTag: NameCount[],
 *   finishedByMonth: { key: string, label: string, count: number }[],
 *   top5: { game: import('./schema.js').Game, rating: number }[],
 * }} Stats
 */

/** Etiquetas cortas de mes para «ago 25». @type {string[]} */
const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Claves YYYY-MM de los 12 meses terminando en el mes de `now` (UTC), más
 * antiguo primero.
 * @param {Date} now
 * @returns {string[]}
 */
function monthWindow(now) {
  const keys = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * @param {string} key clave YYYY-MM
 * @returns {string} etiqueta tipo «ago 25»
 */
function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(-2)}`;
}

/**
 * Cuenta cuántos juegos llevan cada nombre devuelto por `namesOf`; orden desc
 * por conteo con desempate alfabético español.
 * @template T
 * @param {import('./schema.js').Game[]} games
 * @param {(game: import('./schema.js').Game) => T[]} namesOf
 * @param {(item: T) => string} nameOf
 * @returns {NameCount[]}
 */
function tally(games, namesOf, nameOf) {
  const counts = new Map();
  for (const game of games) {
    for (const item of new Set(namesOf(game))) {
      const name = nameOf(item);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Agregados del dashboard sobre el conjunto filtrado.
 * @param {import('./schema.js').Doc} doc
 * @param {StatsFilters} filters plataforma/género por nombre y etiqueta propia por cadena, acumuladas con Y
 * @param {Date} now ancla de la ventana de 12 meses
 * @returns {Stats}
 */
export function computeStats(doc, filters, now) {
  const games = filterGames(doc.games, filters);

  /** @type {Record<import('./schema.js').Status, number>} */
  const counts = { backlog: 0, playing: 0, finished: 0, abandoned: 0 };
  for (const status of STATUSES) counts[status] = 0;
  for (const game of games) counts[gameStatus(game)] += 1;

  const window = monthWindow(now);
  const finished = new Map(window.map((key) => [key, 0]));
  for (const game of games) {
    for (const play of game.plays) {
      if (play.finishedAt == null) continue;
      const key = play.finishedAt.slice(0, 7);
      if (!finished.has(key)) continue;
      finished.set(key, /** @type {number} */ (finished.get(key)) + 1);
    }
  }

  /** @type {{ game: import('./schema.js').Game, rating: number }[]} */
  const ranked = [];
  for (const game of games) {
    const rating = gameRating(game);
    if (rating != null) ranked.push({ game, rating });
  }
  ranked.sort((a, b) => b.rating - a.rating || a.game.title.localeCompare(b.game.title, 'es'));

  return {
    counts,
    total: games.length,
    avgRating: avgRatingOfGames(games),
    byPlatform: tally(
      games,
      (g) => g.platforms ?? [],
      (p) => p.name,
    ),
    byGenre: tally(
      games,
      (g) => g.genres ?? [],
      (g) => g.name,
    ),
    byTag: tally(
      games,
      (g) => g.tags ?? [],
      (t) => t,
    ),
    finishedByMonth: window.map((key) => ({
      key,
      label: monthLabel(key),
      count: /** @type {number} */ (finished.get(key)),
    })),
    top5: ranked.slice(0, 5),
  };
}

/**
 * Opciones de las tres filas de filtros del dashboard (mismas chips que la
 * biblioteca).
 * @param {import('./schema.js').Doc} doc
 * @returns {{ genres: string[], platforms: string[], tags: string[] }}
 */
export function filterOptions(doc) {
  return chipsForDoc(doc);
}
