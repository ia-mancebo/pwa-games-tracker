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
 *
 * Hoja abierta a profundidad 0 (Ficha del tablón, Alta, diálogos): el atrás
 * del sistema no tiene entrada propia que poppear (la primera entrada no
 * dispara popstate: el navegador sale de la app), así que el closer de hojas
 * nunca se consultaría. El módulo de hojas pide una ENTRADA CENTINELA
 * (ensureSheetSentinel) al abrir: una entrada marcada ({app: null}, nunca
 * restaurable) que da al atrás del sistema algo que poppear; el popstate
 * resultante consulta el closer y la pulsación se consume cerrando la hoja.
 * La centinela se consume por cualquier vía: el propio popstate del atrás
 * (re-escribe la raíz, que lleva la misma instantánea: la hoja no es una
 * pantalla) o el cierre por ✕/fondo/Escape/programático (consumeSheetSentinel
 * la marca huérfana y la consume la próxima operación de historial — consumo
 * diferido: history.back() es asíncrono y un push síncrono posterior lo
 * adelantaría). No es una pantalla restaurable (ADR-0007/8): su estado es un
 * marcador que restore() ignora.
 *
 * Visor de capturas abierto (lightbox, src/ui/lightbox.js): MISMA mecánica de
 * centinela que la hoja, con una diferencia: el visor SIEMPRE empuja su propia
 * entrada al abrir (ensureLightboxSentinel), no solo a profundidad 0 — se
 * abre encima de cualquier pantalla (Ficha empujada, hoja abierta o la raíz) y
 * su primera pulsación de atrás debe cerrarlo a él sin tocar lo de debajo. Su
 * closer (registerLightboxCloser) se consulta ANTES que el de la hoja: el
 * visor está siempre encima de la hoja abierta.
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

/**
 * ¿La entrada superior del historial es una centinela de hoja (empujada por
 * ensureSheetSentinel al abrir una hoja a profundidad 0)? Mientras es true,
 * el siguiente popstate consulta el closer y la pulsación se consume cerrando
 * la hoja; cualquier operación que retire la entrada superior (pop del atrás,
 * rebobinado de reset, back interno) la consume y limpia el flag.
 * @type {boolean}
 */
let sheetSentinel = false;

/**
 * ¿La centinela quedó huérfana (la hoja se cerró por ✕/fondo/Escape/cierre
 * programático y la entrada sigue arriba)? La consume la PRÓXIMA operación de
 * historial — un popstate (el atrás del sistema la poppea y restaura la raíz,
 * que lleva la misma instantánea), un push (la reutiliza como entrada de la
 * pantalla nueva), un back interno, un replace o un reset — para no dejar
 * entradas basura ni dobles pulsaciones de atrás. Consumo diferido a
 * propósito: history.back() es asíncrono y un push síncrono posterior (p. ej.
 * el duplicado del Alta) lo adelantaría y poppearía la entrada nueva.
 * @type {boolean}
 */
let orphanedSentinel = false;

/**
 * ¿La entrada superior del historial es la centinela del visor de capturas
 * (empujada por ensureLightboxSentinel al abrir el lightbox)? El visor SIEMPRE
 * empuja su propia entrada al abrir (a diferencia de la hoja, que solo la pide
 * a profundidad 0): así la primera pulsación de atrás poppea la entrada del
 * visor y lo cierra sin tocar la pantalla de debajo — ni la hoja abierta ni la
 * Ficha. Mientras es true, el popstate consulta el closer del visor ANTES que
 * el de la hoja (el visor está encima); cualquier operación que retire la
 * entrada superior la consume y limpia el flag.
 * @type {boolean}
 */
let lightboxSentinel = false;

/**
 * ¿La centinela del visor quedó huérfana (cerrado por ✕/fondo/Escape/cierre
 * programático con la entrada aún arriba)? Misma mecánica que la centinela de
 * hoja: la consume la PRÓXIMA operación de historial; el popstate que la
 * poppea es un no-op visible — NO consulta el closer de la hoja, porque la
 * entrada consumida era del visor y la hoja de debajo sigue con su centinela.
 * @type {boolean}
 */
let orphanedLightboxSentinel = false;

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
 * Cierre del visor de capturas registrado por el módulo del visor
 * (src/ui/lightbox.js): devuelve true si la pulsación atrás del sistema se
 * consumió cerrando el visor. Se consulta ANTES que el de la hoja: el visor
 * está siempre encima de cualquier hoja abierta.
 * @type {(() => boolean)|null}
 */
