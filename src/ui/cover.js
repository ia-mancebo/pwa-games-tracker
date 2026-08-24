/**
 * Portadas de juego (ticket 14): imagen remota cacheable o placeholder con
 * iniciales sobre un degradado estable derivado del id del juego.
 */
import { html } from '../lib/dom.js';

/**
 * Tono HSL estable para un id (hash polinomial simple; mismo id → mismo tono).
 * @param {string} id
 * @returns {number}
 */
export function hueFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * Iniciales del título: primera letra de las dos primeras palabras.
 * @param {string} title
 * @returns {string}
 */
export function titleInitials(title) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * Marcado de la portada. La variante `mini` (46 px) se usa en filas del Panel.
 * Devuelve STRING con marcado de confianza: componer con raw() dentro de html`.
 * @param {import('../domain/schema.js').Game} game
 * @param {{ mini?: boolean }} [opts]
 * @returns {string}
 */
export function coverHtml(game, { mini = false } = {}) {
  const cls = mini ? 'cover mini' : 'cover';
  if (game.coverUrl) {
    return html`<span class="${cls}"><img loading="lazy" src="${game.coverUrl}" alt="" /></span>`;
  }
  const hue = hueFromId(game.id);
  const hueAlt = (hue + 42) % 360;
  return html`<span class="${cls}" style="--c1:hsl(${hue} 46% 40%);--c2:hsl(${hueAlt} 54% 19%)"
    ><b>${titleInitials(game.title)}</b></span
  >`;
}

/**
 * Estrellas de valoración (1–5); guión si no hay nota.
 * @param {number|null} rating
 * @returns {string}
 */
export function starsHtml(rating) {
  if (rating == null) return html`<span class="stars muted">—</span>`;
  return html`<span class="stars">${'★'.repeat(rating)}<span class="off">${'☆'.repeat(5 - rating)}</span></span>`;
}
