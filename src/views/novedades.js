/**
 * Tablón Novedades (ticket 23, spec §7.2–§7.3 y §8.6): tira de meses, cuatro
 * baldas 12/12/6/6, drill-down por sección con filtro de género y ficha
 * externa con «➕ Quiero jugarlo» (alta 100 % local). El tablón SIEMPRE se
 * pinta desde la instantánea IDB; las bandas explican el modo degradado.
 */
import { html, raw, qs } from '../lib/dom.js';
import { todayFrom } from '../domain/schema.js';
import { findDuplicates } from '../domain/selectors.js';
import { coverHtml } from '../ui/cover.js';
import { addGame } from '../data/library.js';
import { getSnapshot } from '../data/snapshot.js';
import { refreshNovedades } from '../data/novedades.js';
import { IGDB_SERVICE_ERROR, igdb } from '../services/igdb.js';
import { store } from '../app.js';
import { navigate } from '../backnav.js';
import { openSheet, SHEET_BODY_SELECTOR } from '../ui/sheet.js';

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

/**
 * Estado local de la vista: instantánea cargada, refresco en vuelo y último
 * resultado de intento (para la banda del servicio).
 * @type {SavedSnapshot|null}
 */
let snapshotCache = null;

let snapshotLoaded = false;
let refreshing = false;
/** @type {'ok'|'unconfigured'|'offline'|'service-error'|null} */
let lastStatus = null;

/** Contenedor actual (main) y guard contra cargas obsoletas. @type {Element|null} */
let hostEl = null;
let loadSeq = 0;

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

/** @param {IgdbGame} game */
function fakeSchemaGame(game) {
  return /** @type {import('../domain/schema.js').Game} */ ({
    id: `igdb-${game.igdbId}`,
    title: game.title,
    ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}),
    plays: [],
  });
}

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
    ${coverHtml(fakeSchemaGame(game))}
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
 * @returns {string}
 */
