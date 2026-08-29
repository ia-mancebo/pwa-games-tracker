/**
 * Hoja de Alta (tickets 16 y 21, spec §8.4): botón fijo → hoja con dos
 * caminos. «Buscar online» busca contra el proxy IGDB (src/services/igdb.js)
 * con debounce de 300 ms; sin servicio o sin conexión queda deshabilitada con
 * motivo, empujando al manual. Elegir un resultado abre la PREVISUALIZACIÓN
 * con sus datos compartidos; «Añadir a la biblioteca» guarda vía el MISMO
 * camino único {@link submitManual}, con el aviso de duplicados de la spec
 * §4.5 (abrir ficha existente o crear otro).
 */
import { html, qs, qsa } from '../lib/dom.js';
import { formatError } from '../lib/errors.js';
import { debounce } from '../lib/debounce.js';
import { splitCommaList } from '../lib/list.js';
import { STATUSES, STATUS_LABELS, todayFrom } from '../domain/schema.js';
import { findDuplicates, gameStatus } from '../domain/selectors.js';
import { mapSourceToAddInput, toCoverGame } from '../domain/gateway.js';
import { addGame } from '../data/library.js';
import { store } from '../app.js';
import * as nav from '../navigation.js';
import { statusPillHtml } from '../ui/pill.js';
import { coverHtml } from '../ui/cover.js';
import { galleryHtml, wireGallery } from '../ui/gallery.js';
import { IGDB_SERVICE_ERROR, igdb } from '../services/igdb.js';
import { openSheet } from '../ui/sheet.js';

/** Motivo del camino online sin servicio configurado. */
export const ONLINE_UNAVAILABLE_REASON =
  'Sin servicio configurado — añade la URL del proxy en Datos';

/** Motivo del camino online con red cortada (spec §8.4). */
export const OFFLINE_REASON = 'Sin conexión — crea el juego manualmente';

/** Resultados mostrados como máximo en la lista de búsqueda. */
const MAX_RESULTS = 10;

/** Retardo del debounce de búsqueda (spec §8.4): 1 s para no saturar el proxy. */
const SEARCH_DEBOUNCE_MS = 1000;

/** Coincidencias mostradas como máximo en el aviso de duplicados. */
const MAX_DUP_LIST = 3;

/**
 * Estado de la región de búsqueda online de la hoja abierta.
 * @typedef {{
 *   status: 'idle'|'loading'|'done'|'error',
 *   results: import('../services/igdb.js').IgdbGame[],
 *   error: string|null,
 * }} OnlineState
 */

/**
 * @typedef {{
 *   error: string|null,
 *   duplicates: import('../domain/schema.js').Game[]|null,
 *   path: 'online'|'manual',
 *   online: OnlineState,
 *   pending: import('../services/igdb.js').IgdbGame|null,
 * }} SheetState
 */

/** Hoja del módulo de hojas actualmente abierta (el .add-sheet), si la hay.
 * @type {HTMLElement|null} */
let layer = null;

/** Cierre de la hoja del módulo. @type {(() => void)|null} */
let closeSheet = null;

/** Se incrementa en cada cierre: invalida búsquedas programadas/en vuelo de hojas viejas. */
let epochCounter = 0;

/** Cierra la hoja abierta (si la hay); el ✕, el fondo y Escape los cierra el módulo. */
export function closeAddSheet() {
  epochCounter += 1;
  closeSheet?.();
  closeSheet = null;
  layer = null;
}

/**
 * @param {unknown} status
 * @returns {import('../domain/schema.js').Status}
 */
function validStatus(status) {
  return STATUSES.includes(/** @type {import('../domain/schema.js').Status} */ (status))
    ? /** @type {import('../domain/schema.js').Status} */ (status)
    : 'backlog';
}

/**
 * Payload del alta manual (sin datos de la Fuente): título, Estado elegido,
 * etiquetas en bruto y today — el camino online pasa por la pasarela.
 * @param {{ title: string, status?: import('../domain/schema.js').Status, tagsRaw?: string }} input
 * @param {string} today
 * @returns {Parameters<typeof addGame>[0]}
 */
function manualPayload(input, today) {
  const tags = splitCommaList(input.tagsRaw ?? '');
  /** @type {Parameters<typeof addGame>[0]} */
  const payload = {
    title: input.title,
    status: validStatus(input.status),
    today,
  };
  if (tags.length > 0) payload.tags = tags;
  return payload;
}

