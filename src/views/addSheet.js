/**
 * Hoja de Alta (ticket 16, spec §8.4): botón fijo → hoja con dos caminos.
 * «Buscar online» llega en el ticket 21 y se enchufa vía `onlineSlot`; hoy
 * se pinta deshabilitado con su motivo constante. El aviso de duplicados
 * (spec §4.5) ofrece abrir el panel del Estado del juego existente o crear
 * otro igual; `submitManual` es la pieza reutilizable por ambos caminos.
 */
import { html, qs, raw } from '../lib/dom.js';
import { STATUSES, STATUS_LABELS, todayFrom } from '../domain/schema.js';
import { findDuplicates, gameStatus } from '../domain/selectors.js';
import { addGame } from '../data/library.js';
import { store } from '../app.js';

/** Motivo del camino online sin servicio (ticket 21 lo sustituye por búsqueda real). */
export const ONLINE_UNAVAILABLE_REASON =
  'Sin servicio configurado — configura el proxy IGDB para buscar en línea';

/** Coincidencias mostradas como máximo en el aviso de duplicados. */
const MAX_DUP_LIST = 3;

/**
 * @typedef {{
 *   error: string|null,
 *   duplicates: import('../domain/schema.js').Game[]|null,
 * }} SheetState
 */

/** Capa fija (fondo + hoja) actualmente abierta, si la hay. @type {HTMLElement|null} */
let layer = null;

/** Listener de Escape del último openAddSheet. @type {((e: KeyboardEvent) => void)|null} */
let keyHandler = null;

/** Cierra la hoja abierta (si la hay) y retira sus listeners globales. */
export function closeAddSheet() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (layer) {
    layer.remove();
    layer = null;
  }
}

/**
 * Etiquetas propias desde texto separado por comas: recorta, descarta vacías,
 * conserva duplicados escritos deliberadamente.
 * @param {string|undefined} rawTags
 * @returns {string[]}
 */
