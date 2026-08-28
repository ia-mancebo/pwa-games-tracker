/**
 * Pasarela de Alta desde la Fuente de datos (ticket 04, spec §8.4 y §8.6):
 * el ÚNICO lugar que moldea un juego de la Fuente para la Biblioteca. Los
 * dos caminos de alta consumen estas funciones — el mapeo Fuente → input
 * del repositorio y el moldeado a Juego para el render de carátula — para
 * que los datos compartidos se conserven con las mismas reglas. Módulo
 * puro: sin DOM, sin IDB, sin reloj.
 */
import { splitCommaList } from '../lib/list.js';

/**
 * Datos compartidos de un juego de la Fuente que pueden viajar a la
 * Biblioteca: el mapeo conserva los presentes y omite los ausentes.
 * @typedef {{
 *   igdbId?: number,
 *   title: string,
 *   coverUrl?: string | null,
 *   description?: string | null,
 *   genres?: {id:number,name:string}[],
 *   platforms?: {id:number,name:string}[],
 *   screenshots?: string[],
 * }} SourceGame
 */

/**
 * Mapea un juego de la Fuente (+ Estado inicial y etiquetas en bruto) al
 * input de alta del repositorio (data/library.js addGame), conservando SOLO
 * los datos compartidos presentes: carátula si viene declarada, el resto si
 * trae contenido — campo ausente = desconocido (spec §4).
 * El Estado por defecto es Quiero jugar (backlog).
 * @param {SourceGame} game
 * @param {{ status?: import('./schema.js').Status, tagsRaw?: string, today: string }} opts
 * @returns {Parameters<import('../data/library.js').addGame>[0]}
 */
export function mapSourceToAddInput(game, { status, tagsRaw = '', today }) {
  const tags = splitCommaList(tagsRaw);
  /** @type {Parameters<import('../data/library.js').addGame>[0]} */
  const payload = {
    title: game.title,
    status: status ?? 'backlog',
    today,
  };
  if (tags.length > 0) payload.tags = tags;
  if (game.igdbId != null) payload.igdbId = game.igdbId;
  if (game.coverUrl != null) payload.coverUrl = game.coverUrl;
  if (game.description) payload.description = game.description;
  if ((game.genres ?? []).length > 0) payload.genres = game.genres;
  if ((game.platforms ?? []).length > 0) payload.platforms = game.platforms;
  if ((game.screenshots ?? []).length > 0) payload.screenshots = game.screenshots;
  return payload;
}

/**
 * Moldeado a Juego mínimo para el render de carátula (ui/cover.js): el id
 * deriva de la Fuente y la portada solo viaja si es truthy (coverHtml ignora
 * los falsy, así que el spread condicional es indiferente al valor).
 * @param {SourceGame} game
 * @returns {import('./schema.js').Game}
 */
export function toCoverGame(game) {
  return {
    id: `igdb-${game.igdbId}`,
    title: game.title,
    ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}),
    plays: [],
  };
}
