import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary, newLibrary } from '../src/data/library.js';
import { openAddSheet } from '../src/views/addSheet.js';
import { seedWorkerUrl } from './support/connection.js';
import { todayFrom } from '../src/domain/schema.js';
import { qs, qsa } from '../src/lib/dom.js';

const NOW = new Date('2026-08-24T10:00:00Z');
const WORKER_URL = 'https://gt-proxy.example.workers.dev';

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, status: number, json: () => Promise<unknown> }}
 */
function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body };
}

/** Resultado de búsqueda con la forma del contrato del Worker (worker/CONTRACT.md). */
const SEARCH_RESULT = {
  igdbId: 1877,
  title: 'Celeste',
  releaseDate: '2018-01-25',
  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1nij.jpg',
  description: 'Un plataformas para quienes están decididos a escalar.',
  genres: [
    { id: 8, name: 'Platform' },
    { id: 32, name: 'Indie' },
  ],
  platforms: [
    { id: 6, name: 'PC (Microsoft Windows)' },
    { id: 130, name: 'Nintendo Switch' },
  ],
  screenshots: ['https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg'],
};

/**
 * Stub global de fetch que responde /api/search con `results`.
 * @param {unknown[]} [results]
 * @returns {import('vitest').Mock}
 */
function stubFetch(results = [SEARCH_RESULT]) {
  const mock = vi.fn(
    /** @param {string} url */
    async (url) => jsonRes(String(url).includes('/api/search') ? { results } : {})
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

/**
 * Sombrea navigator.onLine (restaurable en afterEach).
 * @param {boolean} value
 */
function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

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
 * @typedef {{
 *   id: string,
 *   title: string,
 *   igdbId?: number,
 *   plays: { id: string, status: string, addedAt: string }[],
 * }} SeedGame
 */

/**
 * @param {string} id
 * @param {string} title
 * @param {{ status?: string, addedAt?: string }} [play]
 * @returns {SeedGame}
 */
function gameJson(id, title, { status = 'backlog', addedAt = '2026-06-01' } = {}) {
  return { id, title, plays: [{ id: `${id}-p1`, status, addedAt }] };
}

/**
 * @param {SeedGame[]} games
 */
async function seed(games) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games,
  });
}

/** Abre la hoja de Alta pulsando el botón fijo y devuelve la hoja. */
function openSheet() {
  btn(qs('.fab[data-add-game]')).click();
  return need(qs('.add-sheet'));
}

/**
 * Escribe y dispara input en el campo de búsqueda online.
 * @param {Element} sheet
 * @param {string} value
 */
