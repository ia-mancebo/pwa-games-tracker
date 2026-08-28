/**
 * Dashboard de estadísticas (ticket 24, spec §8.7): vista de solo lectura con
 * tres filtros globales (plataforma, género, etiqueta propia) que recompute
 * KPIs, distribuciones, terminados en el tiempo y Top 5 valorado. Único
 * elemento clicable: cada fila del Top 5 abre la Ficha en Biblioteca.
 */
import { html } from '../lib/dom.js';
import { STATUS_LABELS } from '../domain/schema.js';
import { computeStats, filterOptions } from '../domain/stats.js';
import { formatAvg } from '../lib/format.js';
import { coverHtml, starsHtml } from '../ui/cover.js';
import { chipRowHtml } from '../ui/chips.js';
import * as nav from '../navigation.js';

/** Filas visibles por distribución (spec §8.7). */
const BAR_LIMIT = 8;

/** Dimensiones de filtro en orden de pintado. @type {{ key: 'platform'|'genre'|'tag', label: string }[]} */
const DIMENSIONS = [
  { key: 'platform', label: 'Plataforma' },
  { key: 'genre', label: 'Género' },
  { key: 'tag', label: 'Etiqueta propia' },
];

/**
 * Barras horizontales del prototipo variante B: ancho relativo al máximo.
 * @param {{ name: string, count: number }[]} rows
 * @returns {string}
 */
function hbarHtml(rows) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return html`<div class="hbar">${rows.map((r) =>
    html`<div class="hb">
        <span title="${r.name}">${r.name}</span>
        <span class="bar"
          ><i style="width:${r.count === 0 ? 0 : Math.max(4, Math.round((r.count / max) * 100))}%"></i
        ></span>
        <span class="n">${r.count}</span>
      </div>`,
  )}</div>`;
}

/**
 * Cuerpo de un cardbox de distribución: hasta 8 barras o nota sin datos.
 * @param {{ name: string, count: number }[]} rows
 * @returns {string}
 */
function distBodyHtml(rows) {
  if (rows.length === 0) return html`<p class="d-meta">Sin datos.</p>`;
  return hbarHtml(rows.slice(0, BAR_LIMIT));
}

/**
 * @param {string} id identificador para tests y estilos
 * @param {string|number} value
 * @param {string} label
 * @param {string} [accent] clase de color de Estado para el número
 * @returns {string}
 */
function kpiHtml(id, value, label, accent = '') {
  return html`<div class="kpi${accent ? ` ${accent}` : ''}" data-kpi="${id}">
    <span class="num">${value}</span><span class="lbl">${label}</span>
  </div>`;
}

/**
 * Top 5 mejor valorados: portada mini + título + ★; el clic lo resuelve wire().
 * @param {ReturnType<typeof computeStats>['top5']} top
 * @returns {string}
 */
function topSectionHtml(top) {
  return html`<section class="cardbox">
    <h3>Top 5 mejor valorados</h3>
    ${
      top.length === 0
        ? html`<p class="d-meta">Sin valoraciones todavía.</p>`
        : html`<ol class="top-list">${top.map((t) =>
              html`<li>
                <button type="button" class="top-row" data-game-id="${t.game.id}">
                  ${coverHtml(t.game, { mini: true })}
                  <span class="t-title">${t.game.title}</span>
                  ${starsHtml(t.rating)}
                </button>
              </li>`,
            )}</ol>`
    }
  </section>`;
}

/**
 * Cuerpo del dashboard bajo los filtros.
 * @param {import('../domain/schema.js').Doc} doc
 * @param {ReturnType<typeof computeStats>} stats
 * @returns {string}
 */
