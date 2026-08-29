/**
 * Regresión de la ficha externa de Novedades: el marcado de la hoja debe
 * llegar al DOM como elementos reales, nunca escapado como texto (<div
 * class="d-sec"> visible). Llegó a ocurrir con un bundle PWA desfasado; este
 * caso asegura que la plantilla actual escapa solo los datos, no la estructura.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { saveSnapshot } from '../src/data/snapshot.js';
import { newLibrary } from '../src/data/library.js';
import { resetNovedadesRefresh } from '../src/data/novedades.js';
import { store, freshNovedadesUi } from '../src/app.js';
import { render as renderView } from '../src/views/novedades.js';
import { closeLightbox } from '../src/ui/lightbox.js';
import { qs, qsa } from '../src/lib/dom.js';

/** @param {string} title @param {number} igdbId */
function novGame(title, igdbId) {
  return {
    igdbId,
    title,
    releaseDate: '2026-08-01',
    coverUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/co${igdbId}.jpg`,
    description: 'Descripción de prueba <sin etiquetas>',
    genres: [{ id: 8, name: 'Platform' }],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
  };
}

const SNAPSHOT = {
  recientes: [novGame('Celeste', 268807)],
  proximos: [],
  populares: [],
  esperados: [],
  savedAt: '2026-08-24T09:30:00.000Z',
};

/** @type {HTMLElement} */
let root;

/** @param {Element | null} el @returns {HTMLElement} */
function clickable(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetNovedadesRefresh();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    novedades: { section: null, genre: null, detail: null },
    novedadesUi: freshNovedadesUi(),
  });
  await newLibrary(new Date());
  root = /** @type {HTMLElement} */ (document.createElement('main'));
  document.body.appendChild(root);
});

describe('ficha externa de Novedades', () => {
  it('pinta Géneros y Plataformas como elementos, no como texto escapado', async () => {
    await saveSnapshot(SNAPSHOT);
    // Suscripción mínima: sin la app completa, este test replica que cada
    // cambio de store repinta la vista activa (la hoja la abre syncDetail
    // invocado por el render).
    const unsubscribe = store.subscribe(() => renderView(root, store));
    renderView(root, store);
    await vi.waitFor(() => expect(qs('[data-nov]', root)).toBeTruthy());

    clickable(qs('[data-ndetail="recientes:0"]', root)).click();
    const layer = /** @type {HTMLElement} */ (
      await vi.waitFor(() => {
        const found = qs('.add-layer', document.body);
        if (!found) throw new Error('ficha no abierta');
        return found;
      })
    );

    const htmlOut = layer.innerHTML;
    expect(htmlOut).toContain('<h3>Géneros</h3>');
    expect(htmlOut).toContain('<h3>Plataformas</h3>');
    // La estructura nunca aparece escapada como texto visible.
    expect(htmlOut).not.toContain('&lt;div');
    expect(htmlOut).not.toContain('&lt;h3');
    expect(layer.querySelector('.d-title')?.textContent?.trim()).toBe('Celeste');
    // Los datos del juego sí se escapan en texto plano, no como marcado vivo.
    expect(layer.querySelector('.d-desc')?.textContent).toBe(
      'Descripción de prueba <sin etiquetas>'
    );
    unsubscribe();
  });

  it('abre la ficha también desde el drill-down por sección', async () => {
    await saveSnapshot(SNAPSHOT);
    // Suscripción mínima: sin la app completa, este test replica que cada
    // cambio de store repinta la vista activa.
    const unsubscribe = store.subscribe(() => renderView(root, store));
    renderView(root, store);
    await vi.waitFor(() => expect(qs('[data-nov]', root)).toBeTruthy());
    clickable(qs('[data-nsection="recientes"]', root)).click();
    const rows = () => qsa('[data-ndetail].b-row', root);
    await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0));
    clickable(rows()[0]).click();
    await vi.waitFor(() => expect(qs('.add-layer', document.body)).toBeTruthy());
    unsubscribe();
  });

  it('pinta la galería del snapshot y el clic abre el visor; el wiring sobrevive al repintado', async () => {
    const SHOTS = [
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg',
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc2.jpg',
    ];
    await saveSnapshot({
      ...SNAPSHOT,
      recientes: [{ ...SNAPSHOT.recientes[0], screenshots: SHOTS }],
    });
    const unsubscribe = store.subscribe(() => renderView(root, store));
    renderView(root, store);
    await vi.waitFor(() => expect(qs('[data-nov]', root)).toBeTruthy());

    clickable(qs('[data-ndetail="recientes:0"]', root)).click();
    const layer = /** @type {HTMLElement} */ (
      await vi.waitFor(() => {
        const found = qs('.add-layer', document.body);
        if (!found) throw new Error('ficha no abierta');
        return found;
      })
    );
    const shots = qsa('button.d-shot[data-shot]', layer);
    expect(shots).toHaveLength(2);
    expect(shots[0]?.querySelector('img')?.getAttribute('src')).toBe(SHOTS[0]);

    clickable(shots[0]).click();
    expect(qs('.lightbox img', document.body)?.getAttribute('src')).toBe(SHOTS[0]);
    closeLightbox();

    // El repintado del cuerpo (tras «Quiero jugarlo») no rompe el wiring:
    // la delegación vive en la capa, no en el cuerpo repintado.
    clickable(qs('[data-want-play]', layer)).click();
    await vi.waitFor(() => expect(qs('[data-want-play]', layer)).toBeNull());
    const freshShots = qsa('button.d-shot[data-shot]', layer);
    expect(freshShots).toHaveLength(2);
    clickable(freshShots[1]).click();
    expect(qs('.lightbox img', document.body)?.getAttribute('src')).toBe(SHOTS[1]);
    closeLightbox();
    unsubscribe();
  });

  it('sin capturas no pinta la sección de galería', async () => {
    await saveSnapshot(SNAPSHOT);
    const unsubscribe = store.subscribe(() => renderView(root, store));
    renderView(root, store);
    await vi.waitFor(() => expect(qs('[data-nov]', root)).toBeTruthy());

    clickable(qs('[data-ndetail="recientes:0"]', root)).click();
    const layer = /** @type {HTMLElement} */ (
      await vi.waitFor(() => {
        const found = qs('.add-layer', document.body);
        if (!found) throw new Error('ficha no abierta');
        return found;
      })
    );
    expect(qs('[data-sec="gallery"]', layer)).toBeNull();
    expect(layer.textContent).not.toContain('Galería');
    unsubscribe();
  });
});
