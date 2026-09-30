/**
 * Aviso de contador en todas las pantallas (ticket 08): barra del chrome con
 * el Juego anclado, su reloj vivo, Pausar inline y la señalización de los
 * Tramos pendientes de revisión. Comportamiento observable sobre el DOM y el
 * store, al estilo de tests/app.test.js (montar, clicar, asertar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, freshFicha, store } from '../src/app.js';
import { addGame, importDoc, initLibrary, newLibrary, startCounter } from '../src/data/library.js';
import { qs } from '../src/lib/dom.js';

const TODAY = '2026-08-24';
const T0 = '2026-08-24T10:00:00Z';
const T0_MS = Date.parse(T0);

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

/** Documento activo; falla si no hay biblioteca cargada.
 * @returns {import('../src/domain/schema.js').Doc}
 */
function currentDoc() {
  const doc = store.get().doc;
  if (!doc) throw new Error('sin documento');
  return doc;
}

/**
 * `H:MM:SS` a segundos.
 * @param {string} text
 * @returns {number}
 */
function clockSeconds(text) {
  const [h, m, s] = text.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Jugada de siembra; `pending` tramos pendientes de 60 s cada uno.
 * @param {string} id
 * @param {import('../src/domain/schema.js').Status} status
 * @param {number} pending
 * @returns {any}
 */
function playJson(id, status, pending) {
  return {
    id,
    status,
    addedAt: '2026-08-01',
    ...(status === 'playing' ? { startedAt: '2026-08-01' } : {}),
    ...(pending > 0
      ? {
          pendingSegments: Array.from({ length: pending }, (_, i) => ({
            id: `${id}-s${i + 1}`,
            seconds: 60 * (i + 1),
          })),
        }
      : {}),
  };
}

/**
 * Doc v2 con dos juegos (g1 Celeste Jugando, g2 Hades en espera), con o sin
 * Contador en marcha y con Tramos pendientes por juego.
 * @param {{
 *   counter?: { gameId: string, playId: string, startedAt: string },
 *   pending?: Record<string, number>,
 * }} [opts]
 */
async function seed({ counter, pending = {} } = {}) {
  await importDoc({
    schema: 'game-tracker',
    version: 2,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      { id: 'g1', title: 'Celeste', plays: [playJson('p1', 'playing', pending.g1 ?? 0)] },
      { id: 'g2', title: 'Hades', plays: [playJson('p3', 'backlog', pending.g2 ?? 0)] },
    ],
    ...(counter ? { counter } : {}),
  });
}

/**
 * Reloj fijo: la fecha y el intervalo del tictac se fingen juntos para que el
 * reloj vivo avance con `advanceTimersByTime` y la pausa sea determinista.
 * @param {number} systemTimeMs
 */
function fakeClock(systemTimeMs) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date(systemTimeMs));
}

beforeEach(async () => {
  document.body.innerHTML = '';
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
    novedades: { section: null, genre: null, detail: null },
    ficha: freshFicha(null),
  });
  await initLibrary();
});

afterEach(() => {
  document.body.innerHTML = '';
  if (vi.isFakeTimers()) {
    // Sin `[data-aviso-live]` el tictac del aviso se auto-cancela al primer tic.
    vi.advanceTimersByTime(2000);
  }
  vi.useRealTimers();
});

