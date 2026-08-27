/**
 * Botón atrás del navegador/móvil (src/backnav.js): abrir Panel, Ficha o
 * cambiar de pestaña empuja una entrada de historial; el atrás del sistema
 * restaura la pantalla anterior; los «← Volver» internos aplican su cambio al
 * instante y consumen la entrada empujada (el popstate pendiente se traga).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { resetBackNav } from '../src/backnav.js';
import { qs } from '../src/lib/dom.js';

/**
 * @returns {HTMLElement}
 */
function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

/**
 * @param {Element | null} el
 * @returns {HTMLElement}
 */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

/**
 * @param {Element | null} el
 * @returns {Element}
 */
function need(el) {
  if (!el) throw new Error('elemento no encontrado');
  return el;
}

/**
 * Siembra la biblioteca importando un doc (misma vía que la bienvenida).
 */
async function seed() {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-07-01' }],
      },
    ],
  });
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetBackNav();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    tabRole: 'primary',
    library: {
      view: 'shelves',
      panelStatus: null,
      query: '',
      genre: null,
      platform: null,
      tag: null,
      gameId: null,
    },
    novedades: { section: null, genre: null },
  });
  await initLibrary();
  await seed();
});

describe('atrás del sistema', () => {
  it('desde el Panel vuelve a la Estantería', async () => {
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    expect(store.get().library.view).toBe('panel');

    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
    expect(store.get().library.panelStatus).toBeNull();
  });

  it('desde la Ficha regresa a la pantalla previa (el panel, no la estantería)', async () => {
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    btn(need(qs('.b-row[data-game-id="g1"]', root))).click();
    expect(store.get().library.gameId).toBe('g1');

    history.back();
    await vi.waitFor(() => expect(store.get().library.gameId).toBeNull());
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');
  });

  it('desde la Ficha abierta desde la estantería vuelve a la estantería', async () => {
    const root = mount();
    createApp(root);

    btn(need(qs('.card[data-game-id="g1"]', root))).click();
    expect(store.get().library.gameId).toBe('g1');

    history.back();
    await vi.waitFor(() => expect(store.get().library.gameId).toBeNull());
    expect(store.get().library.view).toBe('shelves');
  });

  it('desde otra pestaña vuelve a la pestaña anterior', async () => {
    const root = mount();
    createApp(root);

    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');

    history.back();
    await vi.waitFor(() => expect(store.get().tab).toBe('biblioteca'));
    // Volver a Biblioteca desde otra pestaña repone la estantería (ticket 14).
    expect(store.get().library.view).toBe('shelves');
  });
});

describe('«← Volver» interno', () => {
  it('cierra el Panel al instante y consume su entrada de historial', async () => {
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    btn(qs('[data-back-shelves]', root)).click();
    // Cambio síncrono: la UI no espera al historial.
    expect(store.get().library.view).toBe('shelves');
    // El popstate pendiente se traga: la instantánea obsoleta no restaura.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
  });

  it('cierra la Ficha al instante y consume su entrada de historial', async () => {
    const root = mount();
    createApp(root);

    btn(need(qs('.card[data-game-id="g1"]', root))).click();
    btn(qs('[data-back-ficha]', root)).click();
    expect(store.get().library.gameId).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.view).toBe('shelves');
  });
});
