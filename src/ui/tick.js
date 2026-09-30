/**
 * Tictac global mínimo del shell (ticket 06): un solo `setInterval(1000)`
 * compartido por todos los suscriptores — nace con el primero y muere con el
 * último —, sin store y sin DOM propios. Cada suscriptor recibe el `Date`
 * actual al suscribirse y en cada tic, y limpia con la función devuelta. La
 * Ficha (src/views/game.js) lo usa para su reloj vivo y lo reutilizará el Aviso
 * del contador (ticket 08): el tictac nunca escribe el Doc, solo alimenta
 * relojes de UI efímeros.
 */

/** @type {Set<(now: Date) => void>} */
const subscribers = new Set();

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;

function start() {
  if (timer != null) return;
  timer = setInterval(() => {
    const now = new Date();
    for (const fn of [...subscribers]) fn(now);
  }, 1000);
}

function stop() {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Suscribe `fn` al tictac global: se llama ya con el instante actual y luego
 * cada segundo. Devuelve la funcion de limpieza; el temporizador compartido se
 * detiene al desuscribir al ultimo suscriptor. El intervalo se (re)crea en cada
 * alta: un `timer` heredado de otro reloj (un mundo de timers distinto) no
 * vuelve a disparar y bloquearia `start`; recrearlo mantiene vivo exactamente
 * un intervalo, compartido por todos.
 * @param {(now: Date) => void} fn
 * @returns {() => void}
 */
export function subscribeTick(fn) {
  subscribers.add(fn);
  stop();
  start();
  fn(new Date());
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}
