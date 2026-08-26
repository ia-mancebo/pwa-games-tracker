import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary, newLibrary } from '../src/data/library.js';
import { findDuplicates } from '../src/domain/selectors.js';
import { todayFrom } from '../src/domain/schema.js';
import { ONLINE_UNAVAILABLE_REASON } from '../src/views/addSheet.js';
import { qs, qsa } from '../src/lib/dom.js';

const NOW = new Date('2026-08-24T10:00:00Z');

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
 * Balda por etiqueta española de su placa.
 * @param {Element} root
 * @param {string} label
 * @returns {Element}
 */
function shelfSection(root, label) {
  const section = qsa('.shelves .shelf', root).find(
    (s) => qs('.plate b', s)?.textContent === label
  );
  if (!section) throw new Error(`balda no encontrada: ${label}`);
  return section;
}

/**
 * Escribe un título en el campo del formulario de Alta.
 * @param {Element} sheet
 * @param {string} value
 */
function typeTitle(sheet, value) {
  const input = need(qs('input[name="title"]', sheet));
  if (!(input instanceof HTMLInputElement)) throw new Error('title no es un input');
  input.value = value;
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

describe('botón fijo y hoja de alta', () => {
  it('el FAB está en estantería y panel; al pulsarlo abre la hoja con el camino online deshabilitado y su motivo', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    expect(qs('.fab[data-add-game]', root)?.textContent).toContain('Añadir juego');
    btn(qs('.plate[data-open-panel="backlog"]', root)).click();
    expect(qs('.fab[data-add-game]', root)).toBeTruthy();

    btn(qs('[data-back-shelves]', root)).click();
    const sheet = openSheet();
    expect(sheet.getAttribute('role')).toBe('dialog');

    const online = need(qs('[data-online-tab]', sheet));
    expect(online.hasAttribute('disabled')).toBe(true);
    expect(sheet.textContent).toContain(ONLINE_UNAVAILABLE_REASON);
    expect(qs('input[name="title"]', sheet)).toBeTruthy();

    // Cierre para no filtrar listeners entre tests.
    btn(qs('[data-close-add]', sheet)).click();
    expect(qs('.add-sheet')).toBeNull();
  });

  it('guardar solo con título crea el Juego en Quiero jugar y aparece en la estantería', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'Halo CE');
    btn(qs('[data-save-add]', sheet)).click();

    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    const game = currentDoc().games[0];
    expect(game.title).toBe('Halo CE');
    expect(game.plays[0].status).toBe('backlog');
    expect(game.plays[0].addedAt).toBe(todayFrom(new Date()));
    expect(qs('.add-sheet')).toBeNull();
    expect(
      need(qs('[data-game-id]', shelfSection(root, 'Quiero jugar')))?.getAttribute('data-game-id')
    ).toBe(game.id);
    expect(need(qs('.plate b', shelfSection(root, 'Quiero jugar')))?.textContent).toBe(
      'Quiero jugar'
    );
  });

  it('las etiquetas propias separadas por comas se guardan como lista limpia', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'Celeste');
    const tags = need(qs('input[name="tags"]', sheet));
    if (!(tags instanceof HTMLInputElement)) throw new Error('tags no es un input');
    tags.value = ' rol , ,plataformas ,difícil ';
    btn(qs('[data-save-add]', sheet)).click();

    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    expect(currentDoc().games[0].tags).toEqual(['rol', 'plataformas', 'difícil']);
  });

  it('el estado inicial es editable antes de guardar y el juego aterriza ahí', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'Hades');

    // Los chips van por data-status: la clase st-* es de la píldora de Estado
    // y sobre el label pintaba fondo/anillo rectangular (regresión visual).
    const chips = qsa('.status-chip', sheet);
    expect(chips).toHaveLength(4);
    for (const chip of chips) expect(chip.className).not.toMatch(/st-/);
    expect(qs(".status-chip[data-status='playing']", sheet)).toBeTruthy();

    const playing = need(qs('input[name="status"][value="playing"]', sheet));
    btn(qs(`label.status-chip[data-status='playing']`, sheet)).click();
    expect(/** @type {HTMLInputElement} */ (playing).checked).toBe(true);

    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
    const game = currentDoc().games[0];
    expect(game.plays[0].status).toBe('playing');

    const playingShelf = qsa('.shelves .shelf', root).find(
      (s) => qs('.plate b', s)?.textContent === 'Jugando'
    );
    expect(playingShelf ? qs('[data-game-id]', playingShelf) : null).toBeTruthy();
  });

  it('título vacío muestra error inline y no guarda nada', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, '   ');
    btn(qs('[data-save-add]', sheet)).click();

    await vi.waitFor(() => {
      expect(qs('[data-add-error]', sheet)).toBeTruthy();
    });
    expect(qs('[data-add-error]', sheet)?.textContent).toContain('El título es obligatorio');
    expect(store.get().doc?.games ?? []).toHaveLength(0);
    expect(qs('.add-sheet')).toBeTruthy();

    typeTitle(sheet, 'Halo CE');
    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => expect(store.get().doc?.games).toHaveLength(1));
  });

  it('Escape cierra sin guardar; el clic en el fondo también', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);

    let sheet = openSheet();
    typeTitle(sheet, 'Halo CE');
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(qs('.add-sheet')).toBeNull();
    expect(store.get().doc?.games ?? []).toHaveLength(0);

    sheet = openSheet();
    typeTitle(sheet, 'Otro');
    const layer = need(sheet.closest('.add-layer'));
    btn(qs('.add-backdrop', layer)).click();
    expect(qs('.add-sheet')).toBeNull();
    expect(store.get().doc?.games ?? []).toHaveLength(0);
  });
});

