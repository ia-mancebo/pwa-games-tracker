import { html, qs, qsa } from './lib/dom.js';
import { formatAvg } from './lib/format.js';
import { avgRatingOfGames, gameStatus } from './domain/selectors.js';
import { views } from './views/index.js';
import * as welcome from './views/welcome.js';
import { renderFilebar } from './ui/filebar.js';
import { openDataDialog } from './views/dataDialog.js';
import { installBackNav } from './backnav.js';
import { switchTab } from './navigation.js';
import { settleScroll } from './scroll.js';

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
 * Conflicto real pendiente de resolver (spec §5.5): la versión externa del
 * archivo, lista para que el diálogo la pinte y la resuelva (ADR-0004).
 * @typedef {{
 *   fileText: string,
 *   fileHash: string,
 *   fileDoc: import('./domain/schema.js').Doc,
 * }} ConflictInfo
 */

/**
 * Estado de sesión del enlace al archivo .json (ticket 18). El nombre
 * persistente vive en meta.connectedFileName; esto es solo sesión. El
 * conflicto pendiente es observable aquí (ADR-0004): los guards del enlace
 * (omitir vuelco y chequeo externo mientras hay conflicto) son lo que
 * mantiene vivo ese campo.
 * @typedef {{
 *   status: 'disconnected'|'connected'|'error',
 *   name: string|null,
 *   error: string|null,
 *   conflict: ConflictInfo | null,
 *   saving: boolean,
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
 * Filtros globales del dashboard de estadísticas (ticket 24): selección única
 * por dimensión, acumulables entre dimensiones.
 * @typedef {{
 *   platform: string|null,
 *   genre: string|null,
 *   tag: string|null,
 * }} StatsState
 */

/**
 * Estado de la vista Novedades (ticket 23): sección abierta del drill-down,
 * género filtrado y Ficha externa abierta (referencia «sección:índice»). El
 * tablón en sí vive en la instantánea IDB. La Ficha viaja en el estado para
 * que el botón atrás del móvil la cierre sin cambiar de pestaña
 * (src/backnav.js).
 * @typedef {{ section: string|null, genre: string|null, detail: string|null }} NovedadesState
 */

/**
 * Estado efímero de edición de la Ficha (qué formulario está abierto, qué
 * confirmaciones pendientes, errores inline; ADR-0006). Slice top-level
 * sembrado por los intents de abrir Ficha (src/navigation.js) y FUERA del
 * snapshot de historial: restaurar el historial nunca resucita un formulario
 * abierto ni una confirmación de borrado pendiente. El guard de re-render de
 * la vista (src/views/game.js) re-siembra el slice ante un gameId distinto
 * (botón atrás del móvil, cambio de pestaña).
 * @typedef {{
 *   gameId: string|null,
 *   editTitle: boolean,
 *   field: string|null,
 *   fieldError: string|null,
 *   customPlatform: string|null,
 *   confirmPlay: string|null,
 *   playError: string|null,
 *   confirmGame: boolean,
 *   error: string|null,
 *   titleError: string|null,
 * }} FichaUi
 */

/**
 * Estado de sesión del tablón Novedades (ticket 23, ADR-0008): la Instantánea
 * cargada, la carga en vuelo, el refresco en vuelo, el modo degradado y la
 * guarda de re-entrada del alta local. Slice top-level sembrado por la vista
 * (src/views/novedades.js) y FUERA del snapshot de historial: restaurar el
 * historial nunca aplasta la Instantánea viva.
 * @typedef {{
 *   snapshot: import('./data/snapshot.js').SavedSnapshot|null,
 *   loading: boolean,
 *   refreshing: boolean,
 *   degraded: 'unconfigured'|'offline'|'service-error'|null,
 *   adding: boolean,
 * }} NovedadesUi
 */

/**
 * Ficha nueva limpia: sin formularios, confirmaciones ni errores pendientes.
 * @param {string|null} gameId
 * @returns {FichaUi}
 */
export function freshFicha(gameId) {
  return {
    gameId,
    editTitle: false,
    field: null,
    fieldError: null,
    customPlatform: null,
    confirmPlay: null,
    playError: null,
    confirmGame: false,
    error: null,
    titleError: null,
  };
}

