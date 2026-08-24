/**
 * Búsqueda y filtros compartidos por estantería y panel (ticket 15, spec
 * §8.3). Módulo puro: sin DOM, sin IDB, sin reloj.
 */

/**
 * Filtros activos de la biblioteca; cada dimensión es un único valor o null.
 * @typedef {{
 *   query: string,
 *   genre: string|null,
 *   platform: string|null,
 *   tag: string|null,
 * }} Filters
 */

/**
 * Minúsculas y sin diacríticos: «Pokémon» y «POKÉMON» pasan a ser «pokemon».
 * @param {string} s
 * @returns {string}
 */
export function normalizeText(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿Coincide el juego con la consulta? Pajar = título + etiquetas propias +
 * nombres de géneros + nombres de plataformas. Consulta vacía o de espacios
 * coincide con todo.
 * @param {import('./schema.js').Game} game
 * @param {string} query
 * @returns {boolean}
 */
export function gameMatchesQuery(game, query) {
  const q = normalizeText(query).trim();
  if (!q) return true;
  const haystack = [
    game.title,
    ...(game.tags ?? []),
    ...(game.genres ?? []).map((g) => g.name),
    ...(game.platforms ?? []).map((p) => p.name),
  ].join(' ');
  return normalizeText(haystack).includes(q);
}

/**
 * Filtra juegos acumulando dimensiones con Y lógico: búsqueda textual más
 * género/plataforma por nombre y etiqueta propia por cadena; una dimensión
 * null no filtra.
 * @param {import('./schema.js').Game[]} games
 * @param {Partial<Filters>} [filters]
 * @returns {import('./schema.js').Game[]}
 */
export function filterGames(games, { query = '', genre = null, platform = null, tag = null } = {}) {
  return games.filter((game) => {
    if (!gameMatchesQuery(game, query)) return false;
    if (genre != null && !(game.genres ?? []).some((g) => g.name === genre)) return false;
    if (platform != null && !(game.platforms ?? []).some((p) => p.name === platform)) return false;
    if (tag != null && !(game.tags ?? []).includes(tag)) return false;
    return true;
  });
}