describe('aviso de contador (ticket 08)', () => {
  it('se muestra en Estantería, Panel, Ficha, Novedades y Estadísticas y el reloj sigue contando', async () => {
    await seed({ counter: { gameId: 'g1', playId: 'p1', startedAt: T0 } });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    const crece = () => {
      const antes = clockSeconds(need(qs('[data-aviso-live]', root)).textContent ?? '');
      vi.advanceTimersByTime(3000);
      expect(clockSeconds(need(qs('[data-aviso-live]', root)).textContent ?? '')).toBe(antes + 3);
    };

    expect(qs('[data-aviso-title]', root)?.textContent).toBe('Celeste');
    crece();

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    expect(store.get().library.view).toBe('panel');
    crece();

    btn(qs('.b-row[data-game-id="g1"]', root)).click();
    expect(store.get().library.gameId).toBe('g1');
    crece();

    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');
    crece();

    btn(qs('[data-tab="estadisticas"]', root)).click();
    expect(store.get().tab).toBe('estadisticas');
    crece();
  });

  it('el reloj vivo crece con el tictac sin escribir el Doc', async () => {
    await seed({ counter: { gameId: 'g1', playId: 'p1', startedAt: T0 } });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    expect(need(qs('[data-aviso-live]', root)).textContent).toBe('0:00:00');
    const before = currentDoc();

    vi.advanceTimersByTime(3000);
    expect(need(qs('[data-aviso-live]', root)).textContent).toBe('0:00:03');
    vi.advanceTimersByTime(59_000);
    expect(need(qs('[data-aviso-live]', root)).textContent).toBe('0:01:02');

    expect(currentDoc()).toBe(before);
    expect(currentDoc().counter).toMatchObject({ gameId: 'g1', playId: 'p1' });
  });

  it('Pausar pausa el Contador sin navegar: ancla fuera y Tramo pendiente', async () => {
    await newLibrary(new Date(T0));
    const doc = await addGame({ title: 'Celeste', today: TODAY, status: 'playing' });
    await startCounter(doc.games[0].id, new Date(T0));
    fakeClock(T0_MS + 45_000);
    const root = mount();
    createApp(root);

    expect(store.get().library.gameId).toBeNull();
    btn(qs('[data-aviso-pause]', root)).click();
    await vi.waitFor(() => expect(currentDoc().counter).toBeUndefined());

    expect(currentDoc().games[0].plays[0].pendingSegments).toEqual([
      { id: expect.any(String), seconds: 45 },
    ]);
    expect(store.get().library.gameId).toBeNull();
    expect(qs('[data-aviso-live]', root)).toBeNull();
    expect(qs('[data-aviso-pause]', root)).toBeNull();
    expect(need(qs('[data-aviso-pendientes]', root)).getAttribute('data-aviso-pendientes')).toBe('1');
  });

  it('señala los Tramos pendientes con el Contador en marcha', async () => {
    await seed({
      counter: { gameId: 'g1', playId: 'p1', startedAt: T0 },
      pending: { g1: 1, g2: 1 },
    });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    const marca = need(qs('[data-aviso-pendientes]', root));
    expect(marca.getAttribute('data-aviso-pendientes')).toBe('2');
    expect(marca.textContent).toBe('2 tramos pendientes de revisión');
    expect(qs('[data-aviso-live]', root)).toBeTruthy();
    expect(qs('[data-aviso-pause]', root)).toBeTruthy();
  });

  it('con solo Tramos pendientes el aviso se muestra sin reloj ni Pausar', async () => {
    await seed({ pending: { g2: 1 } });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    expect(qs('[data-aviso-title]', root)?.textContent).toBe('Hades');
    expect(need(qs('[data-aviso-pendientes]', root)).textContent).toBe(
      '1 tramos pendientes de revisión'
    );
    expect(qs('[data-aviso-live]', root)).toBeNull();
    expect(qs('[data-aviso-pause]', root)).toBeNull();
  });

  it('el cuerpo del aviso abre la Ficha de su Juego desde la Estantería', async () => {
    await seed({ counter: { gameId: 'g1', playId: 'p1', startedAt: T0 }, pending: { g1: 1 } });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);
    expect(store.get().library.gameId).toBeNull();

    btn(qs('[data-aviso-open]', root)).click();

    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.gameId).toBe('g1');
    expect(store.get().ficha.gameId).toBe('g1');
    expect(qs('main', root)?.textContent).toContain('Celeste');
  });

  it('el cuerpo del aviso abre la Ficha también desde Novedades con pila atrás', async () => {
    await seed({ counter: { gameId: 'g1', playId: 'p1', startedAt: T0 }, pending: { g1: 1 } });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');

    // El cuerpo entero es clicable: se pulsa el indicador de pendientes.
    btn(qs('[data-aviso-pendientes]', root)).click();

    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.gameId).toBe('g1');
    expect(store.get().ficha.gameId).toBe('g1');
  });

  it('sin Contador ni Tramos pendientes no se muestra ni suscribe el tictac', async () => {
    await seed();
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    expect(qs('.aviso-slot', root)?.innerHTML).toBe('');
    expect(qs('[data-aviso-open]', root)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('el ancla huérfana no rompe ni se muestra', async () => {
    await seed({
      counter: { gameId: 'fantasma', playId: 'fantasma', startedAt: T0 },
      pending: { g1: 1 },
    });
    fakeClock(T0_MS);
    const root = mount();
    createApp(root);

    expect(qs('[data-aviso-open]', root)).toBeNull();
    expect(qs('[data-aviso-live]', root)).toBeNull();
    expect(qs('.card[data-game-id="g1"]', root)).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