/**
 * Tablón Novedades limpio: sin Instantánea, sin cargas ni refrescos en vuelo,
 * sin modo degradado y sin alta local en curso.
 * @returns {NovedadesUi}
 */
export function freshNovedadesUi() {
  return {
    snapshot: null,
    loading: false,
    refreshing: false,
    degraded: null,
    adding: false,
  };
}

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
 *   stats: StatsState,
 *   novedades: NovedadesState,
 *   novedadesUi: NovedadesUi,
 *   ficha: FichaUi,
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
  file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false },
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
  stats: { platform: null, genre: null, tag: null },
  novedades: { section: null, genre: null, detail: null },
  novedadesUi: freshNovedadesUi(),
  ficha: freshFicha(null),
};

/** @type {Set<Listener>} */
const listeners = new Set();

/**
 * Slices que pintan la vista principal (todo menos `file`/`meta`, el estado
 * de guardado). Si ninguno cambia de referencia entre renders, un set de
 * file/meta solo debe tocar el filebar: re-renderizar la vista re-dispara la
 * animación `.fade` y parpadea toda la pantalla (ver renderCurrent).
 * @type {(keyof AppState)[]}
 */
const VIEW_SLICES = [
  'tab',
  'doc',
  'ready',
  'tabRole',
  'library',
  'stats',
  'novedades',
  'novedadesUi',
  'ficha',
];

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
      ${TABS.map((t) =>
          html`<button
              type="button"
              data-tab="${t.id}"
              ${gated ? 'disabled' : ''}
              aria-current="${t.id === current ? 'true' : 'false'}"
            >
              ${t.label}
            </button>`
        )}
    </nav>
    ${railWidgetsHtml()}
    <button type="button" class="chip rail-datos" data-open-data ${gated ? 'disabled' : ''}>
      Datos
    </button>
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
  root.innerHTML = html`<div class="shell">
    ${railHtml()}
    <div class="content">
      <div class="filebar-slot"></div>
      <main class="main"></main>
    </div>
  </div>`;
  const main = qs('main', root);
  if (!main) throw new Error('shell sin <main>');
  // Botón atrás del navegador/móvil integrado con la navegación por estado.
  installBackNav(store);

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
    // Cambio de pestaña = pestaña raíz: la pila se reinicia y el botón atrás
    // del móvil no recorre las pantallas previas (ADR-0007). Las reglas
    // (volver a Biblioteca repone la estantería conservando búsqueda/filtros
    // — ticket 14; cualquier cambio cierra la Ficha — ticket 17; el refresco
    // automático de Novedades al entrar — spec §7.3) viven en el intent
    // (src/navigation.js).
    switchTab(store, tab);
  });

  /** Estado del último render: si los slices visuales no cambiaron de
   *  referencia, un set de file/meta no re-pinta la vista (sin parpadeo).
   *  @type {AppState|null} */
  let lastRender = null;

  const renderCurrent = () => {
    const state = store.get();
    const prev = lastRender;
    lastRender = state;
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
    // Solo cambió el estado de guardado (file/meta): la vista principal ya
    // está pintada y re-renderizarla re-dispararía la animación `.fade`
    // (parpadeo de toda la pantalla en cada vuelco). El store hace spread por
    // slice, así que la referencia de un slice solo cambia si se parcheó; la
    // puerta de bienvenida (ready/doc) y el toggle readonly (tabRole) ya
    // quedan cubiertos por la comparación.
    if (prev && VIEW_SLICES.every((k) => state[k] === prev[k])) return;
    // Puerta de bienvenida: sin biblioteca no se renderiza ninguna pestaña.
    if (gated) {
      welcome.render(main, store);
      return;
    }
    const view = views[tab];
    if (!view) return;
    // Reposicionar el scroll por superficie (src/scroll.js): el destino se
    // decide ANTES de re-renderizar para leer el scrollY de la superficie
    // saliente, y se aplica DESPUÉS, sobre el DOM nuevo.
    const scrollTarget = settleScroll(prev, state);
    view.render(main, store);
    if (scrollTarget != null) window.scrollTo(0, scrollTarget);
  };

  const unsubscribe = store.subscribe(renderCurrent);
  renderCurrent();
  return unsubscribe;
}
