/**
 * Botón atrás del navegador/móvil integrado con la navegación por estado
 * (spec §8: vistas client-side, sin rutas de URL). Cada transición de pantalla
 * «hacia dentro» (abrir Panel, abrir Ficha, abrir sección de Novedades) empuja
 * una entrada de historial con la instantánea del estado; el botón atrás del
 * sistema recupera la pantalla anterior. Los botones «← Volver» internos
 * aplican su cambio al instante y consumen la entrada empujada para que el
 * hardware atrás no tenga que pulsarse dos veces.
 *
 * Las pestañas del raíl (Biblioteca, Novedades, Estadísticas) son PESTAÑAS
 * RAÍZ: pulsarlas reinicia la pila con el kind 'reset' (la regla vive en el
 * intent switchTab de src/navigation.js, ADR-0007; este módulo sigue tonto).
 * El rebobinado usa history.go(-depth), UN solo popstate en navegadores reales
 * y en jsdom (su History.go salta el índice y dispara un único popstate); el
 * pop resultante se traga con el flag pendingReset y la entrada raíz se
 * re-escribe con la instantánea viva (store.set ya fue síncrono). Si go()
 * lanzara (entorno sin historial utilizable) se degrada a replaceState de la
 * entrada actual. Alternativa descartada: bucle de history.back() con
 * pendingSwallow — jsdom dispara un popstate por back() y habría que contar
 * llamadas para re-escribir la raíz solo en el último; go(-n) es más simple.
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

/**
 * Popstate del rebobinado de una pestaña raíz (kind 'reset'): el pop de
 * history.go(-depth) es nuestro propio rebobinado, no una pulsación de atrás
 * del usuario — no debe cerrar hojas ni restaurar instantáneas. Se comprueba
 * ANTES de sheetCloser y del restore normal.
 * @type {boolean}
 */
let pendingReset = false;

/** Handler activo, para poder retirarlo en resetBackNav (pruebas).
 * @type {((e: PopStateEvent) => void)|null} */
let popHandler = null;

/**
 * Cierre de hoja registrado por el módulo de hojas (ticket 2): devuelve true
 * si la pulsación atrás del sistema se consumió cerrando la hoja abierta.
 * @type {(() => boolean)|null}
 */
let sheetCloser = null;

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
    if (pendingReset) {
      // Pop del rebobinado de una pestaña raíz: la instantánea viva ya lleva
      // el estado nuevo (store.set fue síncrono); se re-escribe la entrada
      // raíz y el atrás del sistema sale de la app en vez de recorrer la
      // traza previa.
      pendingReset = false;
      depth = 0;
      try {
        history.replaceState({ app: snapshot(store) }, '');
      } catch {
        // Sin historial utilizable: nada que re-escribir.
      }
      return;
    }
    if (sheetCloser && sheetCloser()) {
      // La pulsación atrás se consumió cerrando la hoja: se deshace el pop
      // re-empujando la pantalla actual; la profundidad no cambia y no se
      // restaura nada (la hoja no es una pantalla).
      try {
        history.pushState({ app: snapshot(store) }, '');
      } catch {
        // Sin historial utilizable: nada que re-empujar.
      }
      return;
    }
    if (depth > 0) depth--;
    const app = /** @type {{app?: NavSnapshot|null}} */ (e.state)?.app;
    restore(store, app);
  };
  window.addEventListener('popstate', popHandler);
}

/**
 * Transición de navegación del botón atrás del navegador/móvil: aplica el
 * cambio de estado al instante y luego opera sobre el historial según la
 * clase de movimiento.
 * @param {import('./app.js').Store} store
 * @param {'push'|'back'|'replace'|'reset'} kind
 * @param {Partial<import('./app.js').AppState>} transition Cambio a aplicar.
 */
export function navigate(store, kind, transition) {
  store.set(transition);
  if (typeof history === 'undefined') return;
  if (kind === 'push') {
    // Pantalla nueva: entrada con la instantánea de lo recién pintado.
    depth++;
    try {
      history.pushState({ app: snapshot(store) }, '');
    } catch {
      depth--;
    }
    return;
  }
  if (kind === 'replace') {
    // Sustituye la entrada actual (p. ej. la Ficha de un juego borrado):
    // la profundidad no cambia, el back del sistema salta a la previa.
    try {
      history.replaceState({ app: snapshot(store) }, '');
    } catch {
      // Nada que revertir: ni profundidad ni cola.
    }
    return;
  }
  if (kind === 'reset') {
    // Pestaña raíz: la pila se reinicia. La entrada raíz (la de la carga de
    // la página) pasa a llevar la instantánea del nuevo estado con depth 0;
    // el atrás del sistema sale de la app en vez de recorrer la traza previa.
    if (depth === 0) {
      // Ya en la raíz: solo se re-escribe la entrada actual.
      try {
        history.replaceState({ app: snapshot(store) }, '');
      } catch {
        // Nada que revertir.
      }
      return;
    }
    const toRewind = depth;
    pendingReset = true;
    depth = 0;
    try {
      // Un solo popstate (navegadores reales y jsdom): se traga en el handler.
      history.go(-toRewind);
    } catch {
      // go() falló (entorno sin historial utilizable): degrada a replaceState
      // de la entrada actual; el rebobinado no pudo hacerse.
      pendingReset = false;
      try {
        history.replaceState({ app: snapshot(store) }, '');
      } catch {
        // Nada que revertir.
      }
    }
    return;
  }
  if (depth > 0) {
    // Botón «← Volver» interno: retrocede el historial tragándose el
    // popstate resultante para no restaurar una instantánea ya obsoleta.
    depth--;
    pendingSwallow++;
    try {
      history.back();
    } catch {
      // back() falló: no hubo popstate; se devuelve la profundidad para no
      // perder la entrada que sigue en el historial.
      depth++;
      pendingSwallow--;
    }
  }
}

/**
 * Registra el cierre de la hoja del módulo de hojas (ticket 2): el popstate
 * que no se traga consulta el cierre ANTES de restaurar; si devuelve true,
 * la pulsación atrás se consumió cerrando la hoja y la pantalla no cambia.
 * @param {() => boolean} fn
 */
export function registerSheetCloser(fn) {
  sheetCloser = fn;
}

/** Limpieza total para pruebas. */
export function resetBackNav() {
  depth = 0;
  pendingSwallow = 0;
  pendingReset = false;
  installed = false;
  sheetCloser = null;
  if (popHandler && typeof window !== 'undefined') {
    window.removeEventListener('popstate', popHandler);
  }
  popHandler = null;
}
