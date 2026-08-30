/**
 * Intents de las transiciones de la Biblioteca (src/navigation.js, ADR-0005):
 * cada transición y su acoplamiento al historial — profundidad, push único del
 * «abrir ficha cambiando de pestaña» (Top 5 de estadísticas y duplicado del
 * Alta) y la degradación del cierre sin historial. El patrón de history fake
 * es el de tests/backnav.test.js: historial real de jsdom con vi.spyOn sobre
 * history y waitFor tras history.back().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import {
  backToShelves,
  closeGame,
  openGame,
  openGameInTab,
  openPanel,
  repositionAfterDelete,
  switchTab,
} from '../src/navigation.js';
import { installBackNav, navigate, resetBackNav } from '../src/backnav.js';
// El cierre de hoja real (ticket 2): resetBackNav lo anula y el flujo del
// duplicado del Alta abre la hoja.
import { resetSheet } from '../src/ui/sheet.js';
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

/**
 * Slice de biblioteca con Ficha abierta y filtros activos, para los casos
 * que necesitan reponer/conservar estado.
 * @returns {import('../src/app.js').LibraryState}
 */
function libraryWithOpenFicha() {
  return {
    view: 'panel',
    panelStatus: 'playing',
    query: 'hades',
    genre: 'RPG',
    platform: 'PC',
    tag: 'indie',
    gameId: 'g1',
  };
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
});

describe('switchTab · costura directa', () => {
  it('volver a Biblioteca desde otra pestaña repone la estantería conservando búsqueda y filtros y cierra la Ficha', async () => {
    installBackNav(store);
    store.set({ tab: 'novedades', library: libraryWithOpenFicha() });
    switchTab(store, 'novedades');
    switchTab(store, 'biblioteca');

    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.query).toBe('hades');
    expect(store.get().library.genre).toBe('RPG');
    expect(store.get().library.platform).toBe('PC');
    expect(store.get().library.tag).toBe('indie');

    // Pestaña raíz: el atrás del sistema no regresa a la pestaña anterior.
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.gameId).toBeNull();
  });

  it('cambiar a otra pestaña con la Ficha abierta la cierra (pestaña raíz: el atrás no regresa)', async () => {
    installBackNav(store);
    store.set({ library: libraryWithOpenFicha() });
    switchTab(store, 'estadisticas');

    expect(store.get().tab).toBe('estadisticas');
    expect(store.get().library.gameId).toBeNull();
    // El cierre solo toca la Ficha: la vista y el filtro se conservan.
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');
    expect(store.get().library.query).toBe('hades');

    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('estadisticas');
    expect(store.get().library.gameId).toBeNull();
  });

  it('pila profunda: cambiar de pestaña reinicia la pila y la navegación interna sigue funcionando', async () => {
    installBackNav(store);
    openPanel(store, 'playing');
    openGame(store, 'g1');
    expect(store.get().library.gameId).toBe('g1');

    switchTab(store, 'novedades');
    expect(store.get().tab).toBe('novedades');
    expect(store.get().library.gameId).toBeNull();

    // El rebobinado del reset (go(-n)) es asíncrono en jsdom: esperar a que
    // termine antes de pulsar atrás.
    await new Promise((resolve) => setTimeout(resolve, 25));

    // El atrás del sistema no recorre el Panel ni la Ficha previos.
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('novedades');
    expect(store.get().library.gameId).toBeNull();

    // La navegación interna de la pestaña vuelve a funcionar: un push
    // posterior y su back restauran la raíz de esa pestaña.
    navigate(store, 'push', {
      novedades: { section: 'recientes', genre: null, detail: null },
    });
    expect(store.get().novedades.section).toBe('recientes');
    history.back();
    await vi.waitFor(() => expect(store.get().novedades.section).toBeNull());
    expect(store.get().tab).toBe('novedades');
  });
});

