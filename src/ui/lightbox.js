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
 * - Táctil: el gesto se resuelve en `touchend`. Swipe (dx ≥ umbral) navega
 *   sin cerrar; tap sobre una flecha ‹ › navega; tap sobre ✕/imagen/fondo
 *   cierra a la primera, sin depender del click sintético posterior. El
 *   paneo vertical (dy dominante) ni navega ni cierra. Los clicks sintéticos
 *   que el navegador dispara tras el toque se tragan con una ventana temporal
 *   de CLICK_SUPPRESS_MS desde el último `touchend` (no vale un booleano:
 *   un click diferido puede llegar con el gesto ya consumido, o no llegar
 *   nunca y tragarse la pulsación siguiente — Android no dispara el click).
 * - Ratón: el gesto no existe, así que todo se resuelve en el `click` de la
 *   capa (sin `touchend` previo la ventana está expirada y no se interpone):
 *   clic en una flecha navega, clic en imagen/fondo/✕ cierra. Los botones
 *   ‹ › no llevan listener propio: la capa consolida la navegación.
 * - Botón atrás del sistema (móvil): el visor participa en backnav como la
 *   hoja (src/ui/sheet.js) pero SIEMPRE empuja su propia entrada centinela al
 *   abrir (ensureLightboxSentinel) — se abre encima de cualquier pantalla
 *   (Ficha, hoja o raíz) y la primera pulsación de atrás debe cerrarlo a él.
 *   El cierre por atrás (closeTopLightbox) NO consume la centinela: el
 *   popstate ya la consumió; el cierre por ✕/fondo/Escape/programático la
 *   consume (consumeLightboxSentinel, consumo diferido). El closer se registra
 *   en backnav en cada open (asignación idempotente): así sobrevive a los
 *   resetBackNav de las pruebas y no hace falta registro en el arranque — un
 *   popstate solo puede consultarlo cuando hay centinela, y la centinela solo
 *   existe tras un open (ADR-0010: sin efectos de import).
 */
import { html, qs } from '../lib/dom.js';
import {
  ensureLightboxSentinel,
  consumeLightboxSentinel,
  registerLightboxCloser,
} from '../backnav.js';

/** Desplazamiento horizontal mínimo (px) para considerar un swipe. */
const SWIPE_THRESHOLD = 40;

/**
 * Ventana (ms) tras un `touchend` en la que el `click` de la capa se traga:
 * es el click sintético que el navegador dispara como eco del toque, y el
 * gesto ya se resolvió en el propio `touchend`. En ratón puro nunca hubo
 * toque (la ventana está expirada desde siempre) y el clic funciona normal.
 */
const CLICK_SUPPRESS_MS = 500;

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

/** Origen Y del toque en curso (paneo vertical). @type {number|null} */
let touchStartY = null;

/** Última Y del toque en curso. @type {number|null} */
let touchLastY = null;

/**
 * Último `touchend` (Date.now): los clicks sintéticos del navegador que
 * lleguen dentro de CLICK_SUPPRESS_MS se tragan en el handler de click —
 * el gesto táctil ya se resolvió en `touchend` y el click sería su eco.
 * @type {number}
 */
let lastTouchEndAt = -Infinity;

/**
 * ¿El cierre en curso viene del botón atrás del sistema (closeTopLightbox)? El
 * popstate de la centinela ya la consumió: el cierre no debe consumirla de
 * nuevo (doble pulsación de atrás).
 * @type {boolean}
 */