describe('aviso de duplicados (spec §4.5)', () => {
  it('título equivalente en otra capitalización avisa; «Crear otro igual» guarda igualmente', async () => {
    await seed([gameJson('g1', 'Halo CE', { status: 'playing' })]);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'halo ce');
    btn(qs('[data-save-add]', sheet)).click();

    const warning = await vi.waitFor(() => need(qs('[data-dup-warning]', sheet)));
    expect(warning.textContent).toContain('Halo CE');
    expect(qs('.pill.st-playing', warning)?.textContent).toBe('Jugando');
    expect(currentDoc().games).toHaveLength(1);

    btn(qs('[data-dup-create]', warning)).click();
    await vi.waitFor(() => expect(currentDoc().games).toHaveLength(2));
    expect(qs('.add-sheet')).toBeNull();
    expect(currentDoc().games.map((g) => g.title)).toContain('halo ce');
  });

  it('reabrir con el mismo título vuelve a avisar; «Abrir ficha existente» abre la Ficha', async () => {
    await seed([gameJson('g1', 'Halo CE', { status: 'finished' })]);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'HALO CE');
    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => {
      expect(qs('[data-dup-warning]', sheet)).toBeTruthy();
    });
    expect(qsa('li', need(qs('[data-dup-warning]', sheet)))).toHaveLength(1);

    btn(qs('[data-dup-open]', sheet)).click();
    expect(qs('.add-sheet')).toBeNull();
    expect(store.get().library.gameId).toBe('g1');
    expect(store.get().tab).toBe('biblioteca');
    expect(qs('.play-card', root)).toBeTruthy();
    expect(currentDoc().games).toHaveLength(1);
  });

  it('editar el título tras el aviso lo quita y permite guardar limpio', async () => {
    await seed([gameJson('g1', 'Halo CE')]);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'halo ce');
    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => {
      expect(qs('[data-dup-warning]', sheet)).toBeTruthy();
    });

    const input = need(qs('input[name="title"]', sheet));
    if (!(input instanceof HTMLInputElement)) throw new Error('title no es un input');
    input.value = 'Halo CE 2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(qs('[data-dup-warning]', sheet)).toBeNull();

    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => expect(currentDoc().games).toHaveLength(2));
    expect(currentDoc().games[1].title).toBe('Halo CE 2');
  });

  it('el aviso lista máximo 3 coincidencias', async () => {
    await seed([
      gameJson('g1', 'Halo CE'),
      gameJson('g2', 'halo ce', { addedAt: '2026-06-02' }),
      gameJson('g3', 'HALO CE', { addedAt: '2026-06-03' }),
      gameJson('g4', 'Halo   ce', { addedAt: '2026-06-04' }),
      gameJson('g5', 'Otro distinto'),
    ]);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'Halo CE');
    btn(qs('[data-save-add]', sheet)).click();
    const warning = await vi.waitFor(() => need(qs('[data-dup-warning]', sheet)));
    expect(qsa('li', warning)).toHaveLength(3);
  });

  it('sin duplicados el título nuevo se guarda directamente sin aviso', async () => {
    await seed([gameJson('g1', 'Halo CE')]);
    const root = mount();
    createApp(root);

    const sheet = openSheet();
    typeTitle(sheet, 'Celeste');
    btn(qs('[data-save-add]', sheet)).click();
    await vi.waitFor(() => expect(currentDoc().games).toHaveLength(2));
    expect(qs('[data-dup-warning]')).toBeNull();
  });
});

describe('findDuplicates (selector puro)', () => {
  const doc = /** @type {import('../src/domain/schema.js').Doc} */ ({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      gameJson('g1', 'Pokémon Esmeralda'),
      gameJson('g2', 'HALO CE', { status: 'finished' }),
      { ...gameJson('g3', 'Juego distinto'), igdbId: 1234 },
    ],
  });

  it('coincide por título normalizado: mayúsculas, tildes y espacios extremos no importan', () => {
    for (const title of ['pokemon esmeralda', 'POKÉMON ESMERALDA', '  Pokémon Esmeralda  ']) {
      expect(findDuplicates(doc, { title }).map((g) => g.id)).toEqual(['g1']);
    }
    expect(findDuplicates(doc, { title: 'halo ce' }).map((g) => g.id)).toEqual(['g2']);
  });

  it('coincide por igdbId aunque el título difiera; sin igdbId en el candidato no lo usa', () => {
    expect(findDuplicates(doc, { title: 'cualquiera', igdbId: 1234 }).map((g) => g.id)).toEqual([
      'g3',
    ]);
    expect(findDuplicates(doc, { title: 'cualquiera' })).toEqual([]);
  });

  it('devuelve [] cuando no hay equivalentes o el título es vacío', () => {
    expect(findDuplicates(doc, { title: 'zzz' })).toEqual([]);
    expect(findDuplicates(doc, { title: '' })).toEqual([]);
  });
});