describe('panel y estantería · costura directa', () => {
  it('openPanel empuja y backToShelves consume la entrada', async () => {
    installBackNav(store);
    openPanel(store, 'playing');

    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');

    backToShelves(store);
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    // El popstate pendiente se traga: la instantánea obsoleta no restaura.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
  });

  it('openPanel conserva los filtros activos', async () => {
    installBackNav(store);
    store.set({ library: { ...store.get().library, query: 'hades', genre: 'RPG' } });
    openPanel(store, 'finished');

    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('finished');
    expect(store.get().library.query).toBe('hades');
    expect(store.get().library.genre).toBe('RPG');
  });
});

describe('Ficha · costura directa', () => {
  it('openGame empuja la Ficha conservando la vista y el panel previos', async () => {
    installBackNav(store);
    openPanel(store, 'playing');
    openGame(store, 'g1');

    expect(store.get().library.gameId).toBe('g1');
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');

    history.back();
    await vi.waitFor(() => expect(store.get().library.gameId).toBeNull());
    expect(store.get().library.view).toBe('panel');
  });

  it('openGameInTab empuja UNA sola entrada con pestaña + gameId; el atrás regresa al origen', async () => {
    installBackNav(store);
    switchTab(store, 'estadisticas');
    const pushSpy = vi.spyOn(history, 'pushState');

    openGameInTab(store, 'g1', 'biblioteca');

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const entry = /** @type {{app?: import('../src/backnav.js').NavSnapshot}} */ (history.state);
    expect(entry.app?.tab).toBe('biblioteca');
    expect(entry.app?.library?.gameId).toBe('g1');
    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.gameId).toBe('g1');
    pushSpy.mockRestore();

    // Una sola entrada: un solo back y el móvil ya está en el origen.
    history.back();
    await vi.waitFor(() => expect(store.get().tab).toBe('estadisticas'));
    expect(store.get().library.gameId).toBeNull();
  });

  it('closeGame consume la entrada de la Ficha y el atrás del sistema no la repite', async () => {
    installBackNav(store);
    openPanel(store, 'playing');
    openGame(store, 'g1');
    closeGame(store);

    expect(store.get().library.gameId).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.view).toBe('panel');

    // El back interno consumió la entrada de la Ficha: el siguiente back del
    // sistema restaura la estantería previa al panel.
    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('shelves'));
  });

  it('closeGame sin profundidad degrada a un set sin operación de historial', async () => {
    installBackNav(store);
    const backSpy = vi.spyOn(history, 'back');

    closeGame(store);
    expect(store.get().library.gameId).toBeNull();
    expect(backSpy).not.toHaveBeenCalled();
    // Sin popstate pendiente: nada pisa el cambio tras el margen habitual.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().library.gameId).toBeNull();
    backSpy.mockRestore();
  });

  it('repositionAfterDelete sustituye la entrada de la Ficha: el back restaura el Panel, nunca la Ficha', async () => {
    installBackNav(store);
    openPanel(store, 'playing');
    openGame(store, 'g1');
    repositionAfterDelete(store);

    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(store.get().library.gameId).toBeNull();

    history.back();
    await vi.waitFor(() => expect(store.get().library.view).toBe('panel'));
    expect(store.get().library.panelStatus).toBe('playing');
    expect(store.get().library.gameId).toBeNull();
  });
});

describe('flujo del duplicado del Alta (la danza de tres pasos desaparece)', () => {
  it('«Abrir ficha existente» empuja una sola entrada (pestaña + gameId); el atrás del móvil regresa al origen', async () => {
    const root = mount();
    createApp(root);

    const sheet = btn(qs('.fab[data-add-game]', root));
    sheet.click();
    const layer = need(qs('.add-sheet'));
    const title = /** @type {HTMLInputElement} */ (need(qs('input[name="title"]', layer)));
    title.value = 'hades';
    btn(qs('[data-save-add]', layer)).click();
    await vi.waitFor(() => expect(qs('[data-dup-warning]', layer)).toBeTruthy());

    const pushSpy = vi.spyOn(history, 'pushState');
    btn(qs('[data-dup-open]', layer)).click();

    // La hoja se cierra y el intent reutiliza la centinela de la hoja como
    // entrada de la Ficha con su pestaña: UNA sola entrada con la instantánea
    // tab + gameId, sin pushState nuevo (antes: dos pasos y un patch suelto).
    expect(qs('.add-sheet')).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    const entry = /** @type {{app?: import('../src/backnav.js').NavSnapshot}} */ (history.state);
    expect(entry.app?.tab).toBe('biblioteca');
    expect(entry.app?.library?.gameId).toBe('g1');
    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.gameId).toBe('g1');
    expect(qs('.ficha', root)).toBeTruthy();
    pushSpy.mockRestore();

    // El atrás del móvil regresa al origen (la estantería, sin Ficha).
    history.back();
    await vi.waitFor(() => expect(store.get().library.gameId).toBeNull());
    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.view).toBe('shelves');
    expect(qs('.shelves', root)).toBeTruthy();
  });
});

