import { html } from '../lib/dom.js';

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  container.innerHTML = html`<div class="fade">
    <header class="view-head">
      <h1>Estadísticas</h1>
      <p class="sub">Dashboard de tu biblioteca: KPIs, distribuciones y top valorados.</p>
    </header>
    <p class="empty">
      <b>Sin datos todavía</b>
      Las estadísticas aparecerán cuando haya juegos en la biblioteca.
    </p>
  </div>`;
}
