/**
 * Formateo de números para la UI (coma decimal española).
 */

/**
 * Media ★ a un decimal con coma; guión si no hay dato.
 * @param {number|null} value
 * @returns {string}
 */
export function formatAvg(value) {
  if (value == null) return '—';
  return String(Math.round(value * 10) / 10).replace('.', ',');
}
