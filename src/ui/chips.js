/**
 * Filas de chips para filtros por dimensión (spec §8.3/§8.7): selección única,
 * scroll horizontal, chips nowrap.
 */
import { html, raw } from '../lib/dom.js';

/**
 * @typedef {'genre'|'platform'|'tag'} ChipDim
 */

/**
 * Fila de chips de una dimensión. `data-f-<dim>` lleva el valor; con
 * `allLabel` se antepone el chip «Todas/Todos» de valor vacío (dashboard).
 * @param {{ dim: ChipDim, label: string, values: string[], active: string|null, allLabel?: string }} options
 * @returns {string}
 */
export function chipRowHtml({ dim, label, values, active, allLabel }) {
  return html`<div class="chip-row" role="group" aria-label="${label}" data-dim="${dim}">
    ${allLabel != null
      ? raw(
          html`<button type="button" class="chip${active == null ? ' on' : ''}" data-f-${dim}="">
            ${allLabel}
          </button>`,
        )
      : ''}
    ${values.map((v) =>
      raw(
        html`<button type="button" class="chip${active === v ? ' on' : ''}" data-f-${dim}="${v}">
          ${v}
        </button>`,
      ),
    )}
  </div>`;
}
