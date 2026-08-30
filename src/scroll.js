/**
 * Posición de scroll por superficie de la Biblioteca (ADR-0005). La app pinta
 * todas las superficies en el mismo `<main>` y el scroll es el del documento
 * (ninguna caja interna scrollea): al navegar entre superficies, el scroll de
 * la saliente se hereda en la entrante. Regla: la Estantería conserva su
 * scroll al salir y lo repone al volver — «cuando vuelva atrás a la
 * Biblioteca, conserva el scroll que tenía»; el Panel y la Ficha llegan
 * siempre arriba. Los cambios dentro de la misma superficie (búsqueda,
 * filtros, «Cargar más», vuelco de archivo) no tocan el scroll. Fuera de
 * Biblioteca (Novedades, Estadísticas) no se gobierna nada: conservan su
 * comportamiento actual.
 */

/** Última posición guardada de la Estantería. @type {number} */
let shelvesScroll = 0;

/**
 * Superficie actual: la pantalla que define el scroll del documento. Dentro
 * de Biblioteca distingue Estantería / Panel / Ficha; las demás pestañas son
 * una superficie única, sin reglas de scroll. Búsqueda, filtros y paginación
 * NO cambian de superficie: cambiar de consulta no debe saltar el scroll.
 * @param {import('./app.js').AppState} state
 * @returns {string}
 */
function surfaceKey(state) {
  if (state.tab !== 'biblioteca') return `tab:${state.tab}`;
  if (state.library.gameId != null) return 'ficha';
  return state.library.view === 'panel' ? 'panel' : 'shelves';
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
  }
  if (to === 'shelves') return shelvesScroll;
  if (to === 'panel' || to === 'ficha') return 0;
  return null;
}