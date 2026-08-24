import { html, qs, qsa, raw } from './lib/dom.js';
import { views } from './views/index.js';

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
 * Estado global de la app. Las vistas son client-side (sin rutas de URL).
 * @typedef {{
 *   tab: string,
 *   doc: import('./domain/schema.js').Doc|null,
 *   meta: Meta,
 *   ready: boolean,
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

function railHtml() {
  const current = store.get().tab;
  return html`<aside class="rail">
      <div class="logo" aria-hidden="true">GT</div>
      <nav class="nav" aria-label="Secciones">
        ${TABS.map(
          (t) =>
            raw(html`<button
              type="button"
              data-tab="${t.id}"
              aria-current="${t.id === current ? 'true' : 'false'}"
            >
              ${t.label}
            </button>`),
        )}
      </nav>
      <div class="widgets">
        <div class="bw"><span>Jugando ahora</span><b>—</b></div>
        <div class="bw"><span>Terminados</span><b>—</b></div>
        <div class="bw"><span>Valoración media</span><b>—</b></div>
      </div>
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
    if (!trigger) return;
    const tab = trigger.getAttribute('data-tab');
    if (!tab || !(tab in views)) return;
    e.preventDefault();
    store.set({ tab });
  });

  const renderCurrent = () => {
    const tab = store.get().tab in views ? store.get().tab : 'biblioteca';
    for (const btn of qsa('.nav button[data-tab]', root)) {
      btn.setAttribute('aria-current', btn.getAttribute('data-tab') === tab ? 'true' : 'false');
    }
    const view = views[tab];
    if (!view) return;
    view.render(main, store);
  };

  const unsubscribe = store.subscribe(renderCurrent);
  renderCurrent();
  return unsubscribe;
}
