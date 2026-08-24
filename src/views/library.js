/**
 * Estantería de la Biblioteca (ticket 13): una balda por Estado del juego en
 * solo lectura — placa con etiqueta, conteo y media ★, más lista simple de
 * títulos. Portadas y Panel llegan en el ticket 14.
 */
import { html, raw } from '../lib/dom.js';
import { gameRating, shelfData } from '../domain/selectors.js';
import { formatAvg } from '../lib/format.js';

/** @typedef {ReturnType<typeof shelfData>[number]} Shelf */

/**
 * @param {number} rating
 * @returns {string}
 */
function starsHtml(rating) {
  const full = '★'.repeat(rating);
  const off = '☆'.repeat(5 - rating);
  return html`<span class="stars">${full}<span class="off">${off}</span></span>`;
}

/**
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function gameItemHtml(game) {
  const rating = gameRating(game);
  return html`<li class="shelf-item">
    <span class="shelf-title">${game.title}</span>
    ${rating != null ? raw(starsHtml(rating)) : ''}
  </li>`;
}

/**
 * @param {Shelf} shelf
 * @returns {string}
 */
function shelfHtml(shelf) {
  return html`<section class="shelf">
    <div class="plate" style="--sc:var(--st-${shelf.status})">
      <b>${shelf.label}</b>
      <span>${shelf.count} · ★ ${formatAvg(shelf.avgRating)}</span>
    </div>
    ${shelf.games.length ? raw(html`<ul class="shelf-list">${shelf.games.map((g) => raw(gameItemHtml(g)))}</ul>`) : ''}
  </section>`;
}

/**
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
export function render(container, store) {
  const doc = store.get().doc;
  if (!doc) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = html`<div class="fade">
    <header class="view-head">
      <h1>Biblioteca</h1>
      <p class="sub">Tu estantería: una balda por Estado del juego.</p>
    </header>
    <div class="shelves">${shelfData(doc).map((s) => raw(shelfHtml(s)))}</div>
  </div>`;
}
