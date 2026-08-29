/**
 * Botón atrás del navegador/móvil (src/backnav.js): abrir Panel, Ficha o
 * cambiar de pestaña empuja una entrada de historial; el atrás del sistema
 * restaura la pantalla anterior; los «← Volver» internos aplican su cambio al
 * instante y consumen la entrada empujada (el popstate pendiente se traga).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { createApp, store, freshNovedadesUi } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { resetNovedadesRefresh } from '../src/data/novedades.js';
import {
  installBackNav,
  navigate,
  registerSheetCloser,
  resetBackNav,
} from '../src/backnav.js';
import { saveSnapshot } from '../src/data/snapshot.js';
import { qs } from '../src/lib/dom.js';
// El cierre de hoja real (ticket 2): resetBackNav lo anula y estos tests
// abren la Ficha de Novedades, cuyo atrás del sistema pasa por el módulo.
import { resetSheet } from '../src/ui/sheet.js';

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

/**
 * jsdom acumula el historial entre pruebas del mismo archivo (no hay API para
 * vaciarlo): rebobina a la entrada raíz para que cada prueba parta de la pila
 * limpia (pestañas raíz: la pulsada debe ser la primera entrada). Se llama
 * ANTES de createApp, cuando ningún handler de popstate está instalado.
 * pushState sube al final del historial (currentIndex == length - 1) y
 * go(-(length - 1)) llega a la entrada 0.
 */