function parseTags(rawTags) {
  return (rawTags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
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
 * Guarda un alta manual tras validar título y avisar de duplicados. Es la
 * única pieza que escribe; el camino online del ticket 21 puede reutilizarla
 * pasando los datos compartidos ya resueltos y `confirmDuplicate` cuando el
 * usuario haya aceptado el aviso.
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
  const tags = parseTags(input.tagsRaw);
  /** @type {Parameters<typeof addGame>[0]} */
  const payload = {
    title,
    status: validStatus(input.status),
    today: todayFrom(opts.now ?? new Date()),
  };
  if (tags.length > 0) payload.tags = tags;
  if (input.igdbId != null) payload.igdbId = input.igdbId;
  if (input.coverUrl != null) payload.coverUrl = input.coverUrl;
  if (input.description != null) payload.description = input.description;
  if (input.screenshots != null) payload.screenshots = input.screenshots;
  if (input.genres != null) payload.genres = input.genres;
  if (input.platforms != null) payload.platforms = input.platforms;
  const saved = await addGame(payload);
  return { ok: true, game: saved.games[saved.games.length - 1] };
}

/**
 * Pestaña online deshabilitada con su motivo (camino por defecto hasta 21).
 * @returns {string}
 */
function disabledOnlineHtml() {
  return html`<div class="add-paths">
      <button type="button" class="add-tab" data-online-tab disabled>Buscar online</button>
      <span class="add-tab on">Crear manualmente</span>
    </div>
    <p class="add-online-reason">${ONLINE_UNAVAILABLE_REASON}</p>`;
}

/**
 * Chip de radio para elegir el Estado inicial antes de guardar.
 * @param {import('../domain/schema.js').Status} status
 * @returns {string}
 */
function statusChipHtml(status) {
  return html`<label class="status-chip st-${status}">
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
          raw(
            html`<li>
              <span class="dup-title">${game.title}</span>
              <span class="pill st-${gameStatus(game)}">${STATUS_LABELS[gameStatus(game)]}</span>
            </li>`
          )
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
 * Marcado completo de la capa: fondo clicable + hoja (diálogo). En móvil es
 * bottom sheet; en escritorio queda centrada (CSS).
 * @param {SheetState} state
 * @param {string|null} onlineSlot
 * @returns {string}
 */
function sheetHtml(state, onlineSlot) {
  return html`<div class="add-backdrop" data-close-add></div>
    <section class="add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-sheet-title">
      <header class="add-head">
        <h2 id="add-sheet-title">Añadir juego</h2>
        <button type="button" class="chip" data-close-add aria-label="Cerrar">✕</button>
      </header>
      ${raw(onlineSlot ?? disabledOnlineHtml())}
      <form class="add-form">
        <label class="field">
          <span class="lbl">Título</span>
          <input type="text" name="title" placeholder="Escribe el título del juego…" />
        </label>
        <fieldset class="field">
          <legend class="lbl">Estado inicial</legend>
          <div class="status-chips">${STATUSES.map((st) => raw(statusChipHtml(st)))}</div>
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
      </form>
    </section>`;
}

/**
 * Abre la hoja de Alta sobre `host` (document.body por defecto) y devuelve su
 * función de cierre. `onlineSlot` sustituye el bloque online deshabilitado
 * (HTML de confianza, ticket 21); `onSaved` corre tras guardar con el juego
 * creado. El guardado pasa siempre por {@link submitManual}.
 * @param {{ host?: Element, onlineSlot?: string|null, onSaved?: (game: import('../domain/schema.js').Game) => void }} [opts]
 * @returns {() => void}
 */
export function openAddSheet(opts = {}) {
  closeAddSheet();
  const host = opts.host ?? document.body;
  /** @type {SheetState} */
  const state = { error: null, duplicates: null };
  layer = document.createElement('div');
  layer.className = 'add-layer fade';
  host.appendChild(layer);

  const paintFeedback = () => {
    const box = qs('[data-add-feedback]', layer ?? document);
    if (box) box.innerHTML = feedbackHtml(state);
  };

  /**
   * @param {boolean} confirmDuplicate
   */
  const doSubmit = async (confirmDuplicate) => {
    const layerNow = layer;
    if (!layerNow) return;
    const titleInput = qs('input[name="title"]', layerNow);
    const tagsInput = qs('input[name="tags"]', layerNow);
    const checked = qs('input[name="status"]:checked', layerNow);
    const res = await submitManual(
      {
        title: titleInput instanceof HTMLInputElement ? titleInput.value : '',
        tagsRaw: tagsInput instanceof HTMLInputElement ? tagsInput.value : '',
        status:
          checked instanceof HTMLInputElement
            ? /** @type {import('../domain/schema.js').Status} */ (checked.value)
            : undefined,
      },
      { confirmDuplicate }
    );
    if (!layer || layer !== layerNow) return;
    if (!res.ok) {
      state.error = res.error ?? null;
      state.duplicates = res.duplicates ?? null;
      paintFeedback();
      return;
    }
    closeAddSheet();
    opts.onSaved?.(res.game);
  };

  layer.innerHTML = sheetHtml(state, opts.onlineSlot ?? null);

  layer.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('[data-close-add]') || e.target.classList.contains('add-backdrop')) {
      closeAddSheet();
      return;
    }
    if (e.target.closest('[data-dup-create]')) {
      void doSubmit(true);
      return;
    }
    const dupOpen = e.target.closest('[data-dup-open]');
    if (dupOpen && state.duplicates && state.duplicates.length > 0) {
      // La Ficha llega en el ticket 17: por ahora se abre el Panel del Estado
      // del juego del primer duplicado.
      const status = gameStatus(state.duplicates[0]);
      closeAddSheet();
      store.set({
        library: { ...store.get().library, view: 'panel', panelStatus: status },
      });
    }
  });

  layer.addEventListener('submit', (e) => {
    e.preventDefault();
    void doSubmit(false);
  });

  // Editar el título invalida el error y el aviso vistos hasta el momento.
  layer.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.name !== 'title') return;
    if (state.error == null && state.duplicates == null) return;
    state.error = null;
    state.duplicates = null;
    paintFeedback();
  });

  keyHandler = (e) => {
    if (e.key === 'Escape' && layer?.isConnected) {
      e.preventDefault();
      closeAddSheet();
    }
  };
  document.addEventListener('keydown', keyHandler);

  const titleInput = qs('input[name="title"]', layer);
  if (titleInput instanceof HTMLInputElement) titleInput.focus();

  return closeAddSheet;
}
