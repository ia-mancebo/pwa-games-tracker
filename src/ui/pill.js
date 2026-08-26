/**
 * Píldora de Estado (color + fondo al 13 % + borde al 45 %, spec §9).
 */
import { html } from '../lib/dom.js';
import { STATUS_LABELS } from '../domain/schema.js';

/**
 * @param {import('../domain/schema.js').Status} status
 * @returns {string}
 */
export function statusPillHtml(status) {
  return html`<span class="pill st-${status}">${STATUS_LABELS[status]}</span>`;
}