async function rewindToRoot() {
  if (history.length <= 1) return;
  history.pushState({}, '');
  history.go(-(history.length - 1));
  await new Promise((resolve) => setTimeout(resolve, 25));
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetBackNav();
  resetSheet();
  resetNovedadesRefresh();
  await rewindToRoot();
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

  it('al cambiar de pestaña la pila se reinicia: el atrás no vuelve a la pestaña anterior', async () => {
    const root = mount();
    createApp(root);

    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');

    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('novedades');
    // La estantería de Biblioteca sigue intacta (ticket 14).
    expect(store.get().library.view).toBe('shelves');
  });

  it('desde la Ficha de Novedades la cierra y se queda en Novedades', async () => {
    await saveSnapshot({
      recientes: [
        {
          igdbId: 268807,
          title: 'Celeste',
          releaseDate: '2026-08-01',
          coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co268807.jpg',
          description: 'Descripci�n de prueba',
          genres: [{ id: 8, name: 'Platform' }],
          platforms: [{ id: 130, name: 'Nintendo Switch' }],
        },
      ],
      proximos: [],
      populares: [],
      esperados: [],
    });
    const root = mount();
    createApp(root);

    btn(qs('[data-tab="novedades"]', root)).click();
    await vi.waitFor(() => expect(qs('[data-nsection="recientes"]', root)).toBeTruthy());
    // Drill-down con entrada de historial propia: el atrás del sistema tiene
    // una entrada que consumir al cerrar la Ficha (la pestaña es raíz).
    btn(qs('[data-nsection="recientes"]', root)).click();
    await vi.waitFor(() => expect(qs('[data-ndetail="recientes:0"]', root)).toBeTruthy());
    btn(qs('[data-ndetail="recientes:0"]', root)).click();
    expect(store.get().novedades.detail).toBe('recientes:0');
    expect(need(qs('.add-layer', document.body))).toBeTruthy();

    // El atrás del sistema cierra la Ficha; NO regresa a Biblioteca.
    history.back();
    await vi.waitFor(() => expect(store.get().novedades.detail).toBeNull());
    expect(store.get().tab).toBe('novedades');
    expect(store.get().novedades.section).toBe('recientes');
    await vi.waitFor(() => expect(qs('.add-layer', document.body)).toBeNull());
  });

  it('el ✕ de la Ficha de Novedades consume su entrada de historial', async () => {
    await saveSnapshot({
      recientes: [
        {
          igdbId: 268807,
          title: 'Celeste',
          releaseDate: '2026-08-01',
          coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co268807.jpg',
          description: 'Descripci�n de prueba',
          genres: [{ id: 8, name: 'Platform' }],
          platforms: [{ id: 130, name: 'Nintendo Switch' }],
        },
      ],
      proximos: [],
      populares: [],
      esperados: [],
    });
    const root = mount();
    createApp(root);

    btn(qs('[data-tab="novedades"]', root)).click();
    await vi.waitFor(() => expect(qs('[data-ndetail="recientes:0"]', root)).toBeTruthy());
    btn(qs('[data-ndetail="recientes:0"]', root)).click();
    expect(store.get().novedades.detail).toBe('recientes:0');

    btn(need(qs('[data-close-detail]', document.body))).click();
    // Cambio síncrono y consumo de la entrada: el atrás del sistema no repite.
    expect(store.get().novedades.detail).toBeNull();
    expect(store.get().tab).toBe('novedades');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().novedades.detail).toBeNull();
    expect(store.get().tab).toBe('novedades');
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

describe('navigate · costura directa', () => {
  it('push y después history.back() restaura la pantalla anterior', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    expect(store.get().library.view).toBe('panel');

    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
    expect(store.get().library.panelStatus).toBeNull();
  });

  it('back aplica la transición al instante y se traga el popstate (los filtros no derivan)', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    // Cambio de filtro sin historial: la entrada del Panel quedó obsoleta.
    store.set({ library: { ...store.get().library, genre: 'Aventura' } });
    navigate(store, 'push', { library: { ...store.get().library, gameId: 'g1' } });
    expect(store.get().library.gameId).toBe('g1');

    navigate(store, 'back', { library: { ...store.get().library, gameId: null } });
    // Cambio síncrono y el filtro conservado…
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.genre).toBe('Aventura');
    // …y la instantánea obsoleta (sin filtro) no lo pisa tras el popstate.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.genre).toBe('Aventura');
    // El back interno consumió la entrada del Panel: el siguiente back del
    // sistema restaura la estantería previa al Panel.
    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
  });

  it('replace sustituye la entrada de la Ficha: el back restaura el Panel, nunca la Ficha', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    navigate(store, 'push', { library: { ...store.get().library, gameId: 'g1' } });
    // Borrado del juego: la Ficha se sustituye por la estantería.
    navigate(store, 'replace', {
      library: { ...store.get().library, view: 'shelves', panelStatus: null, gameId: null },
    });
    expect(store.get().library.view).toBe('shelves');

    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('panel'));
    expect(store.get().library.panelStatus).toBe('playing');
    expect(store.get().library.gameId).toBeNull();
  });

  it('registerSheetCloser: closer true consume la pulsación sin cambiar la pantalla y el re-push conserva la entrada', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    const closer = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    registerSheetCloser(closer);

    history.back();
    await vi.waitFor(() => expect(closer).toHaveBeenCalled());
    // La pulsación se consumió cerrando la hoja: la pantalla no cambió.
    expect(store.get().library.view).toBe('panel');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.view).toBe('panel');
    // El re-push deshizo el pop: el segundo back restaura la pantalla previa.
    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
  });

  it('registerSheetCloser: closer false deja el restore normal', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    const closer = vi.fn(() => false);
    registerSheetCloser(closer);

    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
    expect(closer).toHaveBeenCalled();
  });

  it('reset rebobina a la raíz: el atrás ya no restaura las pantallas empujadas y conserva el estado aplicado', async () => {
    installBackNav(store);
    navigate(store, 'push', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    navigate(store, 'push', { library: { ...store.get().library, gameId: 'g1' } });
    expect(store.get().library.gameId).toBe('g1');

    navigate(store, 'reset', {
      library: { ...store.get().library, view: 'shelves', panelStatus: null, gameId: null },
    });
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.gameId).toBeNull();

    // El rebobinado del reset (go(-n)) es asíncrono en jsdom: esperar a que
    // termine antes de pulsar atrás.
    await new Promise((resolve) => setTimeout(resolve, 25));

    // El atrás del sistema ya no restaura el Panel ni la Ficha empujados.
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.gameId).toBeNull();
  });

  it('back con depth 0 aplica la transición sin tocar el historial', async () => {
    installBackNav(store);
    const backSpy = vi.spyOn(history, 'back');

    navigate(store, 'back', {
      library: { ...store.get().library, view: 'panel', panelStatus: 'playing' },
    });
    expect(store.get().library.view).toBe('panel');
    expect(backSpy).not.toHaveBeenCalled();
    // Sin popstate pendiente: nada pisa el cambio tras el margen habitual.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.view).toBe('panel');
    backSpy.mockRestore();
  });
});
