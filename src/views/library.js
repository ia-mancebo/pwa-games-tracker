/**
 * Biblioteca navegable (tickets 14–17): Estantería con baldas por Estado del
 * juego y Panel denso del estado abierto, con la barra común de búsqueda y
 * filtros (tres filas de chips) compartida por ambas vistas (spec §8.1–§8.3).
 * El clic sobre portada/fila abre la Ficha (ticket 17), que sustituye a ambas
 * dentro de la misma superficie.
 */
import { html, qs, raw } from '../lib/dom.js';
import { STATUSES, STATUS_LABELS } from '../domain/schema.js';
import { gameRating, shelfData } from '../domain/selectors.js';
import { filterGames } from '../domain/search.js';
import { chipsForDoc } from '../domain/selectors.js';
import { debounce } from '../lib/debounce.js';
import { formatAvg } from '../lib/format.js';
import { coverHtml, starsHtml } from '../ui/cover.js';
import { statusPillHtml } from '../ui/pill.js';
import { chipRowHtml } from '../ui/chips.js';
import { openAddSheet } from './addSheet.js';
import { openGame, renderGame } from './game.js';

/** Portadas visibles por balda antes de la tarjeta «+N más» (spec §8.1). */
const SHELF_LIMIT = 6;

/** Tamaño de los bloques de paginación del panel (spec §8.2). */
const PANEL_PAGE = 100;

/** Retardo del buscador (spec §8.3). */
const QUERY_DEBOUNCE_MS = 150;

/**
 * Filas visibles del panel abierto. Estado local de la vista: se reinicia al
 * abrir un panel o al cambiar búsqueda/filtros.
 * @type {number}
 */
let panelShown = PANEL_PAGE;

/** Mensaje vacío cuando hay búsqueda o filtros activos sin coincidencias. */
const NO_RESULTS =
  '<p class="empty"><b>Sin resultados</b> Prueba con otro término o quita algún filtro.</p>';

/** Botón fijo de Alta (spec §8.4): presente en estantería y panel. */
function fabHtml() {
  return html`<button type="button" class="fab" data-add-game>➕ Añadir juego</button>`;
}

/** @typedef {ReturnType<typeof shelfData>[number]} Shelf */

/** Etiquetas accesibles de cada dimensión de chips. @type {Record<'genre'|'platform'|'tag', string>} */
const DIM_LABELS = { genre: 'Género', platform: 'Plataforma', tag: 'Etiqueta propia' };

/**
 * Compromiso de la consulta con debounce compartido entre renders: relanza el
 * temporizador en cada pulsación y escribe en el store 150 ms después.
 */
const commitQuery = debounce(
  /**
   * @param {import('../app.js').Store} store
   * @param {string} value
   */
  (store, value) => {
    panelShown = PANEL_PAGE;
    store.set({ library: { ...store.get().library, query: value } });
  },
  QUERY_DEBOUNCE_MS
);

/**
 * Filtros normalizados del estado de biblioteca, tolerando campos ausentes.
 * @param {{ query?: string, genre?: string|null, platform?: string|null, tag?: string|null }} lib
 * @returns {import('../domain/search.js').Filters}
 */
function normFilters(lib) {
  return {
    query: lib.query ?? '',
    genre: lib.genre ?? null,
    platform: lib.platform ?? null,
    tag: lib.tag ?? null,
  };
}

/**
 * ¿Hay búsqueda o algún filtro activo? Decide ocultar baldas vacías y el
 * mensaje «Sin resultados».
 * @param {import('../domain/search.js').Filters} f
 */
function hasActiveFilters(f) {
  return f.query.trim() !== '' || f.genre != null || f.platform != null || f.tag != null;
}

/**
 * Abre el Panel de un estado, reiniciando su paginación; conserva filtros.
 * @param {import('../app.js').Store} store
 * @param {import('../domain/schema.js').Status} status
 */
function openPanel(store, status) {
  panelShown = PANEL_PAGE;
  store.set({ library: { ...store.get().library, view: 'panel', panelStatus: status } });
}

/**
 * Vuelve del Panel a la Estantería; conserva filtros.
 * @param {import('../app.js').Store} store
 */
function backToShelves(store) {
  store.set({ library: { ...store.get().library, view: 'shelves', panelStatus: null } });
}

/**
 * Abre la Ficha de un juego (ticket 17): conserva la vista y los filtros
 * activos para que «← Volver» regrese a la superficie previa.
 * @param {import('../app.js').Store} store
 * @param {string} gameId
 */