/**
 * Guarda un alta tras validar título y avisar de duplicados. Es la única pieza
 * que escribe: el camino manual llega del formulario y el camino online pasa
 * los datos compartidos ya resueltos con `confirmDuplicate` cuando el usuario
 * aceptó el aviso. El camino online construye su payload con la pasarela
 * (domain/gateway.js); el manual, directamente aquí.
 * @param {{
 *   title: string,
 *   status?: import('../domain/schema.js').Status,
 *   tagsRaw?: string,
 *   igdbId?: number,
 *   coverUrl?: string,
 *   description?: string,
 *   screenshots?: string[],
 *   genres?: {id:number,name:string}[],
 *   platforms?: {id:number,name:string}[],
 * }} input
 * @param {{ confirmDuplicate?: boolean, now?: Date }} [opts]
 * @returns {Promise<{ ok: true, game: import('../domain/schema.js').Game } |
 *   { ok: false, error?: string, duplicates?: import('../domain/schema.js').Game[] }>}
 */
export async function submitManual(input, opts = {}) {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'El título es obligatorio' };
  const doc = store.get().doc;
  if (!doc) return { ok: false, error: 'No hay biblioteca cargada' };
  const candidate = input.igdbId != null ? { title, igdbId: input.igdbId } : { title };
  if (!opts.confirmDuplicate) {
    const duplicates = findDuplicates(doc, candidate);
    if (duplicates.length > 0) return { ok: false, duplicates };
  }
  const today = todayFrom(opts.now ?? new Date());
  /** @type {Parameters<typeof addGame>[0]} */
  const payload =
    input.igdbId != null
      ? mapSourceToAddInput(
          { ...input, title },
          { status: input.status, tagsRaw: input.tagsRaw, today }
        )
      : manualPayload(input, today);
  const saved = await addGame(payload);
  return { ok: true, game: saved.games[saved.games.length - 1] };
}

/**
 * Fila de resultado: carátula (o placeholder estable), título, año y plataformas.
 * @param {import('../services/igdb.js').IgdbGame} result
 * @param {number} index
 * @returns {string}
 */
function resultItemHtml(result, index) {
  const year = result.releaseDate ? result.releaseDate.slice(0, 4) : '';
  const platforms = (result.platforms ?? []).map((p) => p.name).join(', ');
  const sub = [year, platforms].filter(Boolean).join(' · ');
  return html`<li>
    <button type="button" class="add-result" data-result="${index}">
      ${coverHtml(toCoverGame(result))}
      <span class="r-meta"
        ><span class="r-title">${result.title}</span>${sub
          ? html`<span class="r-sub">${sub}</span>`
          : ''}</span
      >
    </button>
  </li>`;
}

/**
 * Previsualización del resultado elegido (spec §8.4): los datos compartidos
 * del juego ANTES de decidir; añadir exige pulsar el botón explícito.
 * @param {import('../services/igdb.js').IgdbGame} result
 * @returns {string}
 */
function previewHtml(result) {
  const year = result.releaseDate ? result.releaseDate.slice(0, 4) : '';
  const platforms = (result.platforms ?? []).map((p) => p.name).join(', ');
  const sub = [year, platforms].filter(Boolean).join(' · ');
  const genres = (result.genres ?? []).map((g) =>
    html`<span class="chip static">${g.name}</span>`
  );
  return html`<div class="add-preview">
    ${coverHtml(toCoverGame(result))}
    <div class="add-preview-info">
      <h3 class="add-preview-title">${result.title}</h3>
      ${sub ? html`<p class="r-sub">${sub}</p>` : ''}
      ${genres.length > 0 ? html`<div class="add-preview-genres">${genres}</div>` : ''}
      ${result.description ? html`<p class="add-preview-desc">${result.description}</p>` : ''}
    </div>
    ${galleryHtml(result.screenshots ?? [])}
    <div class="add-preview-actions">
      <button type="button" class="chip" data-preview-back>← Volver a resultados</button>
      <button type="button" class="btn-primary" data-preview-add>Añadir a la biblioteca</button>
    </div>
  </div>`;
}

/**
 * Cuerpo de la región de resultados según el estado de búsqueda; con un
 * resultado pendiente muestra su previsualización en lugar de la lista.
 * @param {OnlineState} online
 * @param {import('../services/igdb.js').IgdbGame|null} pending
 * @returns {string}
 */
function onlineResultsHtml(online, pending) {
  if (pending) return previewHtml(pending);
  if (online.status === 'loading')
    return html`<p class="add-online-hint" data-online-loading>Buscando…</p>`;
  if (online.status === 'error')
    return html`<p class="form-error" role="alert" data-online-error>${online.error}</p>`;
  if (online.results.length === 0) {
    const idle = online.status === 'idle';
    return html`<p class="add-online-hint" ${idle ? '' : 'data-online-empty'}>
      ${idle ? 'Escribe un título para buscar en IGDB.' : 'Sin resultados'}
    </p>`;
  }
  return html`<ul class="add-results-list">
    ${online.results.map((r, i) => resultItemHtml(r, i))}
  </ul>`;
}

