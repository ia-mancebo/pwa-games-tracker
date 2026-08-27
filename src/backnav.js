/**
 * Botón atrás del navegador/móvil integrado con la navegación por estado
 * (spec §8: vistas client-side, sin rutas de URL). Cada transición de pantalla
 * «hacia dentro» (cambiar de pestaña, abrir Panel, abrir Ficha, abrir sección
 * de Novedades) empuja una entrada de historial con la instantánea del estado;
 * el botón atrás del sistema recupera la pantalla anterior. Los botones
 * «← Volver» internos aplican su cambio al instante y consumen la entrada
 * empujada para que el hardware atrás no tenga que pulsarse dos veces.
 *
 * Las instantáneas cubren solo las porciones del estado que definen una
 * pantalla: tab, library y novedades. Doc, meta, file y tabRole no viajan.
 */

/**
 * Porciones del estado que definen una pantalla y viajan en cada entrada de
 * historial. Las entradas antiguas pueden traer shapes incompletos: la
 * restauración solo aplica los campos presentes.
 * @typedef {{
 *   tab: string,
 *   library?: import('./app.js').LibraryState,
 *   novedades?: import('./app.js').NovedadesState,
 * }} NavSnapshot
 */

/** Entradas empujadas sin consumir todavía. @type {number} */
let depth = 0;

/**
 * Popstates que deben tragarse: cada back interno deja uno en cola y su
 * restauración correspondiente es el cambio ya aplicado al instante. Cola FIFO:
 * los popstates llegan en el mismo orden que los history.back() emitidos.
 * @type {number}
 */
let pendingSwallow = 0;

/** El listener de popstate se registra una sola vez por página. */
let installed = false;

/** Handler activo, para poder retirarlo en resetBackNav (pruebas).
 * @type {((e: PopStateEvent) => void)|null} */
let popHandler = null;

/**
 * Instantánea de navegación del estado actual.
 * @param {import('./app.js').Store} store
 * @returns {NavSnapshot}
 */
function snapshot(store) {
  const { tab, library, novedades } = store.get();
  return { tab, library, novedades };
}

/**
 * Restaura en el store la instantánea guardada en una entrada de historial.
 * @param {import('./app.js').Store} store
 * @param {NavSnapshot|null|undefined} app
 */
function restore(store, app) {
  if (!app || typeof app.tab !== 'string') return;
  store.set({
    tab: app.tab,
    ...(app.library != null ? { library: app.library } : {}),
    ...(app.novedades != null ? { novedades: app.novedades } : {}),
  });
}

/**
 * Instala la integración con el historial (idempotente): marca la entrada
 * actual con la instantánea inicial y escucha popstate. Llamar desde
 * createApp; en pruebas, resetBackNav permite reinstalar.
 * @param {import('./app.js').Store} store
 */
export function installBackNav(store) {
  if (installed) return;
  installed = true;
  // Sin history (entornos raros) la app funciona igual: solo sin botón atrás.
  if (typeof history === 'undefined' || typeof window === 'undefined') return;
  try {
    history.replaceState({ app: snapshot(store) }, '');
  } catch {
    return;
  }
  popHandler = (e) => {
    if (pendingSwallow > 0) {
      pendingSwallow--;
      return;
    }
    if (depth > 0) depth--;
    const app = /** @type {{app?: NavSnapshot|null}} */ (e.state)?.app;
    restore(store, app);
  };
  window.addEventListener('popstate', popHandler);
}

/**
 * Empuja una entrada de historial con la pantalla actual; llamar DESPUÉS del
 * store.set que abre la pantalla nueva.
 * @param {import('./app.js').Store} store
 */
export function pushScreen(store) {
  if (typeof history === 'undefined') return;
  depth++;
  try {
    history.pushState({ app: snapshot(store) }, '');
  } catch {
    depth--;
  }
}

/**
 * Botón «← Volver» interno: aplica el cambio de estado al instante (mismas
 * reglas que siempre: conserva filtros y vista previa) y, si hay entrada
 * empujada que consumir, retrocede el historial tragándose el popstate
 * resultante para no restaurar una instantánea ya obsoleta.
 * @param {import('./app.js').Store} store
 * @param {Partial<import('./app.js').AppState>} fallback Cambio a aplicar.
 */
export function goBackScreen(store, fallback) {
  store.set(fallback);
  if (depth > 0 && typeof history !== 'undefined') {
    depth--;
    pendingSwallow++;
    try {
      history.back();
    } catch {
      pendingSwallow--;
    }
  }
}

/** Limpieza total para pruebas. */
export function resetBackNav() {
  depth = 0;
  pendingSwallow = 0;
  installed = false;
  if (popHandler && typeof window !== 'undefined') {
    window.removeEventListener('popstate', popHandler);
  }
  popHandler = null;
}