let lightboxCloser = null;

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
    // Restauración de scroll propia por superficie (src/scroll.js): con el
    // 'auto' nativo el navegador re-ancla el scroll del documento en cada
    // popstate (su posición grabada por entrada) y pisa el scrollTo del
    // render — el atrás del móvil volvía a la Estantería en 0 en vez de
    // reponer su posición. 'manual' deja la restauración en manos de la app.
    if ('scrollRestoration' in history) {
      try {
        history.scrollRestoration = 'manual';
      } catch {
        // Sin soporte (navegadores antiguos): el navegador restaura por su
        // cuenta; la app no puede evitarlo.
      }
    }
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
      // traza previa. El rebobinado también consumió la centinela si la hoja
      // estaba abierta (la supervivencia de la hoja entre pestañas queda
      // congelada, ADR-0008: sin centinela, el atrás ya no la cierra) y la del
      // visor (su cierre por atrás también queda congelado).
      pendingReset = false;
      depth = 0;
      sheetSentinel = false;
      orphanedSentinel = false;
      lightboxSentinel = false;
      orphanedLightboxSentinel = false;
      try {
        history.replaceState({ app: snapshot(store) }, '');
      } catch {
        // Sin historial utilizable: nada que re-escribir.
      }
      return;
    }
    if (orphanedLightboxSentinel) {
      // El pop consumió la centinela huérfana del visor (ya cerrado por ✕,
      // fondo, Escape o cierre programático): la entrada era del visor, no una
      // pantalla — sin cambio visible. NO se consulta el closer de la hoja:
      // una hoja abierta debajo conserva su propia centinela intacta.
      orphanedLightboxSentinel = false;
      if (depth > 0) depth--;
      return;
    }
    if (lightboxCloser && lightboxCloser()) {
      // La pulsación atrás se consumió cerrando el visor: su centinela (que
      // está SIEMPRE arriba mientras el visor está abierto) se poppeó y nada
      // de debajo cambió — el visor no es una pantalla, solo se retira su
      // entrada y se limpia el flag. La profundidad baja en uno.
      lightboxSentinel = false;
      orphanedLightboxSentinel = false;
      if (depth > 0) depth--;
      return;
    }
    if (sheetCloser && sheetCloser()) {
      // La pulsación atrás se consumió cerrando la hoja: se deshace el pop
      // re-empujando la pantalla actual; la profundidad no cambia y no se
      // restaura nada (la hoja no es una pantalla).
      const wasSentinel = sheetSentinel;
      sheetSentinel = false;
      orphanedSentinel = false;
      try {
        if (wasSentinel) {
          // La pulsación consumió la centinela (hoja abierta a profundidad 0):
          // el pop llegó a la raíz, que lleva la misma instantánea; se
          // re-escribe en vez de re-empujar para no dejar entradas duplicadas.
          depth = 0;
          history.replaceState({ app: snapshot(store) }, '');
        } else {
          history.pushState({ app: snapshot(store) }, '');
        }
      } catch {
        // Sin historial utilizable: nada que re-empujar.
      }
      return;
    }
    if (sheetSentinel) {
      // El pop consumió la centinela sin hoja que cerrar (caso defensivo):
      // la entrada ya no está arriba y el flag no debe sobrevivir.
      sheetSentinel = false;
    }
    if (orphanedSentinel) {
      // El pop consumió la centinela huérfana (la hoja ya se había cerrado):
      // se restaura la raíz, que lleva la misma instantánea — sin cambio
      // visible, y la pila queda limpia.
      orphanedSentinel = false;
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
    // Pantalla nueva: entrada con la instantánea de lo recién pintado. Si la
    // centinela quedó huérfana (hoja o visor cerrados sin consumir), es la
    // entrada actual: el push la REUTILIZA como entrada de la pantalla nueva en
    // vez de empujar otra — la pila no crece y el atrás del sistema restaura la
    // raíz (p. ej. el duplicado del Alta: cerrar hoja + abrir Ficha).
    if (orphanedSentinel || orphanedLightboxSentinel) {
      orphanedSentinel = false;
      orphanedLightboxSentinel = false;
      try {
        history.replaceState({ app: snapshot(store) }, '');
      } catch {
        // Sin historial utilizable: nada que re-escribir.
      }
      return;
    }
    depth++;
    sheetSentinel = false;
    try {
      history.pushState({ app: snapshot(store) }, '');
    } catch {
      depth--;
    }
    return;
  }
  if (kind === 'replace') {
    // Sustituye la entrada actual (p. ej. la Ficha de un juego borrado):
    // la profundidad no cambia, el back del sistema salta a la previa. Si la
    // entrada actual era una centinela, deja de serlo (pasa a ser una entrada
    // real con la instantánea viva).
    sheetSentinel = false;
    orphanedSentinel = false;
    lightboxSentinel = false;
    orphanedLightboxSentinel = false;
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
    // El rebobinado consume la centinela (huérfana o no) que estuviera arriba.
    sheetSentinel = false;
    orphanedSentinel = false;
    lightboxSentinel = false;
    orphanedLightboxSentinel = false;
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
    // El back interno también consume la centinela (huérfana o no) si estaba
    // arriba: la entrada que poppea es la suya.
    depth--;
    pendingSwallow++;
    sheetSentinel = false;
    orphanedSentinel = false;
    lightboxSentinel = false;
    orphanedLightboxSentinel = false;
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
 * Entrada centinela para una hoja abierta a profundidad 0 (el módulo de hojas
 * la pide al abrir): sin entrada propia, el atrás del sistema no dispara
 * popstate y el closer de hojas nunca se consultaría. Empuja una entrada
 * marcada ({app: null}: restore() la ignora, no es una pantalla restaurable)
 * y la deja como entrada superior; el siguiente atrás del sistema la poppea,
 * consulta el closer y la pulsación se consume cerrando la hoja. No-op si ya
 * hay profundidad (el atrás ya tiene una entrada que poppear) o si la
 * centinela ya está arriba; si quedó una centinela huérfana (hoja cerrada sin
 * consumir), la nueva hoja la re-utiliza en vez de empujar otra.
 * @returns {boolean} true si la hoja tiene centinela arriba.
 */
export function ensureSheetSentinel() {
  if (typeof history === 'undefined') return false;
  if (depth > 0) return false;
  if (sheetSentinel) return false;
  if (orphanedSentinel) {
    // La centinela huérfana sigue arriba (nada tocó el historial desde el
    // cierre): la nueva hoja la re-utiliza.
    orphanedSentinel = false;
    sheetSentinel = true;
    return true;
  }
  depth++;
  sheetSentinel = true;
  try {
    history.pushState({ app: null }, '');
  } catch {
    depth--;
    sheetSentinel = false;
    return false;
  }
  return true;
}

/**
 * Consume la centinela al cerrar la hoja por una vía que no es el atrás del
 * sistema (✕, fondo, Escape, cierre programático). Consumo DIFERIDO: la
 * entrada centinela queda marcada como huérfana y la consume la próxima
 * operación de historial — el atrás del sistema la poppea (restaura la raíz,
 * que lleva la misma instantánea: sin cambio visible), un push la reutiliza
 * como entrada de la pantalla nueva, un back interno/replace/reset la retira.
 * No-op sin centinela pendiente (el atrás del sistema ya la consumió con su
 * popstate).
 */
export function consumeSheetSentinel() {
  if (!sheetSentinel) return;
  sheetSentinel = false;
  orphanedSentinel = true;
}

/**
 * Entrada centinela del visor de capturas (el módulo del visor la pide al
 * abrir, SIEMPRE — a diferencia de la hoja, que solo la pide a profundidad 0):
 * el visor se abre encima de cualquier pantalla (Ficha empujada, hoja abierta
 * o la raíz) y necesita una entrada propia arriba para que la primera pulsación
 * de atrás del sistema lo cierre sin tocar lo de debajo. Empuja una entrada
 * marcada ({app: null}: restore() la ignora, no es una pantalla restaurable) y
 * la deja como entrada superior; el siguiente atrás del sistema la poppea,
 * consulta el closer del visor y la pulsación se consume cerrándolo. No-op si
 * la centinela ya está arriba; si quedó una huérfana (visor cerrado sin
 * consumir), la re-utiliza en vez de empujar otra.
 * @returns {boolean} true si el visor tiene centinela arriba.
 */
export function ensureLightboxSentinel() {
  if (typeof history === 'undefined') return false;
  if (lightboxSentinel) return false;
  if (orphanedLightboxSentinel) {
    // La centinela huérfana sigue arriba (nada tocó el historial desde el
    // cierre): el visor nuevo la re-utiliza.
    orphanedLightboxSentinel = false;
    lightboxSentinel = true;
    return true;
  }
  depth++;
  lightboxSentinel = true;
  try {
    history.pushState({ app: null }, '');
  } catch {
    depth--;
    lightboxSentinel = false;
    return false;
  }
  return true;
}

/**
 * Consume la centinela al cerrar el visor por una vía que no es el atrás del
 * sistema (✕, fondo, Escape, cierre programático). Consumo DIFERIDO, igual que
 * la centinela de hoja: la entrada queda marcada como huérfana y la consume la
 * próxima operación de historial. No-op sin centinela pendiente (el atrás del
 * sistema ya la consumió con su popstate).
 */
export function consumeLightboxSentinel() {
  if (!lightboxSentinel) return;
  lightboxSentinel = false;
  orphanedLightboxSentinel = true;
}

/**
 * Registra el cierre del visor de capturas (src/ui/lightbox.js): el popstate
 * que no se traga consulta el cierre del visor ANTES que el de la hoja; si
 * devuelve true, la pulsación atrás se consumió cerrando el visor y la
 * pantalla de debajo no cambia.
 * @param {() => boolean} fn
 */
export function registerLightboxCloser(fn) {
  lightboxCloser = fn;
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
  sheetSentinel = false;
  orphanedSentinel = false;
  lightboxSentinel = false;
  orphanedLightboxSentinel = false;
  installed = false;
  sheetCloser = null;
  lightboxCloser = null;
  if (popHandler && typeof window !== 'undefined') {
    window.removeEventListener('popstate', popHandler);
  }
  popHandler = null;
}