function openFicha(store, gameId) {
  openGame(store, gameId);
}

/**
 * Activa/desactiva una dimensión de filtro: selección única por dimensión
 * (tocar el chip activo lo quita); resetea la paginación del panel.
 * @param {import('../app.js').Store} store
 * @param {'genre'|'platform'|'tag'} dim
 * @param {string} value
 */
function toggleFilter(store, dim, value) {
  const lib = store.get().library;
  const current = dim === 'genre' ? lib.genre : dim === 'platform' ? lib.platform : lib.tag;
  const patch = { ...lib };
  if (dim === 'genre') patch.genre = current === value ? null : value;
  else if (dim === 'platform') patch.platform = current === value ? null : value;
  else patch.tag = current === value ? null : value;
  panelShown = PANEL_PAGE;
  store.set({ library: patch });
}

/**
 * @template T
 * @param {T|null|undefined} v
 * @returns {T}
 */
function need(v) {
  if (v == null) throw new Error('valor ausente');
  return v;
}

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
 * Buscador de la barra común. El `value` restaura la consulta tras re-render.
 * @param {string} query
 * @returns {string}
 */
function searchBoxHtml(query) {
  return html`<input class="search" placeholder="Buscar…" value="${query}" aria-label="Buscar" />`;
}

/**
 * Tres filas de chips bajo el buscador; una fila no se pinta si está vacía
 * (la de etiquetas desaparece sin etiquetas propias).
 * @param {ReturnType<typeof chipsForDoc>} chips
 * @param {import('../domain/search.js').Filters} f
 * @returns {string}
 */
function filtersHtml(chips, f) {
  return html`<div class="filters">
    ${chips.genres.length > 0
      ? chipRowHtml({ dim: 'genre', label: DIM_LABELS.genre, values: chips.genres, active: f.genre })
      : ''}${chips.platforms.length > 0
      ? chipRowHtml({
            dim: 'platform',
            label: DIM_LABELS.platform,
            values: chips.platforms,
            active: f.platform,
          })
      : ''}${chips.tags.length > 0
      ? chipRowHtml({ dim: 'tag', label: DIM_LABELS.tag, values: chips.tags, active: f.tag })
      : ''}
  </div>`;
}

/**
 * Tarjeta de portada de una balda; el clic abre la Ficha (ticket 17).
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function coverCardHtml(game) {
  return html`<button type="button" class="card" data-game-id="${game.id}" title="${game.title}">
    ${coverHtml(game)}<span class="cap">${starsHtml(gameRating(game))}</span>
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
      ${visible.map((game) => coverCardHtml(game))} ${rest > 0 ? moreCardHtml(shelf) : ''}
      ${shelf.count === 0 ? raw('<p class="row-empty">Sin juegos todavía.</p>') : ''}
    </div>
  </section>`;
}

/**
 * Fila densa del panel: portada mini, título con etiquetas propias,
 * plataformas, valoración y píldora de estado; el clic abre la Ficha
 * (ticket 17).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Status} status
 * @returns {string}
 */
