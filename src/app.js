import { html, qs, qsa, raw } from './lib/dom.js';
import { formatAvg } from './lib/format.js';
import { avgRatingOfGames, gameStatus } from './domain/selectors.js';
import { views } from './views/index.js';
import * as welcome from './views/welcome.js';
import { renderFilebar } from './ui/filebar.js';
import { openDataDialog } from './views/dataDialog.js';

/**
 * Meta del espejo IndexedDB (spec §5.1). `exportFileName` y `persistAsked` son
 * preferencias locales del dispositivo (ticket 19): nunca viajan en el .json.
 * @typedef {{
 *   dirty: boolean,
 *   updatedAt: string|null,
 *   lastSavedFileHash: string|null,
 *   connectedFileName: string|null,
 *   exportFileName?: string,
 *   persistAsked?: boolean,
 * }} Meta
 */

/**
 * Estado de sesión del enlace al archivo .json (ticket 18). El nombre
 * persistente vive en meta.connectedFileName; esto es solo sesión.
 * @typedef {{
 *   status: 'disconnected'|'connected'|'error',
 *   name: string|null,
 *   error: string|null,
 * }} FileLinkState
 */

/**
 * Rol de esta pestaña según Web Locks (ticket 19): la primaria opera con
 * normalidad; una secundaria es solo lectura hasta hacerse activa.
 * @typedef {'primary' | 'secondary'} TabRole
 */

/**
 * Vista activa dentro de Biblioteca: estantería, panel de un Estado del juego
 * o Ficha de un juego concreto, más la búsqueda y filtros compartidos
 * (spec §8.1–§8.5).
 * @typedef {{
 *   view: 'shelves'|'panel',
 *   panelStatus: import('./domain/schema.js').Status|null,
 *   query: string,
 *   genre: string|null,
 *   platform: string|null,
 *   tag: string|null,
 *   gameId?: string|null,
 * }} LibraryState
 */

/**
 * Estado global de la app. Las vistas son client-side (sin rutas de URL).
 * @typedef {{
 *   tab: string,
 *   doc: import('./domain/schema.js').Doc|null,
 *   meta: Meta,
 *   file: FileLinkState,
 *   ready: boolean,
 *   tabRole: TabRole,
 *   library: LibraryState,
 * }} AppState
 */

/**
 * @typedef {(state: AppState) => void} Listener
 */

/**
 * Observable central: get/set/subscribe con merge superficial.
 * @typedef {{
 *   readonly state: AppState,
 *   get(): AppState,
 *   set(patch: Partial<AppState>): void,
 *   subscribe(fn: Listener): () => boolean,
 * }} Store
 */

/** @type {AppState} */
let state = {
  tab: 'biblioteca',
  doc: null,
  meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
  file: { status: 'disconnected', name: null, error: null },
  ready: false,
  tabRole: 'primary',
  library: {
    view: 'shelves',
    panelStatus: null,
    query: '',
    genre: null,
    platform: null,
    tag: null,
    gameId: null,
  },
};

/** @type {Set<Listener>} */
const listeners = new Set();

function notify() {
  for (const fn of [...listeners]) fn(state);
}

/** @type {Store} */
export const store = {
  get state() {
    return state;
  },
  get() {
    return state;
  },
  /** @param {Partial<AppState>} patch */
  set(patch) {
    state = { ...state, ...patch };
    notify();
  },
  /** @param {Listener} fn */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/**
 * @typedef {{ id: string, label: string }} Tab
 */

/** @type {Tab[]} */
export const TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'novedades', label: 'Novedades' },
  { id: 'estadisticas', label: 'Estadísticas' },
];

/** ¿Primer arranque sin biblioteca? → puerta de bienvenida (spec §5.2). */
function isGated() {
  const { ready, doc } = store.get();
  return ready && !doc;
}

/** Widgets del raíl con valores reales del doc (— sin biblioteca). */
function railWidgetsHtml() {
  const games = store.get().doc?.games ?? [];
  const count = /** @param {import('./domain/schema.js').Status} status */ (status) =>
    games.filter((g) => gameStatus(g) === status).length;
  return html`<div class="widgets">
      <div class="bw"><span>Jugando ahora</span><b>${count('playing')}</b></div>
      <div class="bw"><span>Terminados</span><b>${count('finished')}</b></div>
      <div class="bw"><span>Valoración media</span><b>${formatAvg(avgRatingOfGames(games))}</b></div>
    </div>`;
}