let closingViaBack = false;

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
  // En ratón el clic de la capa lo resuelve todo (las flechas ‹ › no llevan
  // listener propio): el eco sintético de un toque se traga dentro de la
  // ventana — sin toques previos está expirada y nada se interpone.
  lightboxLayer.addEventListener('click', (e) => {
    if (Date.now() - lastTouchEndAt < CLICK_SUPPRESS_MS) return;
    if (e.target instanceof HTMLElement) {
      const nav = e.target.closest('[data-lightbox-nav]');
      if (nav) {
        goTo(lightboxIndex + (nav.getAttribute('data-lightbox-nav') === 'next' ? 1 : -1));
        return;
      }
    }
    closeLightbox();
  });
  // Táctil: solo se registra el gesto; la resolución ocurre en `touchend`. El
  // umbral evita que un toque con dedo tembloroso navegue; el swipe nunca
  // cierra y el paneo vertical (del que se hace cargo el navegador) tampoco.
  lightboxLayer.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      touchStartX = t.clientX;
      touchLastX = t.clientX;
      touchStartY = t.clientY;
      touchLastY = t.clientY;
    },
    { passive: true }
  );
  lightboxLayer.addEventListener(
    'touchmove',
    (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      touchLastX = t.clientX;
      touchLastY = t.clientY;
    },
    { passive: true }
  );
  lightboxLayer.addEventListener('touchcancel', () => {
    // El navegador se hizo cargo del paneo vertical: sin limpiar, el estado
    // del toque quedaría obsoleto y un tap posterior se leería como swipe.
    touchStartX = null;
    touchLastX = null;
    touchStartY = null;
    touchLastY = null;
  });
  lightboxLayer.addEventListener(
    'touchend',
    (e) => {
      lastTouchEndAt = Date.now();
      const t = e.changedTouches?.[0];
      if (!t || touchStartX == null) {
        touchStartX = null;
        touchLastX = null;
        touchStartY = null;
        touchLastY = null;
        return;
      }
      const dx = (t.clientX ?? touchLastX) - touchStartX;
      const dy = (t.clientY ?? touchLastY ?? touchStartY ?? 0) - (touchStartY ?? 0);
      touchStartX = null;
      touchLastX = null;
      touchStartY = null;
      touchLastY = null;
      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        // Paneo vertical: ni navega ni cierra (el navegador se hace cargo).
        return;
      }
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        if (dx < 0) goTo(lightboxIndex + 1);
        else goTo(lightboxIndex - 1);
        return;
      }
      // Toque corto (tap): en una flecha navega; en ✕/imagen/fondo cierra.
      // El gesto se resuelve AQUÍ: el cierre no depende del click sintético.
      if (e.target instanceof HTMLElement) {
        const nav = e.target.closest('[data-lightbox-nav]');
        if (nav) {
          goTo(lightboxIndex + (nav.getAttribute('data-lightbox-nav') === 'next' ? 1 : -1));
          return;
        }
      }
      closeLightbox();
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
  // El closer se registra en cada open: asignación idempotente que además
  // sobrevive a los resetBackNav de las pruebas (ver JSDoc de cabecera).
  registerLightboxCloser(closeTopLightbox);
  // El visor SIEMPRE empuja su propia centinela: la primera pulsación de atrás
  // del sistema lo cierra a él, sin tocar la pantalla de debajo.
  ensureLightboxSentinel();
}

/**
 * Retira la capa del visor y sus listeners globales; no toca la centinela:
 * cada camino de cierre la consume según su vía.
 */
function tearDownLightbox() {
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
  touchStartY = null;
  touchLastY = null;
  lastTouchEndAt = -Infinity;
}

/**
 * Cierra el visor por vía de usuario o programática (✕, fondo, Escape,
 * close()): retira la capa y consume la centinela (consumo diferido). El
 * cierre por botón atrás del sistema (closeTopLightbox) no consume: el
 * popstate de la centinela ya la consumió.
 */
export function closeLightbox() {
  tearDownLightbox();
  if (!closingViaBack) consumeLightboxSentinel();
}

/**
 * Cierre del visor para el botón atrás del sistema (backnav): retira la capa.
 * Devuelve true si el visor estaba abierto y se cerró. No consume la centinela:
 * el popstate que disparó el cierre ya la consumió.
 * @returns {boolean}
 */
export function closeTopLightbox() {
  if (!lightboxLayer) return false;
  closingViaBack = true;
  try {
    tearDownLightbox();
  } finally {
    closingViaBack = false;
  }
  return true;
}
