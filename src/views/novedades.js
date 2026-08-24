import { html } from '../lib/dom.js';

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  container.innerHTML = html`<div class="fade">
    <header class="view-head">
      <h1>Novedades</h1>
      <p class="sub">Recién salidos, próximos lanzamientos y populares.</p>
    </header>
    <p class="empty">
      <b>Novedades sin datos</b>
      Novedades necesita conexión la primera vez para descargar el calendario.
    </p>
  </div>`;
}