describe('pulsar la pestaña Biblioteca con Lista y Ficha abiertas · flujo DOM', () => {
  it('pulsar Biblioteca (pestaña ya activa) repone la estantería, no reabre la Lista (flujo: Lista → Ficha → Biblioteca)', async () => {
    await importDoc({
      schema: 'game-tracker',
      version: 1,
      updatedAt: '2026-08-23T10:00:00Z',
      games: [
        {
          id: 'g1',
          title: 'Hollow Knight',
          plays: [{ id: 'g1-p1', status: 'backlog', addedAt: '2026-08-01' }],
        },
      ],
    });
    const root = mount();
    createApp(root);

    // Lista abierta: balda «Quiero jugar» → Panel.
    btn(need(qs('[data-open-panel="backlog"]', root))).click();
    expect(qs('[data-back-shelves]', root)).toBeTruthy();
    expect(store.get().library.panelStatus).toBe('backlog');

    // Ficha abierta desde la fila del Panel.
    btn(need(qs('[data-game-id="g1"]', root))).click();
    expect(qs('.ficha', root)).toBeTruthy();

    // Pulsar Biblioteca en el raíl: SIEMPRE repone la Estantería.
    btn(need(qs('[data-tab="biblioteca"]', root))).click();

    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(qs('.shelves', root)).toBeTruthy();
    expect(qs('[data-back-shelves]', root)).toBeNull();
  });

  it('variante mínima: solo la Lista abierta (sin Ficha) también repone la estantería', async () => {
    await importDoc({
      schema: 'game-tracker',
      version: 1,
      updatedAt: '2026-08-23T10:00:00Z',
      games: [
        {
          id: 'g1',
          title: 'Hollow Knight',
          plays: [{ id: 'g1-p1', status: 'backlog', addedAt: '2026-08-01' }],
        },
      ],
    });
    const root = mount();
    createApp(root);

    btn(need(qs('[data-open-panel="backlog"]', root))).click();
    expect(qs('[data-back-shelves]', root)).toBeTruthy();

    btn(need(qs('[data-tab="biblioteca"]', root))).click();

    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(qs('.shelves', root)).toBeTruthy();
    expect(qs('[data-back-shelves]', root)).toBeNull();
  });
});

describe('flujo del Top 5 de estadísticas (push único)', () => {
  it('abrir la Ficha desde el Top 5 empuja una sola entrada; el atrás del móvil regresa a Estadísticas', async () => {
    await importDoc({
      schema: 'game-tracker',
      version: 1,
      updatedAt: '2026-08-23T10:00:00Z',
      games: [
        {
          id: 'g1',
          title: 'Hades',
          plays: [{ id: 'g1-p1', status: 'finished', addedAt: '2026-05-01', rating: 5 }],
        },
        {
          id: 'g2',
          title: 'Celeste',
          plays: [{ id: 'g2-p1', status: 'playing', addedAt: '2026-06-01', rating: 4 }],
        },
      ],
    });
    const root = mount();
    createApp(root);
    btn(qs('[data-tab="estadisticas"]', root)).click();
    const pushSpy = vi.spyOn(history, 'pushState');

    btn(need(qs('.top-row[data-game-id="g1"]', root))).click();

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.gameId).toBe('g1');
    expect(qs('.ficha', root)).toBeTruthy();
    pushSpy.mockRestore();

    history.back();
    await vi.waitFor(() => expect(store.get().tab).toBe('estadisticas'));
    expect(store.get().library.gameId).toBeNull();
  });
});