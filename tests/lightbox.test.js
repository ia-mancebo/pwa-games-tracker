/**
 * Visor de capturas (lightbox) de la Galería de la Ficha: el clic sobre una
 * captura la amplía a pantalla completa y cierra con Escape o tocando fuera.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { closeLightbox } from '../src/views/game.js';
import { qs, qsa } from '../src/lib/dom.js';

const SHOT_A = 'https://images.igdb.com/igdb/image/upload/shot-a.jpg';

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
        screenshots: [SHOT_A, 'https://images.igdb.com/igdb/image/upload/shot-b.jpg'],
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
});