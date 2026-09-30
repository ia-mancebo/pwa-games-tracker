/**
 * Aviso del Contador en todas las pantallas (ticket 08): barra del chrome,
 * encima de cualquier vista, con el Juego anclado, su reloj vivo y un Pausar
 * inline; señala los Tramos pendientes de revisión. El cuerpo entero abre la
 * Ficha de su Juego (navegación existente, con su pila atrás).
 *
 * Mismo patrón de render que el filebar (src/ui/filebar.js): el render
 * completo (innerHTML) solo corre cuando cambia la ESTRUCTURA; el reloj vivo
 * se actualiza en sitio por el tictac global (src/ui/tick.js), que nunca
 * escribe el Doc ni re-renderiza la vista. El Doc es la única fuente: el
 * ancla y los pendientes viven en él.
 */
import { html, qs } from '../lib/dom.js';
import { formatClock } from '../lib/format.js';
import { counterElapsedSeconds, firstPendingGame, pendingSegmentCount } from '../domain/selectors.js';
import { pauseCounter } from '../data/ficha.js';
import { store } from '../app.js';
import * as nav from '../navigation.js';
import { subscribeTick } from './tick.js';

/**
 * Estado visible del aviso: el Contador válido en marcha o, sin él, los
 * Tramos pendientes de revisión.
 * @typedef {{
 *   gameId: string,
 *   title: string,
 *   counting: boolean,
 *   counter: import('../domain/schema.js').CounterAnchor|null,
 *   pending: number,
 * }} AvisoState
 */

/**
 * Estado del aviso, o null si no hay nada que mostrar. El ancla huérfana (el
 * juego o la jugada ya no existen) se ignora: no se muestra nada ni se rompe;
 * una poda (boot) la limpiará del Doc.
 * @param {import('../domain/schema.js').Doc|null} doc
 * @returns {AvisoState|null}
 */
function avisoState(doc) {
  if (!doc) return null;
  const anchor = doc.counter;
  if (anchor) {
    const game = doc.games.find((g) => g.id === anchor.gameId);
    const play = game?.plays.find((p) => p.id === anchor.playId);
    if (!game || !play) return null;
    return {
      gameId: game.id,
      title: game.title,
      counting: true,
      counter: anchor,
      pending: pendingSegmentCount(doc),
    };
  }
  const pending = pendingSegmentCount(doc);
  const game = pending > 0 ? firstPendingGame(doc) : null;
  if (!game) return null;
  return { gameId: game.id, title: game.title, counting: false, counter: null, pending };
}

/**
 * Segundos transcurridos desde el inicio del Contador (el reloj del aviso
 * muestra el tramo en marcha; el Doc no se escribe por segundo). Selector
 * compartido de dominio.
 * @param {import('../domain/schema.js').CounterAnchor} counter
 * @param {number} nowMs
 * @returns {number}
 */
function elapsedSeconds(counter, nowMs) {
  return counterElapsedSeconds(counter, new Date(nowMs));
}

/**
 * Clave estructural del aviso: si no cambia entre renders, el reloj vivo se
 * actualiza en sitio y el chrome queda intacto. Todo lo que pinta el render
 * completo (título, reloj, pendientes) entra en la clave; el valor del reloj
 * NO, porque lo mantiene el tictac.
 * @param {AvisoState} state
 * @returns {string}
 */
function structuralKey(state) {
  return [state.title, state.counting, state.pending > 0, state.pending].join('|');
}

/**
 * @param {AvisoState} state
 * @returns {string}
 */
function avisoHtml(state) {
  const clock =
    state.counting && state.counter
      ? html`<span class="mono aviso-live" data-aviso-live>${formatClock(
          elapsedSeconds(state.counter, Date.now())
        )}</span>`
      : '';
  const pending =
    state.pending > 0
      ? html`<span class="aviso-pendientes" data-aviso-pendientes="${state.pending}"
          >${state.pending} tramos pendientes de revisión</span
        >`
      : '';
  return html`<button type="button" class="aviso" data-aviso-open>
    <span class="aviso-title" data-aviso-title>${state.title}</span>${clock}${pending}
  </button>`;
}

/**
 * Botón Pausar inline, anidado en el cuerpo del aviso. Se crea por DOM porque
 * el parser HTML des-anida un `<button>` dentro de otro: el cuerpo debe seguir
 * siendo un único botón clicable.
 * @returns {HTMLButtonElement}
 */
function pauseButton() {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'chip chip-xs';
  el.setAttribute('data-aviso-pause', '');
  el.textContent = 'Pausar';
  return el;
}

/**
 * Re-ata los listeners del aviso. Solo tras un render completo: los nodos son
 * nuevos; el camino de reloj en sitio no toca listeners.
 * @param {HTMLElement} container
 */
function wire(container) {
  qs('[data-aviso-pause]', container)?.addEventListener('click', () => {
    void pauseCounter();
  });
  qs('[data-aviso-open]', container)?.addEventListener('click', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('[data-aviso-pause]')) return;
    const state = avisoState(store.get().doc);
    if (!state) return;
    if (store.get().tab === 'biblioteca') nav.openGame(store, state.gameId);
    else nav.openGameInTab(store, state.gameId, 'biblioteca');
  });
}

/**
 * Suscripción al tictac del reloj vivo: una sola a la vez (módulo), atada al
 * slot que la creó.
 * @type {{ slot: HTMLElement, off: () => void } | null}
 */
let tick = null;

/**
 * Repinta el reloj vivo con el elapsed del ancla actual (reconsulta el Doc).
 * Sin `[data-aviso-live]` se auto-cancela; la próxima renderización la re-crea.
 * @param {Date} now
 */
function onTick(now) {
  const live = qs('[data-aviso-live]');
  if (!live) {
    if (tick) {
      tick.off();
      tick = null;
    }
    return;
  }
  const counter = store.get().doc?.counter;
  if (!counter) return;
  live.textContent = formatClock(elapsedSeconds(counter, now.getTime()));
}

/**
 * Asegura la suscripción del reloj vivo del slot (idempotente). Solo se atada
 * a un slot vivo: los renders de raíces ya fuera del documento no tocan el
 * tictac, y un slot nuevo cancela la suscripción anterior para que el
 * temporizador nazca siempre con los timers vigentes.
 * @param {HTMLElement} slot
 */
function ensureTick(slot) {
  if (!slot.isConnected || tick?.slot === slot) return;
  if (tick) {
    tick.off();
    tick = null;
  }
  const off = subscribeTick(onTick);
  tick = { slot, off };
}

/**
 * Pinta el aviso en su slot del chrome (patrón filebar).
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function renderAviso(container, _store) {
  const slot = /** @type {HTMLElement} */ (container);
  const state = avisoState(store.get().doc);
  if (!state) {
    if (slot.innerHTML !== '') slot.innerHTML = '';
    slot.dataset.avisoKey = '';
    return;
  }
  const key = structuralKey(state);
  if (slot.dataset.avisoKey === key && slot.firstElementChild) {
    if (state.counting) ensureTick(slot);
    return;
  }
  slot.dataset.avisoKey = key;
  slot.innerHTML = avisoHtml(state);
  if (state.counting) qs('[data-aviso-live]', slot)?.after(pauseButton());
  wire(slot);
  if (state.counting) ensureTick(slot);
}
