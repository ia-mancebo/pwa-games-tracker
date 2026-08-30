/**
 * Posición de scroll por superficie (ADR-0005/0008). La app pinta todas las
 * superficies en el mismo `<main>` y el scroll es el del documento (ninguna
 * caja interna scrollea): al navegar entre superficies, el scroll de la
 * saliente se hereda en la entrante. Regla: la Estantería y el tablón de
 * Novedades conservan su scroll al salir y lo reponen al volver — «cuando
 * vuelva atrás a la Biblioteca/Novedades, conserva el scroll que tenía»; el
 * Panel, la Ficha y el drill-down de Novedades llegan siempre arriba. Los
 * cambios dentro de la misma superficie (búsqueda, filtros, «Cargar más»,
 * Ficha externa del tablón, vuelco de archivo) no tocan el scroll.
 * Estadísticas no se gobierna: conserva su comportamiento actual.
 */

/** Última posición guardada de la Estantería. @type {number} */
let shelvesScroll = 0;

/** Última posición guardada del tablón de Novedades. @type {number} */
let boardScroll = 0;

/**
 * Superficie actual: la pantalla que define el scroll del documento. Dentro
 * de Biblioteca distingue Estantería / Panel / Ficha; dentro de Novedades,
 * tablón / drill-down de sección (el género y la Ficha externa son filtro y
 * hoja: NO cambian de superficie). Las demás pestañas son una superficie
 * única, sin reglas de scroll. Búsqueda, filtros y paginación no cambian de
 * superficie: cambiar de consulta no debe saltar el scroll.
 * @param {import('./app.js').AppState} state
 * @returns {string}
 */
function surfaceKey(state) {
  if (state.tab === 'biblioteca') {
    if (state.library.gameId != null) return 'ficha';
    return state.library.view === 'panel' ? 'panel' : 'shelves';
  }
  if (state.tab === 'novedades') {
    return state.novedades.section != null ? 'novedades:section' : 'novedades:board';
  }
  return `tab:${state.tab}`;
}

/**
 * Reposiciona el scroll al cambiar de superficie. Devolver el destino ANTES
 * de re-renderizar: la lectura de `window.scrollY` debe ver todavía el DOM de
 * la superficie saliente. `null` = no tocar nada.
 * @param {import('./app.js').AppState|null} prev Estado del render anterior.
 * @param {import('./app.js').AppState} next Estado recién pintado.
 * @returns {number|null} Destino del scroll del documento, o null sin cambio.
 */
export function settleScroll(prev, next) {
  const from = prev == null ? null : surfaceKey(prev);
  const to = surfaceKey(next);
  if (from === to) return null;
  if (from === 'shelves') {
    shelvesScroll = window.scrollY ?? 0;
  } else if (from === 'novedades:board') {
    boardScroll = window.scrollY ?? 0;
  }
  if (to === 'shelves') return shelvesScroll;
  if (to === 'novedades:board') return boardScroll;
  if (to === 'panel' || to === 'ficha' || to === 'novedades:section') return 0;
  return null;
}

/** Reinicia las posiciones guardadas (aislación entre pruebas). */
export function resetScroll() {
  shelvesScroll = 0;
  boardScroll = 0;
}