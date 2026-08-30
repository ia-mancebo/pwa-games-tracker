import { html } from '../lib/dom.js';
import { openLightbox } from './lightbox.js';

/** Contenedores ya cableados: el wiring es idempotente por contenedor. */
const wired = new WeakSet();

/**
 * Sección «Galería» con las capturas en scroll horizontal; '' si no hay
 * ninguna (sin hueco vacío ni error).
 * @param {string[]} shots
 * @returns {string}
 */
export function galleryHtml(shots) {
  if (!shots || shots.length === 0) return '';
  return html`<section class="d-sec" data-sec="gallery">
    <h3>Galería</h3>
    <div class="d-gallery">
      ${shots.map(
        (url) =>
          html`<button type="button" class="d-shot" data-shot="${url}" aria-label="Ampliar captura">
            <img loading="lazy" src="${url}" alt="" />
          </button>`
      )}
    </div>
  </section>`;
}

/**
 * Cablea el clic de [data-shot] del contenedor al visor a pantalla completa.
 * Recopila TODAS las capturas del contenedor en orden de aparición y abre el
 * visor con la pulsada como índice inicial: así las flechas ‹ ›, el teclado
 * y el swipe recorren la galería completa. Delegación sobre el contenedor:
 * sobrevive a repintados de su contenido y muere con él; llamar dos veces
 * sobre el mismo contenedor es no-op.
 * @param {Element} container
 */
export function wireGallery(container) {
  if (wired.has(container)) return;
  wired.add(container);
  container.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const shot = e.target.closest('[data-shot]');
    if (!shot) return;
    const shots = [...container.querySelectorAll('[data-shot]')];
    const urls = shots
      .map((s) => s.getAttribute('data-shot'))
      .filter((u) => u !== null);
    if (urls.length === 0) return;
    openLightbox(urls, Math.max(0, shots.indexOf(shot)));
  });
}