function typeQuery(sheet, value) {
  const input = need(qs('input[name="online-query"]', sheet));
  if (!(input instanceof HTMLInputElement)) throw new Error('online-query no es un input');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
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
    },
  });
  await initLibrary();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('camino online activo (servicio configurado + conexión)', () => {
  it('la pestaña online nace activa; el debounce agrupa tecleo en UNA petición con q codificado', async () => {
    const fetchMock = stubFetch();
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    expect(btn(need(qs('[data-online-tab]', sheet))).classList.contains('on')).toBe(true);
    expect(qs('[data-manual-tab]', sheet)).toBeTruthy();

    typeQuery(sheet, 'cele');
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 350));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${WORKER_URL}/api/search?q=celeste`);
  });

  it('pinta resultados con carátula, título, año y plataformas', async () => {
    stubFetch([
      SEARCH_RESULT,
      { ...SEARCH_RESULT, igdbId: 1020, title: 'Elden Ring', releaseDate: '2022-02-25', coverUrl: null },
    ]);
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(2), { timeout: 2000 });
    const first = need(qsa('[data-result]', sheet)[0]);
    expect(first.querySelector('.cover img')?.getAttribute('src')).toBe(SEARCH_RESULT.coverUrl);
    expect(first.textContent).toContain('Celeste');
    expect(first.textContent).toContain('2018');
    expect(first.textContent).toContain('Nintendo Switch');

    const second = need(qsa('[data-result]', sheet)[1]);
    expect(second.querySelector('.cover img')).toBeNull();
    expect(second.textContent).toContain('Elden Ring');
    expect(second.textContent).toContain('2022');
  });

  it('elegir un resultado muestra la previsualización y NO añade hasta confirmar; «Volver» restaura la lista', async () => {
    stubFetch();
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    btn(qs('[data-result]', sheet)).click();

    // Previsualización con los datos compartidos; la biblioteca sigue intacta.
    const preview = await vi.waitFor(() => need(qs('.add-preview', sheet)));
    expect(preview.textContent).toContain('Celeste');
    expect(preview.textContent).toContain('2018');
    expect(preview.textContent).toContain('Un plataformas para quienes están decididos a escalar.');
    expect(preview.textContent).toContain('Platform');
    expect(store.get().doc?.games).toHaveLength(0);

    btn(qs('[data-preview-back]', sheet)).click();
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1));
    expect(qs('.add-preview', sheet)).toBeNull();
    expect(store.get().doc?.games).toHaveLength(0);
  });

  it('elegir un resultado y confirmar crea el juego con datos IGDB y primera jugada Quiero jugar', async () => {
    stubFetch();
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    btn(qs('[data-result]', sheet)).click();
    btn(await vi.waitFor(() => need(qs('[data-preview-add]', sheet)))).click();

    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    const game = currentDoc().games[0];
    expect(game.title).toBe('Celeste');
    expect(game.igdbId).toBe(1877);
    expect(game.coverUrl).toBe(SEARCH_RESULT.coverUrl);
    expect(game.description).toBe(SEARCH_RESULT.description);
    expect(game.genres).toEqual(SEARCH_RESULT.genres);
    expect(game.platforms).toEqual(SEARCH_RESULT.platforms);
    expect(game.screenshots).toEqual(SEARCH_RESULT.screenshots);
    expect(game.plays[0].status).toBe('backlog');
    expect(game.plays[0].addedAt).toBe(todayFrom(new Date()));
    expect(qs('.add-sheet')).toBeNull();
    expect(
      need(qs('[data-game-id]', root))?.getAttribute('data-game-id')
    ).toBe(game.id);
  });

  it('tras guardar llama onSaved con el juego creado', async () => {
    stubFetch();
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const onSaved = vi.fn();
    openAddSheet({ onSaved });

    const sheet = need(qs('.add-sheet'));
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    btn(qs('[data-result]', sheet)).click();
    btn(await vi.waitFor(() => need(qs('[data-preview-add]', sheet)))).click();

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ igdbId: 1877, title: 'Celeste' });
  });

  it('resultado con igdbId duplicado avisa; «Crear otro igual» guarda igualmente', async () => {
    stubFetch();
    await seed([{ ...gameJson('g1', 'Otra cosa'), igdbId: 1877 }]);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    btn(qs('[data-result]', sheet)).click();
    btn(await vi.waitFor(() => need(qs('[data-preview-add]', sheet)))).click();

    const warning = await vi.waitFor(() => need(qs('[data-dup-warning]', sheet)));
    expect(warning.textContent).toContain('Otra cosa');
    expect(currentDoc().games).toHaveLength(1);

    btn(qs('[data-dup-create]', warning)).click();
    await vi.waitFor(() => expect(currentDoc().games).toHaveLength(2));
    expect(currentDoc().games[1]?.igdbId).toBe(1877);
    expect(qs('.add-sheet')).toBeNull();
  });

  it('título equivalente al escribir también avisa de duplicados (mismo flujo manual)', async () => {
    stubFetch([SEARCH_RESULT]);
    await seed([gameJson('g1', 'Celeste', { status: 'finished' })]);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'otro');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    // El título «Celeste» coincide por normalización aunque el igdbId sea nuevo.
    stubFetch([{ ...SEARCH_RESULT, igdbId: 999999 }]);
    typeQuery(sheet, 'celeste 2');
    await vi.waitFor(
      () => {
        const rows = qsa('[data-result]', sheet);
        return rows.length === 1 && rows[0]?.textContent?.includes('Celeste');
      },
      { timeout: 2000 }
    );
    btn(qs('[data-result]', sheet)).click();
    btn(await vi.waitFor(() => need(qs('[data-preview-add]', sheet)))).click();
    await vi.waitFor(() => need(qs('[data-dup-warning]', sheet)));
    expect(currentDoc().games).toHaveLength(1);
  });

  it('sin resultados muestra el estado vacío «Sin resultados»', async () => {
    stubFetch([]);
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'zzzz');
    await vi.waitFor(() => need(qs('[data-online-empty]', sheet)), { timeout: 2000 });
    expect(need(qs('[data-online-empty]', sheet)).textContent).toContain('Sin resultados');
  });

  it('fallo del servicio muestra el error inline sin cerrar la hoja', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => need(qs('[data-online-error]', sheet)), { timeout: 2000 });
    expect(need(qs('[data-online-error]', sheet)).textContent).toContain(
      'No se pudo contactar con el servicio'
    );
    expect(qs('.add-sheet')).toBeTruthy();
  });
});

describe('camino online deshabilitado', () => {
  it('sin conexión: pestaña deshabilitada con motivo y el manual sigue operativo', async () => {
    const fetchMock = stubFetch();
    setOnline(false);
    await newLibrary(NOW);
    seedWorkerUrl(WORKER_URL);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    expect(need(qs('[data-online-tab]', sheet)).hasAttribute('disabled')).toBe(true);
    expect(sheet.textContent).toContain('Sin conexión');
    expect(fetchMock).not.toHaveBeenCalled();

    const titleInput = need(qs('input[name="title"]', sheet));
    if (!(titleInput instanceof HTMLInputElement)) throw new Error('title no es un input');
    titleInput.value = 'Halo CE';
    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    expect(currentDoc().games[0]?.title).toBe('Halo CE');
    expect(qs('.add-sheet')).toBeNull();
  });

  it('sin servicio: motivo que apunta a Datos sin campo inline; configurada en Datos, la hoja abre online', async () => {
    stubFetch();
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    let sheet = openSheet();
    expect(need(qs('[data-online-tab]', sheet)).hasAttribute('disabled')).toBe(true);
    expect(sheet.textContent).toContain('Sin servicio configurado');
    expect(sheet.textContent).toContain('Datos');
    expect(qs('input[name="worker-url"]', sheet)).toBeNull();
    btn(qs('[data-close-add]', sheet)).click();

    // El usuario guarda la URL en la sección «Conexión» de Datos; la siguiente
    // hoja de Alta nace con el camino online operativo.
    seedWorkerUrl(WORKER_URL);
    sheet = openSheet();
    expect(need(qs('[data-online-tab]', sheet)).hasAttribute('disabled')).toBe(false);
    expect(btn(need(qs('[data-online-tab]', sheet))).classList.contains('on')).toBe(true);

    typeQuery(sheet, 'celeste');
    await vi.waitFor(() => expect(qsa('[data-result]', sheet)).toHaveLength(1), { timeout: 2000 });
    btn(qs('[data-result]', sheet)).click();
    btn(await vi.waitFor(() => need(qs('[data-preview-add]', sheet)))).click();
    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    expect(currentDoc().games[0]?.igdbId).toBe(1877);
  });
});
