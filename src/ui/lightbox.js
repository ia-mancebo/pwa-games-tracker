/**
 * Visor de capturas (lightbox) de la Galería de la Ficha: primitiva de UI
 * autónoma junto a la hoja (src/ui/sheet.js), sin store ni globals ajenos —
 * estado propio del módulo. Una única capa `.lightbox.fade` con la captura
 * ampliada y su ✕; cualquier toque fuera o Escape cierra. La vista solo
 * cablea el clic de [data-shot] a {@link openLightbox}.
 */
import { html } from '../lib/dom.js';

/** Capa del visor abierta. @type {HTMLElement|null} */
let lightboxLayer = null;

/** @type {((e: KeyboardEvent) => void)|null} */
let lightboxKeyHandler = null;

/**
 * Abre el visor a pantalla completa con una captura ampliada.
 * @param {string} url
 */
export function openLightbox(url) {
  if (!url || lightboxLayer?.isConnected) return;
  lightboxLayer = document.createElement('div');
  lightboxLayer.className = 'lightbox fade';
  lightboxLayer.setAttribute('role', 'dialog');
  lightboxLayer.setAttribute('aria-modal', 'true');
  lightboxLayer.setAttribute('aria-label', 'Captura ampliada');
  lightboxLayer.innerHTML = html`<img src="${url}" alt="Captura ampliada" />
    <button type="button" class="chip lightbox-close" data-close-lightbox aria-label="Cerrar">
      ✕
    </button>`;
  document.body.appendChild(lightboxLayer);
  // Cualquier toque fuera (fondo o imagen) cierra; es un visor, no un formulario.
  lightboxLayer.addEventListener('click', () => closeLightbox());
  lightboxKeyHandler = (e) => {
    if (e.key === 'Escape' && lightboxLayer?.isConnected) {
      e.preventDefault();
      closeLightbox();
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
}