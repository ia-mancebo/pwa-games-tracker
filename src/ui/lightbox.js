/**
 * Visor de capturas (lightbox) de la Galería de la Ficha: primitiva de UI
 * autónoma junto a la hoja (src/ui/sheet.js), sin store ni globals ajenos —
 * estado propio del módulo. Una única capa `.lightbox.fade` con la captura
 * ampliada, su ✕ y las flechas ‹ › de navegación; cualquier toque fuera o
 * Escape cierra. La vista solo cablea el clic de [data-shot] a
 * {@link openLightbox}.
 *
 * Decisiones del módulo:
 * - Firma: {@link openLightbox} recibe la LISTA de URLs y el índice inicial
 *   (`openLightbox(urls, index)`); una cadena suelta se trata como galería de
 *   una sola captura (compatibilidad con la firma antigua). `wireGallery`
 *   recopila las URLs `[data-shot]` del contenedor en orden y abre con el
 *   índice del clicado.
 * - Extremos: envolver (wrap-around). Al llegar al último se continúa por el
 *   primero y viceversa; idéntico para botones, teclado y swipe, así nunca
 *   hay que deshabilitar ni ocultar controles.
 * - Navegar cambia SOLO el `src` del `<img>` (y el índice interno); la capa
 *   no se reconstruye, así la animación `.fade` no se re-dispara.
 * - Los botones ‹ › y el swipe NO cierran: el clic de la capa filtra los
 *   botones de navegación, y un swipe marcado suprime el clic sintético que
 *   el navegador dispara tras el gesto. El clic en imagen/fondo sigue
 *   cerrando.
 */
import { html, qs } from '../lib/dom.js';

/** Desplazamiento horizontal mínimo (px) para considerar un swipe. */
const SWIPE_THRESHOLD = 40;

/** Capa del visor abierta. @type {HTMLElement|null} */
let lightboxLayer = null;

/** @type {((e: KeyboardEvent) => void)|null} */
let lightboxKeyHandler = null;

/** Galería abierta, en orden de la vista. @type {string[]} */
let lightboxUrls = [];

/** Índice de la captura mostrada. @type {number} */
let lightboxIndex = 0;

/** Origen X del toque en curso (swipe). @type {number|null} */
let touchStartX = null;

/** Última X del toque en curso. @type {number|null} */
let touchLastX = null;

/** Un swipe acaba de navegar: el clic sintético siguiente no debe cerrar. */
let suppressClick = false;

/**
 * Muestra la captura `index` de la galería: solo cambia el `src` del `<img>`
 * y el índice interno; la capa no se reconstruye (sin re-disparar `.fade`).
 * Envuelve en los extremos (decisión del módulo, ver JSDoc de cabecera).
 * @param {number} next
 */
function goTo(next) {
  if (!lightboxLayer || lightboxUrls.length === 0) return;
  lightboxIndex = ((next % lightboxUrls.length) + lightboxUrls.length) % lightboxUrls.length;
  const img = qs('img', lightboxLayer);
  if (img) img.setAttribute('src', lightboxUrls[lightboxIndex]);
}

/**
 * Abre el visor a pantalla completa con la captura `index` de la galería.
 * @param {string | string[]} urls
 * @param {number} [index]
 */
export function openLightbox(urls, index = 0) {
  const list = (typeof urls === 'string' ? [urls] : urls).filter(Boolean);
  if (!list || list.length === 0 || lightboxLayer?.isConnected) return;
  lightboxUrls = list;
  lightboxIndex = Math.min(Math.max(index, 0), list.length - 1);
  lightboxLayer = document.createElement('div');
  lightboxLayer.className = 'lightbox fade';
  lightboxLayer.setAttribute('role', 'dialog');
  lightboxLayer.setAttribute('aria-modal', 'true');
  lightboxLayer.setAttribute('aria-label', 'Captura ampliada');
  lightboxLayer.innerHTML = html`<img src="${lightboxUrls[lightboxIndex]}" alt="Captura ampliada" />
    <button type="button" class="chip lightbox-nav lightbox-prev" data-lightbox-nav="prev" aria-label="Anterior">
      ‹
    </button>
    <button type="button" class="chip lightbox-nav lightbox-next" data-lightbox-nav="next" aria-label="Siguiente">
      ›
    </button>
    <button type="button" class="chip lightbox-close" data-close-lightbox aria-label="Cerrar">
      ✕
    </button>`;
  document.body.appendChild(lightboxLayer);
  // Las flechas navegan; su clic no debe burbujear al cierre de la capa.
  qs('[data-lightbox-nav="prev"]', lightboxLayer)?.addEventListener('click', () =>
    goTo(lightboxIndex - 1)
  );
  qs('[data-lightbox-nav="next"]', lightboxLayer)?.addEventListener('click', () =>
    goTo(lightboxIndex + 1)
  );
  // Cualquier toque fuera (fondo o imagen) cierra; es un visor, no un
  // formulario. Los botones de navegación y el clic tras un swipe no cierran.
  lightboxLayer.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (e.target instanceof HTMLElement && e.target.closest('[data-lightbox-nav]')) return;
    closeLightbox();
  });
  // Swipe táctil: izquierda → siguiente, derecha → anterior. El umbral evita
  // que un toque con dedo tembloroso navegue; el swipe nunca cierra.
  lightboxLayer.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      touchStartX = t.clientX;
      touchLastX = t.clientX;
    },
    { passive: true }
  );
  lightboxLayer.addEventListener(
    'touchmove',
    (e) => {
      const t = e.changedTouches?.[0];
      if (t) touchLastX = t.clientX;
    },
    { passive: true }
  );
  lightboxLayer.addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches?.[0];
      if (touchStartX == null || !t) {
        touchStartX = null;
        touchLastX = null;
        return;
      }
      const dx = (t.clientX ?? touchLastX) - touchStartX;
      touchStartX = null;
      touchLastX = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      // El navegador dispara un clic tras el gesto: marcarlo para que el
      // handler de clic no cierre el visor recién navegado.
      suppressClick = true;
      if (dx < 0) goTo(lightboxIndex + 1);
      else goTo(lightboxIndex - 1);
    },
    { passive: true }
  );
  lightboxKeyHandler = (e) => {
    if (!lightboxLayer?.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(lightboxIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(lightboxIndex + 1);
    }
  };
  document.addEventListener('keydown', lightboxKeyHandler);
}

/** Cierra el visor y retira sus listeners globales. */
export function closeLightbox() {
  if (lightboxKeyHandler) {
    document.removeEventListener('keydown', lightboxKeyHandler);
    lightboxKeyHandler = null;
  }
  lightboxLayer?.remove();
  lightboxLayer = null;
  lightboxUrls = [];
  lightboxIndex = 0;
  touchStartX = null;
  touchLastX = null;
  suppressClick = false;
}