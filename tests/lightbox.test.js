/**
 * Visor de capturas (lightbox) de la Galería de la Ficha: el clic sobre una
 * captura la amplía a pantalla completa y cierra con Escape o tocando fuera.
 * Navegable por flechas ‹ ›, teclado ←/→ y swipe táctil, con envoltura en
 * los extremos. Suite migrada del módulo de la vista (src/views/game.js) a la
 * primitiva (src/ui/lightbox.js, ADR-0006): el camino de clic desde la Ficha
 * sigue siendo el cableado de la vista.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { resetBackNav } from '../src/backnav.js';
import { closeLightbox, openLightbox } from '../src/ui/lightbox.js';
import { initSheet, openSheet, resetSheet } from '../src/ui/sheet.js';
import { qs, qsa } from '../src/lib/dom.js';

const SHOT_A = 'https://images.igdb.com/igdb/image/upload/shot-a.jpg';
const SHOT_B = 'https://images.igdb.com/igdb/image/upload/shot-b.jpg';
const SHOT_C = 'https://images.igdb.com/igdb/image/upload/shot-c.jpg';

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

/** @param {Element | null} el @returns {HTMLElement} */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

/** @param {Element | null} el @returns {HTMLElement} */
function need(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

/**
 * @param {HTMLElement} layer
 * @param {number} from
 * @param {number} to
 * @param {number} [fromY]
 * @param {number} [toY]
 */
function swipe(layer, from, to, fromY = 120, toY = 120) {
  /**
   * @param {string} type
   * @param {number} x
   * @param {number} y
   */
  const touch = (type, x, y) => {
    const ev = new Event(type, { bubbles: true });
    /** @type {any} */ (ev).changedTouches = [{ clientX: x, clientY: y }];
    layer.dispatchEvent(ev);
  };
  touch('touchstart', from, fromY);
  touch('touchmove', (from + to) / 2, (fromY + toY) / 2);
  touch('touchend', to, toY);
}

/**
 * Tap táctil corto (sin movimiento) sobre `el`: el gesto se resuelve en el
 * `touchend`, sin click sintético posterior.
 * @param {HTMLElement} el
 */
function tap(el) {
  /**
   * @param {string} type
   */
  const touch = (type) => {
    const ev = new Event(type, { bubbles: true });
    /** @type {any} */ (ev).changedTouches = [{ clientX: 150, clientY: 150 }];
    el.dispatchEvent(ev);
  };
  touch('touchstart');
  touch('touchend');
}

beforeEach(async () => {
  document.body.innerHTML = '';
  closeLightbox();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    library: {
      view: 'shelves',
      panelStatus: null,
      query: '',
      genre: null,
      platform: null,
      tag: null,
      gameId: null,
    },
  });
  await initLibrary();
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'gshot',
        title: 'Celeste',
        igdbId: 268807,
        coverUrl: 'https://images.igdb.com/igdb/image/upload/co.jpg',
        screenshots: [SHOT_A, SHOT_B],
        plays: [{ id: 'gshot-p1', status: 'playing', addedAt: '2026-07-01' }],
      },
    ],
  });
});