function headHtml(snap) {
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
  const snap = snapshotCache;
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
            ${coverHtml(fakeSchemaGame(game), { mini: true })}
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
 * Cuerpo completo del tablón desde la instantánea.
 * @returns {string}
 */
function boardHtml() {
  const snap = snapshotCache;
  const nv = store.get().novedades ?? { section: null, genre: null, detail: null };
  const head = headHtml(snap);
  if (!snapshotLoaded) {
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
  if (lastStatus === 'service-error') out += bannerHtml({ kind: 'service-error' });
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

let adding = false;

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

/**
 * Cierre con gesto (✕, fondo, Escape, botón atrás): aplica el cambio al
 * instante; el historial lo gestiona el módulo de hojas (sin entrada propia).
 */
function requestCloseDetail() {
  const nv = store.get().novedades ?? { section: null, genre: null, detail: null };
  store.set({
    novedades: { section: nv.section ?? null, genre: nv.genre ?? null, detail: null },
  });
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
    onClose: requestCloseDetail,
    content: '',
  });
  sheet = handle;
  handle.layer.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('[data-want-play]')) {
      const snap = snapshotCache;
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
  const snap = snapshotCache;
  const ref = currentDetailRef();
  const body = sheetEl ? qs(SHEET_BODY_SELECTOR, sheetEl) : null;
  if (!body || !ref || !snap) return;
  const [sec, idxRaw] = ref.split(':');
  const game = /** @type {IgdbGame[]} */ (snap[/** @type {SectionKey} */ (sec)] ?? [])[
    Number(idxRaw)
  ];
  if (!game) {
    // La instantánea ya no contiene la referencia: cerrar de verdad.
    requestCloseDetail();
    return;
  }
  const inLibrary = isInLibrary(game);
  const genres = (game.genres ?? []).map((g) => g.name);
  const platforms = (game.platforms ?? []).map((p) => p.name);
  body.innerHTML = html`<div class="d-hero">
        <div class="d-cover">${coverHtml(fakeSchemaGame(game))}</div>
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
 * botón voltea solo (findDuplicates pasa a coincidir).
 * @param {IgdbGame} game
 */
async function wantToPlay(game) {
  if (adding) return;
  adding = true;
  try {
    await addGame({
      title: game.title,
      status: 'backlog',
      today: todayFrom(new Date()),
      ...(game.igdbId != null ? { igdbId: game.igdbId } : {}),
      ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}),
      ...(game.description ? { description: game.description } : {}),
      ...((game.genres ?? []).length > 0 ? { genres: game.genres } : {}),
      ...((game.platforms ?? []).length > 0 ? { platforms: game.platforms } : {}),
      ...((game.screenshots ?? []).length > 0 ? { screenshots: game.screenshots } : {}),
    });
  } finally {
    adding = false;
  }
  paintDetail();
}

/* ------------------------------------------------------------------ */
/* Render y eventos                                                    */
/* ------------------------------------------------------------------ */

/** Refresco manual o Reintentar: repinta al terminar con el nuevo estado. */
async function runRefresh() {
  if (refreshing) return;
  refreshing = true;
  repaint();
  lastStatus = (await refreshNovedades()).status;
  refreshing = false;
  await reloadSnapshot();
}

/** Recarga la instantánea desde IDB y repinta si el host sigue vivo. */
async function reloadSnapshot() {
  const seq = ++loadSeq;
  const snap = await getSnapshot();
  if (seq !== loadSeq) return;
  snapshotCache = snap;
  snapshotLoaded = true;
  repaint();
}

function repaint() {
  // Solo si el tablón sigue siendo la superficie viva del main: un repinto
  // tardío (refresco asíncrono) no debe aplastar otra pestaña ya renderizada.
  const surface = hostEl?.firstElementChild ?? null;
  if (hostEl && hostEl.isConnected && surface?.matches('[data-nov],[data-nov-loading]')) {
    paintSync(hostEl);
  }
}

/**
 * Pinta síncronamente y cablea la superficie recién creada (los listeners
 * mueren con cada re-render, igual que en Biblioteca).
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
      // Cierra el drill-down al instante y consume su entrada de historial
      // (src/backnav.js): el botón atrás del sistema no la repite.
      navigate(store, 'back', { novedades: { section: null, genre: null, detail: null } });
      return;
    }
    if (target.hasAttribute('data-nsection')) {
      // Sección nueva: pantalla propia para el botón atrás del móvil.
      navigate(store, 'push', {
        novedades: {
          section: target.getAttribute('data-nsection'),
          genre: null,
          detail: null,
        },
      });
      return;
    }
    if (target.hasAttribute('data-ngenre')) {
      const value = target.getAttribute('data-ngenre');
      const current = store.get().novedades ?? { section: null, genre: null, detail: null };
      store.set({
        novedades: {
          section: current.section ?? null,
          genre: current.genre === value ? null : value,
          detail: current.detail ?? null,
        },
      });
      return;
    }
    const detailRef = target.getAttribute('data-ndetail');
    if (detailRef && snapshotCache) {
      // La Ficha ya NO es una pantalla (Q12): sin entrada de historial. El
      // botón atrás del móvil la cierra vía el módulo de hojas, que re-empuja
      // la instantánea al consumir la pulsación (src/backnav.js).
      const nv = store.get().novedades ?? { section: null, genre: null, detail: null };
      store.set({
        novedades: {
          section: nv.section ?? null,
          genre: nv.genre ?? null,
          detail: detailRef,
        },
      });
      syncDetail();
    }
  });
}

/**
 * Vista Novedades: pinta siempre desde la instantánea IDB (nunca desde red).
 * Contenedores fuera del documento se ignoran: el render es estado de la
 * vista activa y un main desconectado no debe tocar nada. La capa de la
 * Ficha se sincroniza con el estado aquí: un popstate que restaure una
 * instantánea sin ficha la cierra; una con ficha la reabre (src/backnav.js).
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  if (!container.isConnected) return;
  hostEl = container;
  paintSync(container);
  syncDetail();
  void reloadSnapshot().catch(() => {});
}

/** Reinicia todo lo activado por la vista (aislación en pruebas). */
export function resetNovedadesView() {
  closeDetail();
  loadSeq++;
  hostEl = null;
  snapshotCache = null;
  snapshotLoaded = false;
  refreshing = false;
  lastStatus = null;
  adding = false;
}
