/**
 * Etiquetas propias (CONTEXT.md: categoría personal creada por el usuario):
 * marcado de chips y edición contra el motor de la Ficha. Módulo profundo: la
 * Ficha y el Panel no saben cómo se pintan ni se mutan las etiquetas; la vista
 * solo envuelve el resultado en su sección (`<section class="d-sec">`).
 */
import { html, raw } from '../lib/dom.js';
import { addTag as addTagCommand, removeTag as removeTagCommand } from '../data/ficha.js';

/**
 * Chip `.tag-mini.own` de una etiqueta; con `editable` añade su ×.
 * @param {string} tag
 * @param {boolean} editable
 * @returns {string}
 */
function chipHtml(tag, editable) {
  return editable
    ? html`<span class="tag-mini own"
        >#${tag}
        <button type="button" class="tag-x" data-tag-remove="${tag}" aria-label="Quitar ${tag}">
          ×
        </button></span
      >`
    : html`<span class="tag-mini own">#${tag}</span>`;
}

/**
 * Chips de solo lectura del Panel: uno `.tag-mini.own` con `#` por etiqueta.
 * @param {string[]} tags
 * @returns {string}
 */
export function tagChipsHtml(tags) {
  return html`<span class="tag-list">${tags.map((tag) => chipHtml(tag, false))}</span>`;
}

/**
 * Editor de la Ficha: chips con botón × por etiqueta más el campo para añadir
 * (Enter). Sin etiquetas: pista «Sin etiquetas todavía.», campo siempre.
 * @param {string[]} tags
 * @returns {string}
 */
export function tagEditorHtml(tags) {
  const chips =
    tags.length === 0
      ? raw('<span class="d-meta">Sin etiquetas todavía.</span>')
      : html`<div class="tag-list">${tags.map((tag) => chipHtml(tag, true))}</div>`;
  return html`<div class="tag-edit">
    ${chips}
    <input
      type="text"
      class="tag-add"
      data-tag-add
      placeholder="añadir…"
      aria-label="Añadir etiqueta propia"
    />
  </div>`;
}

/**
 * Añade una etiqueta propia escrita en el campo: recorta, limpia el campo y,
 * si queda algo, la encola contra la biblioteca vía el comando del motor de
 * la Ficha. Sin deduplicar (igual que el editor anterior). Devuelve la
 * promesa del comando, o undefined si no hay nada que añadir.
 * @param {import('../domain/schema.js').Game} game
 * @param {HTMLInputElement} input
 * @returns {Promise<import('../data/ficha.js').Result | undefined>}
 */
export async function addTag(game, input) {
  const tag = input.value.trim();
  input.value = '';
  if (!tag) return;
  return addTagCommand(game.id, tag);
}

/**
 * Quita la etiqueta indicada vía el comando del motor de la Ficha; la lista
 * resultante se escribe tal cual. Devuelve la promesa.
 * @param {import('../domain/schema.js').Game} game
 * @param {string} tag
 * @returns {Promise<import('../data/ficha.js').Result>}
 */
export async function removeTag(game, tag) {
  return removeTagCommand(game.id, tag);
}
