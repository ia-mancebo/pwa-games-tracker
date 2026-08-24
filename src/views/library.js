/**
 * Biblioteca navegable (ticket 14): Estantería con baldas por Estado del
 * juego —placa clicable, máximo 6 portadas y «+N más»— y Panel denso del
 * estado abierto, paginado en bloques de 100 (spec §8.1/§8.2). La búsqueda y
 * los filtros son el ticket 15; el clic sobre portada/fila abrirá la Ficha
 * (ticket 17).
 */
import { html, raw } from '../lib/dom.js';
import { STATUSES, STATUS_LABELS } from '../domain/schema.js';
import { gameRating, shelfData } from '../domain/selectors.js';
import { formatAvg } from '../lib/format.js';
import { coverHtml, starsHtml } from '../ui/cover.js';

/** Portadas visibles por balda antes de la tarjeta «+N más» (spec §8.1). */
const SHELF_LIMIT = 6;

/** Tamaño de los bloques de paginación del panel (spec §8.2). */
const PANEL_PAGE = 100;

/**
 * Filas visibles del panel abierto. Estado local de la vista: se reinicia
 * cada vez que se abre un panel.
 * @type {number}
 */
let panelShown = PANEL_PAGE;

/** @typedef {ReturnType<typeof shelfData>[number]} Shelf */

/**
 * @param {string|null} value
 * @returns {value is import('../domain/schema.js').Status}
 */
function isStatus(value) {
  return (
    typeof value === 'string' &&
    STATUSES.includes(/** @type {import('../domain/schema.js').Status} */ (value))
  );
}

/**
 * Abre el Panel de un estado, reiniciando su paginación.
 * @param {import('../app.js').Store} store
 * @param {import('../domain/schema.js').Status} status
 */
function openPanel(store, status) {
  panelShown = PANEL_PAGE;
  store.set({ library: { view: 'panel', panelStatus: status } });
}

/**
 * Vuelve del Panel a la Estantería.
 * @param {import('../app.js').Store} store
 */
function backToShelves(store) {
  store.set({ library: { view: 'shelves', panelStatus: null } });
}

/**
 * Tarjeta de portada de una balda. El clic abrirá la Ficha (ticket 17); hoy
 * es un no-op con el id ya en el marcado.
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function coverCardHtml(game) {
  return html`<button type="button" class="card" data-game-id="${game.id}" title="${game.title}">
    ${raw(coverHtml(game))}<span class="cap">${raw(starsHtml(gameRating(game)))}</span>
  </button>`;
}

/**
 * Tarjeta «+N más»: abre el Panel del estado.
 * @param {Shelf} shelf
 * @returns {string}
 */
function moreCardHtml(shelf) {
  return html`<button type="button" class="card more" data-open-panel="${shelf.status}">
    +${shelf.count - SHELF_LIMIT} más
  </button>`;
}

/**
 * @param {Shelf} shelf
 * @returns {string}
 */
function shelfHtml(shelf) {
  const visible = shelf.games.slice(0, SHELF_LIMIT);
  const rest = shelf.count - visible.length;
  return html`<section class="shelf">
    <button
      type="button"
      class="plate"
      style="--sc:var(--st-${shelf.status})"
      data-open-panel="${shelf.status}"
    >
      <b>${shelf.label}</b>
      <span>${shelf.count} · ★ ${formatAvg(shelf.avgRating)}</span>
    </button>
    <div class="row">
      ${visible.map((game) => raw(coverCardHtml(game)))}
      ${rest > 0 ? raw(moreCardHtml(shelf)) : ''}
      ${shelf.count === 0 ? raw('<p class="row-empty">Sin juegos todavía.</p>') : ''}
    </div>
  </section>`;
}

/**
 * Fila densa del panel: portada mini, título con etiquetas propias,
 * plataformas, valoración y píldora de estado. El clic abrirá la Ficha
 * (ticket 17).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Status} status
 * @returns {string}
 */
function panelRowHtml(game, status) {
  const platforms = (game.platforms ?? []).map((p) => p.name).join(', ');
  const tags = game.tags ?? [];
  return html`<div class="b-row" data-game-id="${game.id}">
    ${raw(coverHtml(game, { mini: true }))}
    <span class="b-cell">
      <span class="b-title">${game.title}</span>
      ${tags.map((tag) => raw(html`<span class="tag-mini own">#${tag}</span>`))}
    </span>
    <span class="b-cell b-col-pf mono">${platforms}</span>
    <span class="b-cell b-col-stars">${raw(starsHtml(gameRating(game)))}</span>
    <span class="b-cell"><span class="pill st-${status}">${STATUS_LABELS[status]}</span></span>
  </div>`;
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @param {import('../domain/schema.js').Status|null} panelStatus
 * @returns {string}
 */
function panelHtml(doc, panelStatus) {
  const games = shelfData(doc).find((s) => s.status === panelStatus)?.games ?? [];
  const visible = games.slice(0, panelShown);
  const remaining = games.length - visible.length;
  return html`<div class="fade">
    <div class="toolbar">
      <button type="button" class="chip" data-back-shelves>← Estantería</button>
      <strong>${panelStatus != null ? STATUS_LABELS[panelStatus] : ''}</strong>
    </div>
    <div class="cardbox tight">
      <div class="b-thead">
        <span></span><span>Juego</span><span class="b-col-pf">Plataformas</span
        ><span class="b-col-stars">Valoración</span><span>Estado</span>
      </div>
      ${panelStatus != null ? visible.map((g) => raw(panelRowHtml(g, panelStatus))) : ''}
      ${visible.length === 0 ? raw(html`<p class="empty">Nada por aquí todavía.</p>`) : ''}
      ${remaining > 0
        ? raw(
            html`<div class="panel-more">
              <button type="button" class="chip" data-load-more>Cargar más</button>
            </div>`,
          )
        : ''}
    </div>
  </div>`;
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {string}
 */
function shelvesHtml(doc) {
  return html`<div class="fade">
    <header class="view-head">
      <h1>Biblioteca</h1>
      <p class="sub">Tu estantería: una balda por Estado del juego.</p>
    </header>
    <div class="shelves">${shelfData(doc).map((s) => raw(shelfHtml(s)))}</div>
  </div>`;
}

/**
 * Delegación de clics sobre la superficie recién renderizada; el wrapper es
 * nuevo en cada render, así no se acumulan listeners entre renders.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
function wire(container, store) {
  const surface = container.firstElementChild;
  if (!surface) return;
  surface.addEventListener('click', (e) => {
    const target =
      e.target instanceof HTMLElement
        ? e.target.closest('[data-back-shelves],[data-load-more],[data-open-panel]')
        : null;
    if (!target) return;
    if (target.hasAttribute('data-back-shelves')) {
      backToShelves(store);
      return;
    }
    if (target.hasAttribute('data-load-more')) {
      panelShown += PANEL_PAGE;
      render(container, store);
      return;
    }
    const status = target.getAttribute('data-open-panel');
    if (isStatus(status)) openPanel(store, status);
  });
}

/**
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
export function render(container, store) {
  const state = store.get();
  const doc = state.doc;
  if (!doc) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML =
    state.library.view === 'panel' ? panelHtml(doc, state.library.panelStatus) : shelvesHtml(doc);
  wire(container, store);
}
