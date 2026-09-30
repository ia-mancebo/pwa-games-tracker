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

/**
 * Reloj vivo `H:MM:SS` (horas sin rellenar, min/seg con dos dígitos).
 * No enteros → floor; negativos → 0.
 * @param {number} seconds
 * @returns {string}
 */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Histórico redondo «12 h 34 min» / «12 h» / «34 min» / «0 min».
 * Minutos redondeados = Math.round(seconds/60). undefined/null → '—'.
 * No enteros → floor; negativos → 0.
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
export function formatRoundedHours(seconds) {
  if (seconds == null) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const totalMin = Math.round(total / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}
