/**
 * Tablón Novedades (ticket 23, spec §7.2–§7.3 y §8.6): tira de meses, cuatro
 * baldas 12/12/6/6, drill-down por sección con filtro de género y ficha
 * externa con «➕ Quiero jugarlo» (alta 100 % local). La vista pinta PURAMENTE
 * del estado: el slice novedadesUi (ADR-0008) es la única fuente del tablón,
 * la carga, el refresco y el modo degradado; la navegación pasa por los
 * intents de src/navigation.js.
 */
import { html, raw, qs } from '../lib/dom.js';
import { todayFrom } from '../domain/schema.js';
import { findDuplicates } from '../domain/selectors.js';
import { mapSourceToAddInput, toCoverGame } from '../domain/gateway.js';
import { coverHtml } from '../ui/cover.js';
import { galleryHtml, wireGallery } from '../ui/gallery.js';
import { addGame } from '../data/library.js';
import { ensureNovedadesContent, refreshNovedades } from '../data/novedades.js';
import { IGDB_SERVICE_ERROR, igdb } from '../services/igdb.js';
import { store } from '../app.js';
import { openSheet, SHEET_BODY_SELECTOR } from '../ui/sheet.js';
import {
  backToNovedadesBoard,
  closeNovedadesDetail,
  openNovedadesDetail,
  openNovedadesSection,
  toggleNovedadesGenre,
} from '../navigation.js';

/** Composición fija del tablón (spec §7.2). @type {{key: SectionKey, label: string}[]} */
const SECTIONS = [
  { key: 'recientes', label: 'Recién salidos' },
  { key: 'proximos', label: 'Próximamente' },
  { key: 'populares', label: 'Populares' },
  { key: 'esperados', label: 'Más esperados' },
];

/** Antigüedad que activa la banda destacada (spec §7.2). */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {'recientes'|'proximos'|'populares'|'esperados'} SectionKey */
/** @typedef {import('../data/snapshot.js').SavedSnapshot} SavedSnapshot */
/** @typedef {import('../services/igdb.js').IgdbGame} IgdbGame */

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fecha corta para el badge de portada («9 ago»).
 * @param {string|null} iso YYYY-MM-DD
 * @returns {string}
 */
