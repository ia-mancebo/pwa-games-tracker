/**
 * Intents de las transiciones de la Biblioteca (ADR-0005): única interface que
 * posee las reglas de navegación — cambiar de pestaña (las tres pestañas del
 * raíl son pestañas raíz: pulsarlas reinicia la pila y el atrás del sistema no
 * recorre las pantallas previas; volver a Biblioteca repone la estantería
 * conservando búsqueda y filtros; cualquier cambio de pestaña cierra la
 * Ficha), abrir Panel, volver a Estantería, abrir la Ficha en la misma pestaña
 * o cambiando de pestaña (push único), cerrar la Ficha (siempre navigate-back,
 * que degrada a set sin profundidad) y la reposición a estantería tras borrar
 * un juego (replace). Cada intent es el único punto que patchea el slice de
 * Biblioteca para navegar: el módulo mecánico de backnav (src/backnav.js) no
 * conoce estas reglas y las vistas no las re-encodan.
 */
import { navigate } from './backnav.js';
import { freshFicha } from './app.js';

/**
 * Cambia de pestaña. Las pestañas del raíl son pestañas raíz: cambiar de
 * pestaña reinicia la pila (kind 'reset' en backnav, ADR-0007) — la pestaña
 * pulsada pasa a ser la primera entrada y el atrás del sistema no recorre las
 * pantallas previas. Dos reglas (tickets 14/17): (a) pulsar Biblioteca repone
 * la estantería conservando búsqueda y filtros, venga de otra pestaña o ya
 * estando en ella con Panel o Ficha abiertos; (b) cualquier cambio de pestaña
 * cierra la Ficha abierta. Solo llamar con pestañas válidas: el guard vive en
 * la vista (app.js).
 * @param {import('./app.js').Store} store
 * @param {string} tab
 */
export function switchTab(store, tab) {
  const library = store.get().library;
  if (tab === 'biblioteca') {
    navigate(store, 'reset', {
      tab,
      library: { ...library, view: 'shelves', panelStatus: null, gameId: null },
    });
    return;
  }
  navigate(store, 'reset', { tab, library: { ...library, gameId: null } });
}

/**
 * Abre el Panel de un Estado conservando los filtros. Pantalla nueva: empuja
 * entrada de historial (botón atrás del móvil).
 * @param {import('./app.js').Store} store
 * @param {import('./domain/schema.js').Status} status
 */
export function openPanel(store, status) {
  navigate(store, 'push', {
    library: { ...store.get().library, view: 'panel', panelStatus: status },
  });
}

/**
 * Vuelve del Panel a la Estantería; conserva los filtros. Consume la entrada
 * de historial del panel para que el botón atrás del sistema no la repita.
 * @param {import('./app.js').Store} store
 */
export function backToShelves(store) {
  navigate(store, 'back', {
    library: { ...store.get().library, view: 'shelves', panelStatus: null },
  });
}

/**
 * Abre la Ficha de un juego en la misma pestaña; conserva la vista y los
 * filtros activos para que «← Volver» regrese a la superficie previa. Pantalla
 * nueva: empuja entrada de historial. Siembra el estado efímero de la Ficha
 * (slice ficha, ADR-0006) en la MISMA transición: el snapshot del historial
 * solo lleva tab/library/novedades, así que la siembra vive únicamente en el
 * store en vivo y el botón atrás del móvil nunca resucita un formulario
 * abierto ni una confirmación de borrado.
 * @param {import('./app.js').Store} store
 * @param {string} gameId
 */
export function openGame(store, gameId) {
  navigate(store, 'push', {
    library: { ...store.get().library, gameId },
    ficha: freshFicha(gameId),
  });
}

/**
 * Abre la Ficha de un juego cambiando de pestaña (patrón del Top 5 de
 * estadísticas y del duplicado del Alta): UNA sola entrada de historial con
 * pestaña + gameId, para que el botón atrás del móvil regrese al origen.
 * Siembra el estado efímero de la Ficha como {@link openGame} (ADR-0006).
 * @param {import('./app.js').Store} store
 * @param {string} gameId
 * @param {string} tab
 */
export function openGameInTab(store, gameId, tab) {
  navigate(store, 'push', {
    tab,
    library: { ...store.get().library, gameId },
    ficha: freshFicha(gameId),
  });
}

/**
 * Cierra la Ficha volviendo a la superficie anterior. Siempre navigate-back:
 * consume la entrada de la Ficha; con profundidad 0 degrada a un set sin
 * operación de historial (src/backnav.js). Comportamiento idéntico desde el
 * «← Volver» y desde el botón atrás del sistema.
 * @param {import('./app.js').Store} store
 */
export function closeGame(store) {
  navigate(store, 'back', { library: { ...store.get().library, gameId: null } });
}

/**
 * Reposición tras borrar un juego: la Ficha ya no existe, su entrada de
 * historial se sustituye por la estantería (replace; la profundidad no cambia
 * y el back del sistema salta a la pantalla previa, nunca a la Ficha borrada).
 * @param {import('./app.js').Store} store
 */
export function repositionAfterDelete(store) {
  navigate(store, 'replace', {
    library: { ...store.get().library, view: 'shelves', panelStatus: null, gameId: null },
  });
}