function panelRowHtml(game, status) {
  const platforms = (game.platforms ?? []).map((p) => p.name).join(', ');
  const tags = game.tags ?? [];
  return html`<div class="b-row" data-game-id="${game.id}">
    ${coverHtml(game, { mini: true })}
    <span class="b-cell">
      <span class="b-title">${game.title}</span>
      ${tags.map((tag) => html`<span class="tag-mini own">#${tag}</span>`)}
    </span>
    <span class="b-cell b-col-pf mono">${platforms}</span>
    <span class="b-cell b-col-stars">${starsHtml(gameRating(game))}</span>
    <span class="b-cell">${statusPillHtml(status)}</span>
  </div>`;
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @param {import('../app.js').LibraryState} lib
 * @returns {string}
 */
function panelHtml(doc, lib) {
  const f = normFilters(lib);
  const status = lib.panelStatus;
  // Filtra dentro del estado abierto; el orden recencia se conserva.
  const games = filterGames(shelfData(doc).find((s) => s.status === status)?.games ?? [], f);
  const visible = games.slice(0, panelShown);
  const remaining = games.length - visible.length;
  const empty =
    visible.length > 0
      ? ''
      : hasActiveFilters(f)
        ? NO_RESULTS
        : '<p class="empty">Nada por aquí todavía.</p>';
  return html`<div class="fade">
    <div class="toolbar">
      <button type="button" class="chip" data-back-shelves>← Estantería</button>
      <strong>${status != null ? STATUS_LABELS[status] : ''}</strong>
      ${searchBoxHtml(f.query)} ${filtersHtml(chipsForDoc(doc), f)}
    </div>
    <div class="cardbox tight">
      <div class="b-thead">
        <span></span><span>Juego</span><span class="b-col-pf">Plataformas</span
        ><span class="b-col-stars">Valoración</span><span>Estado</span>
      </div>
      ${status != null ? visible.map((g) => panelRowHtml(g, status)) : ''}
      ${empty ? raw(empty) : ''}
      ${
        remaining > 0
          ? html`<div class="panel-more">
                <button type="button" class="chip" data-load-more>Cargar más</button>
              </div>`
          : ''
      }
    </div>
    ${fabHtml()}
  </div>`;
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @param {import('../app.js').LibraryState} lib
 * @returns {string}
 */
function shelvesHtml(doc, lib) {
  const f = normFilters(lib);
  const active = hasActiveFilters(f);
  // Filtra dentro de cada balda: conteo y media ★ recomputan sobre la lista
  // filtrada; las baldas sin resultados se ocultan con filtros activos.
  const all = shelfData({ ...doc, games: filterGames(doc.games, f) });
  const shelves = active ? all.filter((s) => s.count > 0) : all;
  return html`<div class="fade">
    <header class="view-head">
      <h1>Biblioteca</h1>
      <p class="sub">Tu estantería: una balda por Estado del juego.</p>
    </header>
    <div class="toolbar">
      ${searchBoxHtml(f.query)} ${filtersHtml(chipsForDoc(doc), f)}
    </div>
    ${
      shelves.length > 0
        ? html`<div class="shelves">${shelves.map((s) => shelfHtml(s))}</div>`
        : raw(NO_RESULTS)
    }
    ${fabHtml()}
  </div>`;
}

/**
 * Delegación de clics e inputs sobre la superficie recién renderizada; el
 * wrapper es nuevo en cada render, así no se acumulan listeners entre renders.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
function wire(container, store) {
  const surface = container.firstElementChild;
  if (!surface) return;
  surface.addEventListener('click', (e) => {
    const target =
      e.target instanceof HTMLElement
        ? e.target.closest(
            '[data-back-shelves],[data-load-more],[data-open-panel],[data-f-genre],[data-f-platform],[data-f-tag],[data-add-game],[data-game-id]'
          )
        : null;
    if (!target) return;
    if (target.hasAttribute('data-back-shelves')) {
      backToShelves(store);
      return;
    }
    if (target.hasAttribute('data-add-game')) {
      openAddSheet();
      return;
    }
    if (target.hasAttribute('data-game-id')) {
      // Portada de balda o fila del panel → Ficha del juego (ticket 17).
      openFicha(store, need(target.getAttribute('data-game-id')));
      return;
    }
    if (target.hasAttribute('data-load-more')) {
      panelShown += PANEL_PAGE;
      render(container, store);
      return;
    }
    for (const dim of /** @type {const} */ (['genre', 'platform', 'tag'])) {
      const attr = `data-f-${dim}`;
      if (target.hasAttribute(attr)) {
        toggleFilter(store, dim, need(target.getAttribute(attr)));
        return;
      }
    }
    const status = target.getAttribute('data-open-panel');
    if (isStatus(status)) openPanel(store, status);
  });
  surface.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || !e.target.classList.contains('search')) return;
    commitQuery(store, e.target.value);
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

  // Ficha abierta: sustituye a estantería y panel dentro de la misma
  // superficie (ticket 17); el buscador no existe aquí.
  if (state.library.gameId != null) {
    renderGame(container, store);
    return;
  }

  // El buscador debe conservar foco y cursor entre renders (el DOM se
  // reescribe en cada cambio de estado).
  const prevSearch = qs('.search', container);
  const hadFocus = prevSearch instanceof HTMLInputElement && document.activeElement === prevSearch;
  const caret = hadFocus ? (prevSearch.selectionStart ?? prevSearch.value.length) : 0;

  container.innerHTML =
    state.library.view === 'panel'
      ? panelHtml(doc, state.library)
      : shelvesHtml(doc, state.library);
  wire(container, store);

  if (hadFocus) {
    const search = qs('.search', container);
    if (search instanceof HTMLInputElement) {
      search.focus();
      const pos = Math.min(caret, search.value.length);
      search.setSelectionRange(pos, pos);
    }
  }
}