/**
 * Bloque online deshabilitado: pestañas y motivo; sin conexión configurada
 * empuja a la sección «Conexión» del diálogo Datos.
 * @param {boolean} configured
 * @returns {string}
 */
function disabledOnlineHtml(configured) {
  return html`<div class="add-paths">
      <button type="button" class="add-tab" data-online-tab disabled>Buscar online</button>
      <span class="add-tab on">Crear manualmente</span>
    </div>
    <p class="add-online-reason">${configured ? OFFLINE_REASON : ONLINE_UNAVAILABLE_REASON}</p>`;
}

/**
 * Chip de radio para elegir el Estado inicial antes de guardar. La variante
 * viaja en `data-status`, NO en clase `st-*`: esas clases son las de la
 * píldora de Estado (ui/pill.js) y pintarían su fondo/anillo sobre el label.
 * @param {import('../domain/schema.js').Status} status
 * @returns {string}
 */
function statusChipHtml(status) {
  return html`<label class="status-chip" data-status="${status}">
    <input type="radio" name="status" value="${status}" ${status === 'backlog' ? 'checked' : ''} />
    <span>${STATUS_LABELS[status]}</span>
  </label>`;
}

/**
 * Aviso de duplicados: hasta 3 coincidencias con su Estado y dos salidas.
 * @param {import('../domain/schema.js').Game[]} duplicates
 * @returns {string}
 */
export function duplicateWarningHtml(duplicates) {
  return html`<div class="dup-warning" role="alert" data-dup-warning>
    <b>Ya tienes ${duplicates.length === 1 ? 'un juego equivalente' : 'juegos equivalentes'}:</b>
    <ul>
      ${duplicates
        .slice(0, MAX_DUP_LIST)
        .map((game) =>
          html`<li>
              <span class="dup-title">${game.title}</span>
              ${statusPillHtml(gameStatus(game))}
            </li>`
        )}
    </ul>
    <div class="dup-actions">
      <button type="button" class="chip" data-dup-open>Abrir ficha existente</button>
      <button type="button" class="chip" data-dup-create>Crear otro igual</button>
    </div>
  </div>`;
}

/**
 * Región de feedback (error inline + aviso de duplicados); se repinta sola
 * para no perder el estado del formulario (título, radios, etiquetas).
 * @param {SheetState} state
 * @returns {string}
 */
function feedbackHtml(state) {
  let out = '';
  if (state.error)
    out += html`<p class="form-error" role="alert" data-add-error>${state.error}</p>`;
  if (state.duplicates && state.duplicates.length > 0)
    out += duplicateWarningHtml(state.duplicates);
  return out;
}

/**
 * Cuerpo de la hoja (el módulo de hojas pinta la capa, el fondo y la cabecera
 * con el título; aquí solo vive el contenido repintable). Con camino online
 * activo las pestañas alternan entre el panel de búsqueda y el formulario manual.
 * @param {SheetState} state
 * @param {{ onlineReady: boolean, configured: boolean }} availability
 * @returns {string}
 */
function bodyHtml(state, { onlineReady, configured }) {
  const onlineBlock = onlineReady
    ? html`<div class="add-paths">
          <button
            type="button"
            class="add-tab${state.path === 'online' ? ' on' : ''}"
            data-online-tab
          >
            Buscar online
          </button>
          <button
            type="button"
            class="add-tab${state.path === 'manual' ? ' on' : ''}"
            data-manual-tab
          >
            Crear manualmente
          </button>
        </div>
        <div class="add-online" data-online-pane${state.path === 'online' ? '' : ' hidden'}>
          <input
            type="text"
            name="online-query"
            placeholder="Busca juegos por título…"
            autocomplete="off"
          />
          <div class="add-online-results" data-online-results>
            ${onlineResultsHtml(state.online, state.pending)}
          </div>
          <div class="add-feedback" data-add-feedback>${feedbackHtml(state)}</div>
        </div>`
    : html`<div data-online-block>${disabledOnlineHtml(configured)}</div>`;
  return html`${onlineBlock}
      <form class="add-form" data-manual-pane${!onlineReady || state.path === 'manual' ? '' : ' hidden'}>
        <label class="field">
          <span class="lbl">Título</span>
          <input type="text" name="title" placeholder="Escribe el título del juego…" />
        </label>
        <fieldset class="field">
          <legend class="lbl">Estado inicial</legend>
          <div class="status-chips">${STATUSES.map((st) => statusChipHtml(st))}</div>
        </fieldset>
        <label class="field">
          <span class="lbl">Etiquetas propias <small>(separadas por comas)</small></span>
          <input type="text" name="tags" placeholder="rol, difícil, prestado…" />
        </label>
        <div class="add-feedback" data-add-feedback>${feedbackHtml(state)}</div>
        <footer class="add-foot">
          <button type="button" class="chip" data-close-add>Cancelar</button>
          <button type="submit" class="btn-primary" data-save-add>Añadir a la biblioteca</button>
        </footer>
      </form>`;
}

