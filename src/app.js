import { html, qs, qsa, raw } from './lib/dom.js';
import { formatAvg } from './lib/format.js';
import { avgRatingOfGames, gameStatus } from './domain/selectors.js';
import { views } from './views/index.js';
import * as welcome from './views/welcome.js';

/**
 * Meta del espejo IndexedDB (spec §5.1).
 * @typedef {{
 *   dirty: boolean,
 *   updatedAt: string|null,
 *   lastSavedFileHash: string|null,
 *   connectedFileName: string|null,
 * }} Meta
 */

/**
 * Vista activa dentro de Biblioteca: estantería o panel de un Estado del
 * juego (spec §8.1/§8.2).
 * @typedef {{
 *   view: 'shelves'|'panel',
 *   panelStatus: import('./domain/schema.js').Status|null,
 * }} LibraryState
 */

/**
 * Estado global de la app. Las vistas son client-side (sin rutas de URL).
 * @typedef {{
 *   tab: string,
 *   doc: import('./domain/schema.js').Doc|null,
 *   meta: Meta,
 *   ready: boolean,
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
  ready: false,
  library: { view: 'shelves', panelStatus: null },
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
  root.innerHTML = html`<div class="shell">${raw(railHtml())}<main class="main"></main></div>`;
  const main = qs('main', root);
  if (!main) throw new Error('shell sin <main>');

  root.addEventListener('click', (e) => {
    const trigger = e.target instanceof HTMLElement ? e.target.closest('[data-tab]') : null;
    if (!trigger || isGated()) return;
    const tab = trigger.getAttribute('data-tab');
    if (!tab || !(tab in views)) return;
    e.preventDefault();
    const previous = store.get().tab;
    // Volver a Biblioteca desde otra pestaña repone la estantería (ticket 14).
    if (tab === 'biblioteca' && previous !== 'biblioteca') {
      store.set({ tab, library: { view: 'shelves', panelStatus: null } });
      return;
    }
    store.set({ tab });
  });

  const renderCurrent = () => {
    const state = store.get();
    const tab = state.tab in views ? state.tab : 'biblioteca';
    const gated = isGated();
    const nav = qs('.nav', root);
    if (nav) nav.classList.toggle('disabled', gated);
    for (const btn of qsa('.nav button[data-tab]', root)) {
      if (gated) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
      btn.setAttribute('aria-current', btn.getAttribute('data-tab') === tab ? 'true' : 'false');
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
