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
import { createApp, store, freshNovedadesUi } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { resetBackNav } from '../src/backnav.js';
import { resetSheet } from '../src/ui/sheet.js';
import { saveSnapshot } from '../src/data/snapshot.js';
import { resetNovedadesRefresh } from '../src/data/novedades.js';
import { resetScroll } from '../src/scroll.js';
import { qs } from '../src/lib/dom.js';

/** @type {ReturnType<typeof vi.spyOn> | null} */
let scrollToSpy = null;

/** Desuscripción del createApp actual (aislación entre pruebas). */
let unsubscribe = () => {};

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
  unsubscribe();
  resetBackNav();
  resetSheet();
  resetScroll();
  // Drenar cargas asíncronas huérfanas del test anterior (p. ej. un
  // ensureNovedadesContent o un autoRefresh en vuelo). Tienen que resolverse
  // ANTES de resetear las guardas de módulo: si resuelven después, marcan
  // contentLoaded y la carga del test actual se salta.
  await new Promise((resolve) => setTimeout(resolve, 10));
  resetNovedadesRefresh();
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
    novedadesUi: freshNovedadesUi(),
  });
  await initLibrary();
  await seed();
  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // El montaje inicial reposiciona a 0 (primera superficie); limpiar para que
  // las aserciones solo vean las llamadas de la navegación que se prueba.
  scrollToSpy.mockClear();
});

afterEach(() => {
  unsubscribe();
  unsubscribe = () => {};
  scrollToSpy?.mockRestore();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

describe('llegada a la Ficha y al Panel: siempre arriba', () => {
  it('abrir la Ficha desde la Estantería salta a arriba (el scroll de la biblioteca no se hereda)', () => {
    const root = mount();
    unsubscribe = createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-game-id="g1"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir el Panel desde la Estantería salta a arriba', () => {
    const root = mount();
    unsubscribe = createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-open-panel="playing"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir la Ficha desde una fila del Panel salta a arriba', () => {
    const root = mount();
    unsubscribe = createApp(root);
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
    unsubscribe = createApp(root);
    fakeScrollY(1200);

    btn(qs('[data-game-id="g1"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-back-ficha]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 1200);
  });

  it('volver del Panel repone la posición que tenía la Estantería', () => {
    const root = mount();
    unsubscribe = createApp(root);
    fakeScrollY(800);

    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-back-shelves]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 800);
  });

  it('volver del Panel a la Ficha: la Lista llega siempre arriba (nunca hereda)', () => {
    const root = mount();
    unsubscribe = createApp(root);
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
    unsubscribe = createApp(root);
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
    unsubscribe = createApp(root);
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
    unsubscribe = createApp(root);
    // El montaje inicial reposiciona a 0; limpiar para aislar el filtro.
    scrollToSpy.mockClear();
    fakeScrollY(500);

    btn(qs('[data-f-genre="RPG"]', root)).click();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('cambiar de filtro dentro del Panel no reposiciona el scroll', () => {
    const root = mount();
    unsubscribe = createApp(root);
    btn(qs('[data-open-panel="playing"]', root)).click();
    scrollToSpy.mockClear();
    fakeScrollY(300);

    btn(qs('[data-f-genre="RPG"]', root)).click();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('Novedades: el tablón conserva su scroll, la sección llega arriba', () => {
  /** Instantánea mínima con una sección «Recién salidos» con un título. */
  const snapBody = () => ({
    recientes: [
      {
        igdbId: 101,
        id: 101,
        title: 'Recién salido',
        releaseDate: '2026-08-01',
        coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co101.jpg',
        description: 'Un título de prueba',
        genres: [{ id: 8, name: 'Platform' }],
        platforms: [{ id: 130, name: 'Nintendo Switch' }],
      },
    ],
    proximos: [],
    populares: [],
    esperados: [],
    generatedAt: '2026-08-24T09:30:00.000Z',
  });

  /** Abre la pestaña Novedades y espera el tablón con secciones reales.
   * @param {HTMLElement} root
   */
  async function goToBoard(root) {
    btn(qs('[data-tab="novedades"]', root)).click();
    await vi.waitFor(() => expect(qs('[data-nsection="recientes"]', root)).toBeTruthy());
  }

  it('entrar en la pestaña Novedades desde la Estantería scrolleada: arriba', async () => {
    const root = mount();
    unsubscribe = createApp(root);
    fakeScrollY(700);

    btn(qs('[data-tab="novedades"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir una sección desde el tablón scrolleado: arriba', async () => {
    await saveSnapshot(snapBody());
    const root = mount();
    unsubscribe = createApp(root);
    await goToBoard(root);
    fakeScrollY(600);

    btn(qs('[data-nsection="recientes"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('volver del drill-down: el tablón repone su scroll', async () => {
    await saveSnapshot(snapBody());
    const root = mount();
    unsubscribe = createApp(root);
    await goToBoard(root);
    fakeScrollY(600);
    btn(qs('[data-nsection="recientes"]', root)).click();
    scrollToSpy.mockClear();

    btn(qs('[data-nback]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 600);
  });

  it('cambiar de pestaña y volver a Novedades: el tablón repone su scroll', async () => {
    await saveSnapshot(snapBody());
    const root = mount();
    unsubscribe = createApp(root);
    await goToBoard(root);
    fakeScrollY(600);

    btn(qs('[data-tab="biblioteca"]', root)).click();
    scrollToSpy.mockClear();
    btn(qs('[data-tab="novedades"]', root)).click();

    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 600);
  });

  it('abrir la Ficha externa del tablón no reposiciona el scroll (hoja, no superficie)', async () => {
    await saveSnapshot(snapBody());
    const root = mount();
    unsubscribe = createApp(root);
    await goToBoard(root);
    fakeScrollY(300);
    scrollToSpy.mockClear();

    btn(qs('[data-ndetail="recientes:0"]', root)).click();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});