/**
 * Abre la hoja de Alta (el módulo de hojas la monta en document.body) y
 * devuelve su función de cierre. El camino online se activa solo con servicio
 * configurado y conexión; `onSaved` corre tras guardar (cualquier camino) con
 * el juego creado. El guardado pasa siempre por {@link submitManual}.
 * @param {{ onSaved?: (game: import('../domain/schema.js').Game) => void }} [opts]
 * @returns {() => void}
 */
export function openAddSheet(opts = {}) {
  closeAddSheet();
  const epoch = epochCounter;
  const configured = igdb.isConfigured();
  const onlineReady = configured && globalThis.navigator.onLine;
  /** @type {SheetState} */
  const state = {
    error: null,
    duplicates: null,
    path: onlineReady ? 'online' : 'manual',
    online: { status: 'idle', results: [], error: null },
    pending: null,
  };
  const handle = openSheet({
    title: 'Añadir juego',
    // El ✕ de cabecera lo cierra el módulo (data-sheet-close); el fondo
    // conserva data-close-add para compatibilidad con tests y «Cancelar»
    // del formulario sigue cerrando vía el listener de la hoja.
    backdropAttr: 'data-close-add',
    onClose: closeAddSheet,
    content: bodyHtml(state, { onlineReady, configured }),
  });
  layer = handle.layer;
  closeSheet = handle.close;
  wireGallery(layer);

  const paintFeedback = () => {
    if (!layer) return;
    for (const box of qsa('[data-add-feedback]', layer)) box.innerHTML = feedbackHtml(state);
  };

  const paintOnline = () => {
    const box = layer ? qs('[data-online-results]', layer) : null;
    if (box) box.innerHTML = onlineResultsHtml(state.online, state.pending);
  };

  const clearTransient = () => {
    state.pending = null;
    state.error = null;
    state.duplicates = null;
    paintFeedback();
  };

  /**
   * @param {'online'|'manual'} next
   */
  const switchPath = (next) => {
    const layerNow = layer;
    if (!layerNow || !onlineReady || state.path === next) return;
    state.path = next;
    clearTransient();
    qs('[data-online-tab]', layerNow)?.classList.toggle('on', next === 'online');
    qs('[data-manual-tab]', layerNow)?.classList.toggle('on', next === 'manual');
    const onlinePane = qs('[data-online-pane]', layerNow);
    const manualPane = qs('[data-manual-pane]', layerNow);
    if (onlinePane instanceof HTMLElement) onlinePane.hidden = next !== 'online';
    if (manualPane instanceof HTMLElement) manualPane.hidden = next !== 'manual';
    const toFocus = qs(
      next === 'online' ? 'input[name="online-query"]' : 'input[name="title"]',
      layerNow
    );
    if (toFocus instanceof HTMLInputElement) toFocus.focus();
  };

  /**
   * Datos para submitManual: del formulario (manual) o del resultado elegido
   * (online), compartiendo Estado inicial y etiquetas del formulario.
   */
  const collectInput = () => {
    const layerNow = layer;
    const checked = layerNow ? qs('input[name="status"]:checked', layerNow) : null;
    const tagsInput = layerNow ? qs('input[name="tags"]', layerNow) : null;
    /** @type {import('../domain/schema.js').Status|undefined} */
    const status =
      checked instanceof HTMLInputElement
        ? /** @type {import('../domain/schema.js').Status} */ (checked.value)
        : undefined;
    const tagsRaw = tagsInput instanceof HTMLInputElement ? tagsInput.value : '';
    const pending = state.pending;
    if (!pending) {
      const titleInput = layerNow ? qs('input[name="title"]', layerNow) : null;
      return { title: titleInput instanceof HTMLInputElement ? titleInput.value : '', status, tagsRaw };
    }
    return {
      title: pending.title,
      igdbId: pending.igdbId,
      coverUrl: pending.coverUrl ?? undefined,
      description: pending.description || undefined,
      genres: (pending.genres ?? []).length > 0 ? pending.genres : undefined,
      platforms: (pending.platforms ?? []).length > 0 ? pending.platforms : undefined,
      screenshots: (pending.screenshots ?? []).length > 0 ? pending.screenshots : undefined,
      status,
      tagsRaw,
    };
  };

  /**
   * @param {boolean} confirmDuplicate
   */
  const doSubmit = async (confirmDuplicate) => {
    const layerNow = layer;
    if (!layerNow) return;
    const res = await submitManual(collectInput(), { confirmDuplicate });
    if (!layer || layer !== layerNow) return;
    if (!res.ok) {
      // El resultado elegido se conserva: «Crear otro igual» debe poder
      // reenviarlo tras el aviso de duplicados.
      state.error = res.error ?? null;
      state.duplicates = res.duplicates ?? null;
      paintFeedback();
      return;
    }
    closeAddSheet();
    opts.onSaved?.(res.game);
  };

  let seq = 0;
  /**
   * @param {string} rawQuery
   */
  const runSearch = async (rawQuery) => {
    if (!layer || epoch !== epochCounter) return;
    const query = rawQuery.trim();
    if (query === '') {
      state.online = { status: 'idle', results: [], error: null };
      paintOnline();
      return;
    }
    seq += 1;
    const mySeq = seq;
    state.online = { status: 'loading', results: [], error: null };
    paintOnline();
    try {
      const found = await igdb.searchGames(query);
      if (!layer || epoch !== epochCounter || mySeq !== seq) return;
      state.online = { status: 'done', results: found.slice(0, MAX_RESULTS), error: null };
    } catch (error) {
      if (!layer || epoch !== epochCounter || mySeq !== seq) return;
      state.online = {
        status: 'error',
        results: [],
        error: error instanceof Error ? formatError(error) : IGDB_SERVICE_ERROR,
      };
    }
    paintOnline();
  };
  const scheduleSearch = debounce(runSearch, SEARCH_DEBOUNCE_MS);

  layer.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('[data-close-add]')) {
      closeAddSheet();
      return;
    }
    if (e.target.closest('[data-dup-create]')) {
      void doSubmit(true);
      return;
    }
    const dupOpen = e.target.closest('[data-dup-open]');
    if (dupOpen && state.duplicates && state.duplicates.length > 0) {
      // Cerrar hoja + intent de abrir-Ficha-cambiando-de-pestaña: una sola
      // entrada de historial con pestaña y gameId (src/navigation.js); el
      // atrás del móvil regresa al origen.
      closeAddSheet();
      nav.openGameInTab(store, state.duplicates[0].id, 'biblioteca');
      return;
    }
    if (e.target.closest('[data-preview-back]')) {
      state.pending = null;
      paintOnline();
      return;
    }
    if (e.target.closest('[data-preview-add]')) {
      void doSubmit(false);
      return;
    }
    if (e.target.closest('[data-result]')) {
      const button = e.target.closest('[data-result]');
      const index = Number(button?.getAttribute('data-result'));
      const result = state.online.results[index];
      if (result) {
        // Previsualizar primero: añadir exige confirmación explícita.
        state.pending = result;
        state.error = null;
        state.duplicates = null;
        paintFeedback();
        paintOnline();
      }
      return;
    }
    if (e.target.closest('[data-manual-tab]')) {
      switchPath('manual');
      return;
    }
    if (e.target.closest('[data-online-tab]')) switchPath('online');
  });

  layer.addEventListener('submit', (e) => {
    e.preventDefault();
    void doSubmit(false);
  });

  // Editar el título o la búsqueda invalida el error y el aviso vistos hasta
  // el momento; la búsqueda además lanza el debounce.
  layer.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (e.target.name === 'online-query') {
      clearTransient();
      scheduleSearch(e.target.value);
      return;
    }
    if (e.target.name !== 'title') return;
    if (state.error == null && state.duplicates == null) return;
    state.error = null;
    state.duplicates = null;
    paintFeedback();
  });

  // Escape y ✕/fondo los cierra el módulo de hojas; aquí solo se repone el
  // foco inicial del formulario (el módulo enfocó el primer elemento de la
  // hoja, que con camino online es la pestaña, no el campo de búsqueda).
  const initialFocus = qs(
    onlineReady ? 'input[name="online-query"]' : 'input[name="title"]',
    layer
  );
  if (initialFocus instanceof HTMLInputElement) initialFocus.focus();

  return closeAddSheet;
}
