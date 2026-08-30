/**
 * Scroll del documento por superficie de la Biblioteca (regresión): las tres
 * superficies del raíl de Biblioteca comparten el scroll del documento y, al
 * navegar entre ellas, el scroll de la superficie saliente no debe heredarse
 * en la entrante. Regla: la Estantería conserva su scroll al salir y lo repone
 * al volver (volver atrás a la Biblioteca); el Panel y la Ficha llegan siempre
 * arriba. Los cambios dentro de la misma superficie (búsqueda, filtros) no
 * tocan el scroll. jsdom no scrollea de verdad: `window.scrollY` se simula y
 * `window.scrollTo` se espía para verificar la regla.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { resetBackNav } from '../src/backnav.js';
import { resetSheet } from '../src/ui/sheet.js';
import { qs } from '../src/lib/dom.js';

/** @type {ReturnType<typeof vi.spyOn> | null} */
let scrollToSpy = null;

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
 * Simula la posición de scroll del documento (jsdom siempre la reporta en 0).
 * @param {number} value
 */
function fakeScrollY(value) {
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => value });
}

async function seed() {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'g1',
        title: 'Hades',
        genres: [{ id: 1, name: 'RPG' }],
        plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-07-01' }],
      },
      {
        id: 'g2',
        title: 'Celeste',
        genres: [{ id: 2, name: 'Plataformas' }],
        plays: [{ id: 'g2-p1', status: 'finished', addedAt: '2026-06-01' }],
      },
    ],
  });
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetBackNav();
  resetSheet();
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
    novedades: { section: null, genre: null, detail: null },
  });
  await initLibrary();
  await seed();
  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // El montaje inicial reposiciona a 0 (primera superficie); limpiar para que
  // las aserciones solo vean las llamadas de la navegación que se prueba.
  scrollToSpy.mockClear();
});

afterEach(() => {
  scrollToSpy?.mockRestore();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

describe('llegada a la Ficha y al Panel: siempre arriba', () => {
  it('abrir la Ficha desde la Estantería salta a arriba (el scroll de la biblioteca no se hereda)', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-game-id="g1"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir el Panel desde la Estantería salta a arriba', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-open-panel="playing"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir la Ficha desde una fila del Panel salta a arriba', () => {
    const root = mount();
    createApp(root);
    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    fakeScrollY(700);

    btn(qs('[data-game-id="g1"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('vuelta a la Estantería: conserva su scroll', () => {
  it('volver de la Ficha repone la posición que tenía la Estantería', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-game-id="g1"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-back-ficha]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 1200);
  });

  it('volver del Panel repone la posición que tenía la Estantería', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(800);

    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-back-shelves]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 800);
  });

  it('volver del Panel a la Ficha: la Lista llega siempre arriba (nunca hereda)', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(800);

    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    fakeScrollY(700);
    btn(qs('[data-game-id="g1"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-back-ficha]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('el atrás del sistema (popstate) repone también el scroll de la Estantería', async () => {
    const root = mount();
    createApp(root);
    fakeScrollY(1000);

    btn(qs('[data-game-id="g1"]', root)).click();
    expect(store.get().library.gameId).toBe('g1');
    scrollToSpy.mockClear();

    history.back();
    await vi.waitFor(() => expect(store.get().library.gameId).toBeNull());
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 1000);
  });

  it('cambiar de pestaña y volver a Biblioteca repone el scroll de la Estantería', () => {
    const root = mount();
    createApp(root);
    fakeScrollY(900);

    btn(qs('[data-tab="novedades"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-tab="biblioteca"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 900);
  });
});

describe('dentro de la misma superficie: el scroll no se toca', () => {
  it('cambiar un filtro en la Estantería no reposiciona el scroll', () => {
    const root = mount();
    createApp(root);
    // El montaje inicial reposiciona a 0; limpiar para aislar el filtro.
    scrollToSpy.mockClear();
    fakeScrollY(500);

    btn(qs('[data-f-genre="RPG"]', root)).click();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('cambiar de filtro dentro del Panel no reposiciona el scroll', () => {
    const root = mount();
    createApp(root);
    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    fakeScrollY(300);

    btn(qs('[data-f-genre="RPG"]', root)).click();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});