function formatDay(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Fecha completa para listas y ficha («9 ago 2026»); '' si es desconocida.
 * @param {string|null} iso
 * @returns {string}
 */
function formatFullDate(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Sello «Actualizado: …»; guión sin instantánea.
 * @param {string} savedAtIso
 * @returns {string}
 */
function formatStamp(savedAtIso) {
  const t = Date.parse(savedAtIso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ¿Instantánea con más de 7 días? @param {SavedSnapshot} snap */
function isStale(snap) {
  const ageMs = Date.now() - Date.parse(snap.savedAt);
  return !Number.isFinite(ageMs) || ageMs > STALE_MS;
}

/* ------------------------------------------------------------------ */
/* Marcado                                                             */
/* ------------------------------------------------------------------ */

/**
 * Tarjeta de portada con badge de fecha; el clic abre la ficha.
 * @param {SectionKey} section
 * @param {number} index posición dentro del array de la sección
 * @param {IgdbGame} game
 * @returns {string}
 */
function newsCardHtml(section, index, game) {
  const badge = formatDay(game.releaseDate);
  return html`<button
    type="button"
    class="card news"
    data-ndetail="${section}:${index}"
    title="${game.title}"
  >
    ${coverHtml(toCoverGame(game))}
    ${badge ? html`<span class="badge mono">${badge}</span>` : ''}
    <span class="cap"><span>${game.title}</span></span>
  </button>`;
}

/**
 * Balda de sección: placa clicable + fila horizontal de portadas.
 * @param {SectionKey} key
 * @param {string} label
 * @param {IgdbGame[]} games
 * @returns {string}
 */
function shelfHtml(key, label, games) {
  return html`<section class="shelf">
    <button type="button" class="plate" data-nsection="${key}">
      <b>${label}</b>
      <span>${games.length} títulos</span>
    </button>
    <div class="row" data-section-row="${key}">
      ${games.map((g, i) => newsCardHtml(key, i, g))}
      ${games.length === 0 ? raw('<p class="row-empty">Sin títulos.</p>') : ''}
    </div>
  </section>`;
}

/**
 * Tira de meses a partir de recientes + próximos.
 * @param {IgdbGame[]} games
 * @returns {string}
 */
function monthStripHtml(games) {
  const counts = new Map();
  for (const game of games) {
    const ym = typeof game.releaseDate === 'string' ? game.releaseDate.slice(0, 7) : '';
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  const months = [...counts.keys()].sort();
  return html`<div class="month-strip" data-month-strip>
    ${months.map((ym) => {
      const name = new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('es-ES', {
        month: 'short',
        timeZone: 'UTC',
      });
      return html`<span class="chip"
          ><strong>${name} ${ym.slice(0, 4)}</strong>&nbsp;· ${counts.get(ym)}</span
        >`;
    })}
  </div>`;
}

/**
 * Banda fina no bloqueante del modo degradado o destacada si >7 días.
 * @param {{ kind: 'offline'|'service-error'|'stale'|'unconfigured' }} which
 * @returns {string}
 */
function bannerHtml(which) {
  const retry =
    which.kind === 'offline' || which.kind === 'service-error'
      ? html`<button type="button" class="chip" data-retry>Reintentar</button>`
      : '';
  const text =
    which.kind === 'offline'
      ? 'Sin conexión — mostrando la última instantánea.'
      : which.kind === 'service-error'
        ? `${IGDB_SERVICE_ERROR} — mostrando la última instantánea.`
        : which.kind === 'unconfigured'
          ? 'Servicio sin configurar — pega la URL del proxy IGDB en Datos.'
          : 'La instantánea supera los 7 días — actualiza cuando tengas conexión.';
  return html`<div class="nb-banner${which.kind === 'stale' ? ' warn' : ''}" data-nbanner>
    <span class="nb-text">${text}</span>${retry}
  </div>`;
}

/** Estado vacío sin instantánea (spec §7.3): explicación + Reintentar. */
function firstTimeEmptyHtml() {
  return html`<p class="empty" data-nempty>
      <b>Novedades sin datos</b>
      Novedades necesita conexión la primera vez para descargar el calendario.
    </p>
    <p class="empty-retry">
      <button type="button" class="chip" data-retry>Reintentar</button>
    </p>`;
}

/** Estado vacío sin servicio configurado: empuja a Datos. */
function unconfiguredEmptyHtml() {
  return html`<p class="empty" data-nempty>
    <b>Servicio sin configurar</b>
    Configura la URL del proxy IGDB en Datos para descargar el calendario de novedades.
  </p>`;
}

/**
 * Cabecera: título, sello permanente «Actualizado: …» y botón manual.
 * @param {SavedSnapshot|null} snap
 * @param {boolean} refreshing
 * @returns {string}
 */
function headHtml(snap, refreshing) {
  const configured = igdb.isConfigured();
  const stamp = snap ? formatStamp(snap.savedAt) : '—';
  return html`<header class="view-head nov-head">
    <div>
      <h1>Novedades</h1>
      <p class="sub">Recién salidos, próximos lanzamientos, populares y esperados.</p>
    </div>
    <div class="nov-actions">
      <span class="nov-stamp mono" data-stamp>Actualizado: ${stamp}</span>
      <button
        type="button"
        class="chip"
        data-refresh
        ${refreshing || !configured ? 'disabled' : ''}
        title="${configured ? 'Buscar novedades ahora' : 'Sin servicio configurado: pega la URL del proxy en Datos'}"
      >
        ${refreshing ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  </header>`;
}

/**
 * Lista completa de una sección (drill-down) con chips de género.
 * @param {SectionKey|null} sectionKey
 * @param {string|null} genre
 * @returns {string}
 */
function drillDownHtml(sectionKey, genre) {
  const snap = store.get().novedadesUi.snapshot;
  const meta = sectionKey ? SECTIONS.find((s) => s.key === sectionKey) : null;
  if (!snap || !meta || !sectionKey) return '';
  const all = /** @type {IgdbGame[]} */ (snap[sectionKey] ?? []);
  const genres = [...new Set(all.flatMap((g) => (g.genres ?? []).map((x) => x.name)))].sort(
    (a, b) => a.localeCompare(b, 'es')
  );
  const rows = all
    .map((game, i) => ({ game, i }))
    .filter(({ game }) => !genre || (game.genres ?? []).some((x) => x.name === genre));
  return html`<div class="toolbar">
      <button type="button" class="chip" data-nback>← Novedades</button>
      <strong>${meta.label}</strong>
    </div>
    ${
      genres.length > 0
        ? html`<div class="toolbar">
              <div class="chip-row">
                ${genres.map((name) =>
                  html`<button
                    type="button"
                    class="chip-xs chip${genre === name ? ' on' : ''}"
                    data-ngenre="${name}"
                  >
                    ${name}
                  </button>`
                )}
              </div>
            </div>`
        : ''
    }
    <div class="cardbox tight n-table">
      <div class="b-thead">
        <span></span><span>Título</span><span class="n-col-pf">Plataformas</span><span>Fecha</span>
      </div>
      ${rows.length === 0 ? raw('<p class="empty">Nada con ese género.</p>') : ''}
      ${rows.map(({ game, i }) =>
        html`<div class="b-row" data-ndetail="${sectionKey}:${i}">
            ${coverHtml(toCoverGame(game), { mini: true })}
            <span class="b-cell">
              <span class="b-title">${game.title}</span>
              <span class="b-sub">${(game.genres ?? []).map((x) => x.name).join(', ')}</span>
            </span>
            <span class="b-cell b-col-pf n-col-pf mono"
              >${(game.platforms ?? []).map((p) => p.name).join(', ')}</span
            >
            <span class="b-cell n-date mono">${formatFullDate(game.releaseDate)}</span>
          </div>`
      )}
    </div>`;
}

/**
 * Cuerpo completo del tablón desde el slice novedadesUi.
 * @returns {string}
 */
function boardHtml() {
  const { snapshot: snap, loading, refreshing, degraded } = store.get().novedadesUi;
  const nv = store.get().novedades ?? { section: null, genre: null, detail: null };
  const head = headHtml(snap, refreshing);
  if (loading) {
    return html`<div class="fade" data-nov-loading><p class="empty">Cargando…</p></div>`;
  }
  if (nv.section && snap) {
    const sectionKey = /** @type {SectionKey} */ (nv.section);
    return html`<div class="fade" data-nov>
      ${head}${drillDownHtml(sectionKey, nv.genre)}
    </div>`;
  }
  let out = `<div class="fade" data-nov>${head}`;
  if (!snap) {
    out += igdb.isConfigured()
      ? firstTimeEmptyHtml()
      : bannerHtml({ kind: 'unconfigured' }) + unconfiguredEmptyHtml();
    return out + '</div>';
  }
  if (degraded === 'service-error') out += bannerHtml({ kind: 'service-error' });
  else if (!navigator.onLine) out += bannerHtml({ kind: 'offline' });
  else if (isStale(snap)) out += bannerHtml({ kind: 'stale' });
  else if (!igdb.isConfigured()) out += bannerHtml({ kind: 'unconfigured' });
  out += monthStripHtml([...snap.recientes, ...snap.proximos]);
  for (const sec of SECTIONS) {
    out += shelfHtml(sec.key, sec.label, snap[sec.key] ?? []);
  }
  return out + '</div>';
}

/* ------------------------------------------------------------------ */
/* Ficha externa (hoja profunda, src/ui/sheet.js)                      */
/* ------------------------------------------------------------------ */

/** Hoja del módulo actualmente abierta (handle de openSheet). @type {{ close: () => void, layer: HTMLElement }|null} */
let sheet = null;

/** Referencia «sección:índice» pintada en la hoja abierta. @type {string|null} */
let paintedRef = null;

/**
 * Referencia «sección:índice» de la Ficha abierta según el estado. La Ficha
 * ya NO es una pantalla (Q12): sin entrada de historial; el botón atrás del
 * móvil la cierra vía el módulo de hojas (src/backnav.js + src/ui/sheet.js).
 * @returns {string|null}
 */
function currentDetailRef() {
  return store.get().novedades?.detail ?? null;
}

/** Cierra la hoja de la Ficha (el ✕, el fondo y Escape los cierra el módulo). */
export function closeDetail() {
  sheet?.close();
  sheet = null;
  paintedRef = null;
}

/** Sincroniza la hoja de la Ficha con el estado: la abre, la cierra o nada. */
function syncDetail() {
  const ref = currentDetailRef();
  if (ref) {
    if (sheet?.layer.isConnected && paintedRef === ref) return;
    openDetailLayer(ref);
  } else if (sheet) {
    closeDetail();
  }
}

/**
 * Abre la hoja de la Ficha para una referencia ya validada del estado.
 * @param {string} ref
 */
function openDetailLayer(ref) {
  closeDetail();
  paintedRef = ref;
  const handle = openSheet({
    title: 'Ficha',
    closeAttr: 'data-close-detail',
    backdropAttr: 'data-close-detail',
    onClose: () => closeNovedadesDetail(store),
    content: '',
  });
  sheet = handle;
  wireGallery(handle.layer);
  handle.layer.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('[data-want-play]')) {
      const snap = store.get().novedadesUi.snapshot;
      const parts = (currentDetailRef() ?? '').split(':');
      const game = snap
        ? /** @type {IgdbGame[]} */ (snap[/** @type {SectionKey} */ (parts[0])] ?? [])[
            Number(parts[1])
          ]
        : undefined;
      if (game) void wantToPlay(game);
    }
  });
  paintDetail();
}

/**
 * Juego equivalente ya en biblioteca (mismo igdbId o título normalizado).
 * @param {IgdbGame} game
 */
function isInLibrary(game) {
  const doc = store.get().doc;
  if (!doc) return false;
  return (
    findDuplicates(doc, {
      title: game.title,
      ...(game.igdbId != null ? { igdbId: game.igdbId } : {}),
    }).length > 0
  );
}

/** Texto de lanzamiento según la fecha llegue o esté por llegar. @param {IgdbGame} game */
function releaseTextHtml(game) {
  const date = formatFullDate(game.releaseDate);
  if (!date) return '';
  const future = typeof game.releaseDate === 'string' && game.releaseDate > todayFrom(new Date());
  return html`<p class="mono d-meta">
    ${future ? `Llega el ${date}` : `A la venta desde el ${date}`}
  </p>`;
}

/** Repinta solo el cuerpo de la hoja abierta (el botón cambia tras añadir). */
function paintDetail() {
  const sheetEl = sheet?.layer ?? null;
  const snap = store.get().novedadesUi.snapshot;
  const ref = currentDetailRef();
  const body = sheetEl ? qs(SHEET_BODY_SELECTOR, sheetEl) : null;
  if (!body || !ref || !snap) return;
  const [sec, idxRaw] = ref.split(':');
  const game = /** @type {IgdbGame[]} */ (snap[/** @type {SectionKey} */ (sec)] ?? [])[
    Number(idxRaw)
  ];
  if (!game) {
    // La instantánea ya no contiene la referencia: cerrar de verdad.
    closeNovedadesDetail(store);
    return;
  }
  const inLibrary = isInLibrary(game);
  const genres = (game.genres ?? []).map((g) => g.name);
  const platforms = (game.platforms ?? []).map((p) => p.name);
  body.innerHTML = html`<div class="d-hero">
        <div class="d-cover">${coverHtml(toCoverGame(game))}</div>
        <div class="d-head">
          <h3 class="d-title">${game.title}</h3>
          ${releaseTextHtml(game)}
        </div>
      </div>
      ${
        genres.length > 0
          ? html`<div class="d-sec">
                <h3>Géneros</h3>
                <div class="d-status">
                  ${genres.map((name) => html`<span class="chip static chip-xs">${name}</span>`)}
                </div>
              </div>`
          : ''
      }
      ${
        platforms.length > 0
          ? html`<div class="d-sec">
              <h3>Plataformas</h3>
              <p class="mono d-meta">${platforms.join(', ')}</p>
            </div>`
          : ''
      }
      ${
        game.description
          ? html`<div class="d-sec">
              <h3>Descripción</h3>
              <p class="d-desc">${game.description}</p>
            </div>`
          : ''
      }
      ${galleryHtml(game.screenshots ?? [])}
      <div class="d-sec" data-detail-add>
        ${
          inLibrary
            ? raw('<button type="button" class="chip static" disabled>Ya en tu biblioteca</button>')
            : html`<button type="button" class="btn-primary" data-want-play>
                    ➕ Quiero jugarlo
                  </button>
                  <p class="d-meta" style="margin-top:10px">
                    Se añade a tu biblioteca como «Quiero jugar», sin conexión.
                  </p>`
        }
      </div>`;
}

/**
 * Alta local como Quiero jugar conservando los datos compartidos; luego el
 * botón voltea solo (findDuplicates pasa a coincidir). La guarda de
 * re-entrada vive en el slice (novedadesUi.adding).
 * @param {IgdbGame} game
 */
async function wantToPlay(game) {
  if (store.get().novedadesUi.adding) return;
  store.set({ novedadesUi: { ...store.get().novedadesUi, adding: true } });
  try {
    await addGame(mapSourceToAddInput(game, { status: 'backlog', today: todayFrom(new Date()) }));
  } finally {
    store.set({ novedadesUi: { ...store.get().novedadesUi, adding: false } });
  }
  paintDetail();
}

/* ------------------------------------------------------------------ */
/* Render y eventos                                                    */
/* ------------------------------------------------------------------ */

/** Refresco manual o Reintentar: el módulo de datos escribe el slice. */
async function runRefresh() {
  if (store.get().novedadesUi.refreshing) return;
  await refreshNovedades();
}

/**
 * Pinta síncronamente y cablea la superficie recién creada (los listeners
 * mueren con cada re-render, igual que en Biblioteca). Toda la navegación
 * pasa por los intents de src/navigation.js.
 * @param {Element} container
 */
function paintSync(container) {
  container.innerHTML = boardHtml();
  const surface = container.firstElementChild;
  if (!surface) return;
  surface.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const target = e.target.closest(
      '[data-refresh],[data-retry],[data-nsection],[data-nback],[data-ngenre],[data-ndetail]'
    );
    if (!target) return;
    if (target.hasAttribute('data-refresh') || target.hasAttribute('data-retry')) {
      void runRefresh();
      return;
    }
    if (target.hasAttribute('data-nback')) {
      backToNovedadesBoard(store);
      return;
    }
    if (target.hasAttribute('data-nsection')) {
      openNovedadesSection(store, target.getAttribute('data-nsection') ?? '');
      return;
    }
    if (target.hasAttribute('data-ngenre')) {
      toggleNovedadesGenre(store, target.getAttribute('data-ngenre') ?? '');
      return;
    }
    const detailRef = target.getAttribute('data-ndetail');
    if (detailRef && store.get().novedadesUi.snapshot) {
      openNovedadesDetail(store, detailRef);
    }
  });
}

/**
 * Vista Novedades: pinta puramente del estado (slice novedadesUi, ADR-0008).
 * El render solo pinta la pestaña viva: un repinto tardío no puede aplastar
 * otra pestaña porque el render de la app solo invoca la vista activa. La
 * carga de la Instantánea es idempotente (ensureNovedadesContent); la capa de
 * la Ficha se sincroniza con el estado aquí (syncDetail, guard paintedRef).
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  if (!container.isConnected) return;
  void ensureNovedadesContent().catch(() => {});
  paintSync(container);
  syncDetail();
}