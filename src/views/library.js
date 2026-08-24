import { html } from '../lib/dom.js';

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  container.innerHTML = html`<div class="fade">
    <header class="view-head">
      <h1>Biblioteca</h1>
      <p class="sub">Tu estantería: una balda por Estado del juego.</p>
    </header>
    <p class="empty">
      <b>La biblioteca está vacía</b>
      Añade tu primer juego para empezar la estantería.
    </p>
  </div>`;
}