describe('lightbox de la galería', () => {
  it('la captura de la Ficha abre el visor con la imagen ampliada', async () => {
    const root = mount();
    createApp(root);
    // Portada de la balda → Ficha.
    btn(qs('.card[data-game-id="gshot"]', root)).click();
    expect(qs('.ficha', root)).toBeTruthy();

    const shots = qsa('button.d-shot[data-shot]', root);
    expect(shots).toHaveLength(2);
    btn(shots[0]).click();

    const layer = need(qs('.lightbox', document.body));
    expect(layer.querySelector('img')?.getAttribute('src')).toBe(SHOT_A);
  });

  it('Escape y el clic fuera cierran el visor', async () => {
    const root = mount();
    createApp(root);
    btn(qs('.card[data-game-id="gshot"]', root)).click();
    btn(qsa('button.d-shot[data-shot]', root)[0]).click();
    expect(qs('.lightbox', document.body)).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(qs('.lightbox', document.body)).toBeNull();

    btn(qsa('button.d-shot[data-shot]', root)[0]).click();
    btn(qs('.lightbox', document.body)).click();
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('las flechas ‹ › navegan por la galería sin cerrar el visor', async () => {
    const root = mount();
    createApp(root);
    btn(qs('.card[data-game-id="gshot"]', root)).click();
    btn(qsa('button.d-shot[data-shot]', root)[0]).click();
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    btn(need(qs('.lightbox-next', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_B);
    expect(qs('.lightbox', document.body)).toBeTruthy();

    btn(need(qs('.lightbox-prev', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_A);
    expect(qs('.lightbox', document.body)).toBeTruthy();
  });

  it('el clic en una flecha no cierra el visor (solo el fondo y el ✕)', async () => {
    const root = mount();
    createApp(root);
    btn(qs('.card[data-game-id="gshot"]', root)).click();
    btn(qsa('button.d-shot[data-shot]', root)[0]).click();
    const layer = need(qs('.lightbox', document.body));

    btn(need(qs('.lightbox-next', layer))).click();
    btn(need(qs('.lightbox-prev', layer))).click();
    expect(qs('.lightbox', document.body)).toBeTruthy();

    btn(need(qs('.lightbox-close', layer))).click();
    expect(qs('.lightbox', document.body)).toBeNull();
  });
});

describe('primitiva directa', () => {
  it('abre con la URL dada (capas y atributos) y cierra idempotente', () => {
    openLightbox(SHOT_A);
    const layer = need(qs('.lightbox', document.body));
    expect(layer.querySelector('img')?.getAttribute('src')).toBe(SHOT_A);
    expect(layer.className).toBe('lightbox fade');
    expect(layer.getAttribute('role')).toBe('dialog');
    expect(layer.getAttribute('aria-modal')).toBe('true');
    expect(layer.getAttribute('aria-label')).toBe('Captura ampliada');
    expect(qs('.lightbox-prev', layer)?.getAttribute('aria-label')).toBe('Anterior');
    expect(qs('.lightbox-next', layer)?.getAttribute('aria-label')).toBe('Siguiente');
    closeLightbox();
    expect(qs('.lightbox', document.body)).toBeNull();
    closeLightbox();
  });

  it('sin URL no abre nada', () => {
    openLightbox('');
    expect(qs('.lightbox', document.body)).toBeNull();
    openLightbox([]);
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('abre en el índice pedido y navega con las flechas', () => {
    openLightbox([SHOT_A, SHOT_B, SHOT_C], 1);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));
    expect(img.getAttribute('src')).toBe(SHOT_B);

    btn(need(qs('.lightbox-next', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_C);
    btn(need(qs('.lightbox-prev', layer))).click();
    btn(need(qs('.lightbox-prev', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_A);
  });

  it('envuelve en los extremos: siguiente tras la última y anterior tras la primera', () => {
    openLightbox([SHOT_A, SHOT_B], 1);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    btn(need(qs('.lightbox-next', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_A);

    btn(need(qs('.lightbox-prev', layer))).click();
    expect(img.getAttribute('src')).toBe(SHOT_B);
  });

  it('las teclas ←/→ navegan igual que las flechas y Escape sigue cerrando', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(img.getAttribute('src')).toBe(SHOT_B);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(img.getAttribute('src')).toBe(SHOT_A);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('el swipe izquierdo va a la siguiente y el derecho a la anterior, sin cerrar', () => {
    openLightbox([SHOT_A, SHOT_B, SHOT_C], 1);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    swipe(layer, 300, 200);
    expect(img.getAttribute('src')).toBe(SHOT_C);
    expect(qs('.lightbox', document.body)).toBeTruthy();

    swipe(layer, 200, 300);
    expect(img.getAttribute('src')).toBe(SHOT_B);
    expect(qs('.lightbox', document.body)).toBeTruthy();
  });

  it('un toque corto (bajo el umbral) cierra el visor: es un tap', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    swipe(layer, 300, 288);
    expect(img.getAttribute('src')).toBe(SHOT_A);
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('un tap en el ✕ cierra el visor a la primera (táctil, sin click)', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));

    tap(need(qs('.lightbox-close', layer)));
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('un tap sobre una flecha navega sin cerrar (táctil, sin click)', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    tap(need(qs('.lightbox-next', layer)));
    expect(img.getAttribute('src')).toBe(SHOT_B);
    expect(qs('.lightbox', document.body)).toBeTruthy();

    tap(need(qs('.lightbox-prev', layer)));
    expect(img.getAttribute('src')).toBe(SHOT_A);
    expect(qs('.lightbox', document.body)).toBeTruthy();
  });

  it('el click sintético del navegador tras un swipe no cierra ni re-navega', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    swipe(layer, 300, 200);
    expect(img.getAttribute('src')).toBe(SHOT_B);
    // Eco del navegador dentro de la ventana de supresión: se traga.
    btn(layer).click();
    expect(img.getAttribute('src')).toBe(SHOT_B);
    expect(qs('.lightbox', document.body)).toBeTruthy();
  });

  it('el click de ratón (sin toques previos) sigue cerrando', () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));

    btn(layer).click();
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('el click tras un swipe, con la ventana ya expirada, cierra', async () => {
    openLightbox([SHOT_A, SHOT_B]);
    const layer = need(qs('.lightbox', document.body));

    swipe(layer, 300, 200);
    expect(qs('.lightbox', document.body)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 550));
    btn(layer).click();
    expect(qs('.lightbox', document.body)).toBeNull();
  });

  it('el paneo vertical (dy dominante) no navega ni cierra', () => {
    openLightbox([SHOT_A, SHOT_B, SHOT_C], 1);
    const layer = need(qs('.lightbox', document.body));
    const img = need(layer.querySelector('img'));

    swipe(layer, 200, 205, 100, 300);
    expect(img.getAttribute('src')).toBe(SHOT_B);
    expect(qs('.lightbox', document.body)).toBeTruthy();
  });
});

describe('botón atrás del sistema', () => {
  /**
   * jsdom acumula el historial entre pruebas del mismo archivo: rebobina a la
   * entrada raíz para que cada prueba parta de la pila limpia. Se llama ANTES
   * de createApp, cuando ningún handler de popstate está instalado.
   */
  async function rewindToRoot() {
    if (history.length <= 1) return;
    history.pushState({}, '');
    history.go(-(history.length - 1));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  beforeEach(async () => {
    resetBackNav();
    resetSheet();
    await rewindToRoot();
  });

  it('desde la Ficha abierta, el atrás cierra el visor sin cerrar la Ficha', async () => {
    const root = mount();
    createApp(root);
    btn(qs('.card[data-game-id="gshot"]', root)).click();
    expect(qs('.ficha', root)).toBeTruthy();

    btn(qsa('button.d-shot[data-shot]', root)[0]).click();
    expect(qs('.lightbox', document.body)).toBeTruthy();

    history.back();
    await vi.waitFor(() => expect(qs('.lightbox', document.body)).toBeNull());
    // La pulsación se consumió cerrando el visor: la pantalla no cambió.
    expect(qs('.ficha', root)).toBeTruthy();
    expect(store.get().library.gameId).toBe('gshot');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(qs('.ficha', root)).toBeTruthy();

    // El re-push deshizo el pop: el segundo back restaura la pantalla previa.
    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
  });

  it('a profundidad 0 el visor empuja su centinela: el atrás lo cierra sin cambiar la pantalla', async () => {
    const root = mount();
    createApp(root);
    openLightbox([SHOT_A]);
    expect(qs('.lightbox', document.body)).toBeTruthy();

    history.back();
    await vi.waitFor(() => expect(qs('.lightbox', document.body)).toBeNull());
    expect(store.get().tab).toBe('biblioteca');

    // Sin entradas basura: el siguiente atrás no restaura nada (sale de la app).
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('biblioteca');
  });

  it('el atrás cierra el visor antes que la hoja abierta debajo, y el siguiente cierra la hoja', async () => {
    const root = mount();
    createApp(root);
    initSheet();
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: '<p>Ficha del tablón</p>', onClose });
    expect(qs('.add-layer', document.body)).toBeTruthy();

    openLightbox([SHOT_A]);
    expect(qs('.lightbox', document.body)).toBeTruthy();

    history.back();
    await vi.waitFor(() => expect(qs('.lightbox', document.body)).toBeNull());
    expect(qs('.add-layer', document.body)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    history.back();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(qs('.add-layer', document.body)).toBeNull();
    expect(root.textContent).not.toBe('');
  });

  it('el ✕ del visor deja la centinela huérfana: el atrás no repite el cierre ni cierra la hoja', async () => {
    const root = mount();
    createApp(root);
    initSheet();
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: '<p>Ficha del tablón</p>', onClose });

    openLightbox([SHOT_A]);
    btn(need(qs('.lightbox-close', document.body))).click();
    expect(qs('.lightbox', document.body)).toBeNull();

    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(qs('.add-layer', document.body)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    history.back();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(qs('.add-layer', document.body)).toBeNull();
  });
});