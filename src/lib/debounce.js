/**
 * Utilidad de debounce (trailing): relanza el temporizador en cada llamada y
 * ejecuta la función cuando pasan `ms` sin llamadas. Usada por el buscador de
 * la biblioteca (150 ms, spec §8.3).
 */

/**
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F}
 */
export function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return /** @type {F} */ (
    /** @type {unknown} */ (
      /** @param {...any[]} args */ (...args) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      }
    )
  );
}