function railHtml() {
  const current = store.get().tab;
  const gated = isGated();
  return html`<aside class="rail">
      <div class="logo" aria-hidden="true">GT</div>
      <nav class="nav${gated ? ' disabled' : ''}" aria-label="Secciones">
        ${TABS.map(
          (t) =>
            raw(html`<button
              type="button"
              data-tab="${t.id}"
              ${gated ? 'disabled' : ''}
              aria-current="${t.id === current ? 'true' : 'false'}"
            >
              ${t.label}
            </button>`),
        )}
      </nav>
      ${raw(railWidgetsHtml())}
      <button type="button" class="chip rail-datos" data-open-data ${gated ? 'disabled' : ''}>Datos</button>
      <span class="note">offline-first · datos locales</span>
    </aside>`;
}

/**
 * Monta el shell (raíl + main), registra el store y pinta la vista activa.
 * Devuelve la función de desuscripción del render.
 * @param {HTMLElement} root
 * @returns {() => boolean}
 */
export function createApp(root) {
  root.innerHTML = '';
  root.innerHTML = html`<div class="shell">${raw(railHtml())}<div class="content">
      <div class="filebar-slot"></div>
      <main class="main"></main>
    </div></div>`;
  const main = qs('main', root);
  if (!main) throw new Error('shell sin <main>');

  root.addEventListener('click', (e) => {
    const trigger =
      e.target instanceof HTMLElement ? e.target.closest('[data-tab],[data-open-data]') : null;
    if (!trigger) return;
    if (trigger.hasAttribute('data-open-data')) {
      if (isGated()) return;
      e.preventDefault();
      openDataDialog();
      return;
    }
    const tab = trigger.getAttribute('data-tab');
    if (!tab || !(tab in views) || isGated()) return;
    e.preventDefault();
    const previous = store.get().tab;
    // Volver a Biblioteca desde otra pestaña repone la estantería (ticket 14);
    // la búsqueda y los filtros persisten (barra común del ticket 15).
    // Cambiar de pestaña cierra siempre la Ficha abierta (ticket 17).
    if (tab === 'biblioteca' && previous !== 'biblioteca') {
      store.set({
        tab,
        library: { ...store.get().library, view: 'shelves', panelStatus: null, gameId: null },
      });
      return;
    }
    store.set({ tab, library: { ...store.get().library, gameId: null } });
  });

  const renderCurrent = () => {
    const state = store.get();
    const tab = state.tab in views ? state.tab : 'biblioteca';
    const gated = isGated();
    // Segunda pestaña en solo lectura: el CSS oculta el FAB vía esta clase.
    root.classList.toggle('readonly-tab', state.tabRole === 'secondary');
    const nav = qs('.nav', root);
    if (nav) nav.classList.toggle('disabled', gated);
    for (const btn of qsa('.nav button[data-tab]', root)) {
      if (gated) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
      btn.setAttribute('aria-current', btn.getAttribute('data-tab') === tab ? 'true' : 'false');
    }
    // Botón «Datos» del raíl: bloqueado tras la puerta de bienvenida.
    for (const datosBtn of qsa('[data-open-data]', root)) {
      if (gated) datosBtn.setAttribute('disabled', '');
      else datosBtn.removeAttribute('disabled');
    }
    // Pastilla del archivo: parte del chrome, oculta tras la puerta de bienvenida.
    const filebarSlot = qs('.filebar-slot', root);
    if (filebarSlot) {
      if (gated) filebarSlot.innerHTML = '';
      else renderFilebar(filebarSlot, store);
    }
    // Puerta de bienvenida: sin biblioteca no se renderiza ninguna pestaña.
    if (gated) {
      welcome.render(main, store);
      return;
    }
    const view = views[tab];
    if (!view) return;
    view.render(main, store);
  };

  const unsubscribe = store.subscribe(renderCurrent);
  renderCurrent();
  return unsubscribe;
}