function bodyHtml(doc, stats) {
  if (doc.games.length === 0) {
    return html`<p class="empty">
      <b>Sin datos todavía</b>Cuando añadas juegos verás aquí tus estadísticas.
    </p>`;
  }
  if (stats.total === 0) {
    return html`<div class="stats-empty">
      <p class="empty"><b>Sin resultados con estos filtros.</b></p>
      <button type="button" class="chip" data-clear-filters>Quitar filtros</button>
    </div>`;
  }
  const months = stats.finishedByMonth.map((m) => ({ name: m.label, count: m.count }));
  return html`<div class="kpi-grid">
      ${[
        kpiHtml('total', stats.total, 'Juegos'),
        kpiHtml('backlog', stats.counts.backlog, STATUS_LABELS.backlog, 'st-backlog'),
        kpiHtml('playing', stats.counts.playing, STATUS_LABELS.playing, 'st-playing'),
        kpiHtml('finished', stats.counts.finished, STATUS_LABELS.finished, 'st-finished'),
        kpiHtml('abandoned', stats.counts.abandoned, STATUS_LABELS.abandoned, 'st-abandoned'),
        kpiHtml('avg', formatAvg(stats.avgRating), 'Media ★'),
      ]}
    </div>
    <div class="stats-grid">
      <section class="cardbox"><h3>Por plataforma</h3>${distBodyHtml(stats.byPlatform)}</section>
      <section class="cardbox"><h3>Por género</h3>${distBodyHtml(stats.byGenre)}</section>
      <section class="cardbox"
        ><h3>Etiquetas propias</h3>${distBodyHtml(stats.byTag)}</section
      >
      <section class="cardbox"
        ><h3>Terminados en el tiempo</h3>${distBodyHtml(months)}</section
      >
      ${topSectionHtml(stats.top5)}
    </div>`;
}

/**
 * Activa/desactiva una dimensión de filtro del dashboard: selección única por
 * dimensión (tocar el chip activo lo quita); «Todas» limpia la suya.
 * @param {import('../app.js').Store} store
 * @param {'platform'|'genre'|'tag'} dim
 * @param {string|null} value
 */
function setStatsFilter(store, dim, value) {
  const current = store.get().stats[dim];
  store.set({
    stats: { ...store.get().stats, [dim]: value == null || current === value ? null : value },
  });
}

/**
 * Delegación de clics sobre la superficie recién renderizada.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
function wire(container, store) {
  const surface = container.firstElementChild;
  if (!(surface instanceof HTMLElement)) return;
  surface.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const clicked = e.target;
    if (clicked.closest('[data-clear-filters]')) {
      store.set({ stats: { platform: null, genre: null, tag: null } });
      return;
    }
    const chip = clicked.closest('[data-f-platform],[data-f-genre],[data-f-tag]');
    if (chip instanceof HTMLElement) {
      const dim =
        chip.hasAttribute('data-f-platform')
          ? 'platform'
          : chip.hasAttribute('data-f-genre')
            ? 'genre'
            : 'tag';
      const value = chip.getAttribute(`data-f-${dim}`);
      setStatsFilter(store, dim, value === '' || value == null ? null : value);
      return;
    }
    // Único elemento clicable del dashboard: abrir la Ficha (spec §8.7).
    // Cambio de pestaña + Ficha = pantalla nueva: push único con pestaña y
    // gameId para que el atrás del móvil regrese al origen (src/navigation.js).
    const row = clicked.closest('[data-game-id]');
    if (row) {
      nav.openGameInTab(store, row.getAttribute('data-game-id') ?? '', 'biblioteca');
    }
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
  const filters = state.stats ?? { platform: null, genre: null, tag: null };
  const options = filterOptions(doc);
  const stats = computeStats(doc, filters, new Date());
  container.innerHTML = html`<div class="fade">
    <header class="view-head">
      <h1>Estadísticas</h1>
      <p class="sub">Tu biblioteca de un vistazo: todo responde a los filtros.</p>
    </header>
    <div class="toolbar">
      <div class="filters">
        ${DIMENSIONS.map((dim) =>
          chipRowHtml({
              dim: dim.key,
              label: dim.label,
              values:
                dim.key === 'platform'
                  ? options.platforms
                  : dim.key === 'genre'
                    ? options.genres
                    : options.tags,
              active: filters[dim.key],
              allLabel: 'Todas',
            }),
        )}
      </div>
    </div>
    ${bodyHtml(doc, stats)}
  </div>`;
  wire(container, store);
}
