import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { qs, qsa } from '../src/lib/dom.js';

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
 * @param {string} id
 * @returns {import('../src/domain/schema.js').Game}
 */
function findGame(id) {
  const game = currentDoc().games.find((g) => g.id === id);
  if (!game) throw new Error(`juego no encontrado: ${id}`);
  return game;
}

/**
 * @param {string} gameId
 * @param {string} playId
 * @returns {import('../src/domain/schema.js').Play}
 */
function findPlay(gameId, playId) {
  const play = findGame(gameId).plays.find((p) => p.id === playId);
  if (!play) throw new Error(`jugada no encontrada: ${playId}`);
  return play;
}

/**
 * @typedef {{
 *   status: string,
 *   addedAt: string,
 *   rating?: number,
 *   platform?: {id: number|null, name: string},
 *   startedAt?: string,
 *   finishedAt?: string,
 *   notes?: string,
 * }} SeedPlay
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   igdbId?: number,
 *   tags?: string[],
 *   genres?: {id: number, name: string}[],
 *   platforms?: {id: number, name: string}[],
 *   screenshots?: string[],
 *   coverUrl?: string,
 *   description?: string,
 *   plays: SeedPlay[],
 * }} SeedGame
 */

/**
 * @param {SeedGame[]} games
 */
async function seed(games) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: games.map((g) => ({
      ...g,
      plays: g.plays.map((p, i) => ({ id: `${g.id}-p${i + 1}`, ...p })),
    })),
  });
}

/**
 * Abre la Ficha pulsando la fila del panel del Estado dado. Si ya se está en
 * ese panel, entra directo por la fila; si no, pasa primero por la placa.
 * @param {HTMLElement} root
 * @param {string} gameId
 * @param {string} status
 */
function openFromPanel(root, gameId, status) {
  if (!qs(`.b-row[data-game-id="${gameId}"]`, root)) {
    if (!qs(`.plate[data-open-panel="${status}"]`, root)) {
      btn(qs('[data-back-shelves]', root)).click();
    }
    btn(qs(`.plate[data-open-panel="${status}"]`, root)).click();
  }
  btn(qs(`.b-row[data-game-id="${gameId}"]`, root)).click();
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
  });
  await initLibrary();
});

describe('apertura de la Ficha', () => {
  it('la fila del panel abre la Ficha con héroe, píldora de estado y jugadas', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-05-01', rating: 3 },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);

    openFromPanel(root, 'g1', 'playing');
    expect(store.get().library.gameId).toBe('g1');
    expect(qs('.ficha', root)).toBeTruthy();
    expect(qs('.d-title-btn', root)?.textContent?.trim()).toBe('Hades');
    expect(qs('.d-hero .pill', root)?.classList.contains('st-playing')).toBe(true);
    // Jugadas de más reciente a más antigua.
    const cards = qsa('.play-card', root);
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('data-play-card')).toBe('g1-p2');
    expect(cards[1].getAttribute('data-play-card')).toBe('g1-p1');
  });

  it('la portada de la estantería también abre la Ficha y «← Volver» vuelve al panel o la estantería', async () => {
    await seed([
      { id: 'g1', title: 'Hades', plays: [{ status: 'playing', addedAt: '2026-07-01' }] },
    ]);
    const root = mount();
    createApp(root);

    btn(qs('.card[data-game-id="g1"]', root)).click();
    expect(qs('.ficha', root)).toBeTruthy();
    btn(qs('[data-back-ficha]', root)).click();
    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.view).toBe('shelves');
    expect(qs('.shelves', root)).toBeTruthy();

    openFromPanel(root, 'g1', 'playing');
    btn(qs('[data-back-ficha]', root)).click();
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');
    expect(qs('.b-row[data-game-id="g1"]', root)).toBeTruthy();

    // Cambiar de pestaña cierra la Ficha.
    openFromPanel(root, 'g1', 'playing');
    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().library.gameId).toBeNull();
  });
});

describe('valoración desde el héroe', () => {
  it('las estrellas valoran la jugada más reciente y «quitar» la limpia', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Celeste',
        plays: [
          { status: 'finished', addedAt: '2026-04-01', rating: 2 },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('[data-hero-rate="4"]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p2').rating).toBe(4));
    expect(findPlay('g1', 'g1-p1').rating).toBe(2);
    expect(qsa('.d-stars .star.on', root)).toHaveLength(4);

    btn(qs('[data-hero-rate-clear]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p2').rating).toBeUndefined());
    expect(qs('[data-hero-rate-clear]', root)).toBeNull();
  });

  it('cada jugada tiene su propio selector de estrellas pequeño', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Celeste',
        plays: [{ status: 'finished', addedAt: '2026-04-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'finished');

    const card = need(qs('.play-card[data-play-card="g1-p1"]', root));
    btn(qs('[data-play-rate="5"]', card)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').rating).toBe(5));
    const fresh = need(qs('.play-card[data-play-card="g1-p1"]', root));
    btn(qs('[data-play-rate-clear]', fresh)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').rating).toBeUndefined());
  });
});

describe('edición en línea de jugadas', () => {
  it('fechas startedAt/finishedAt persisten en el doc y sobreviven a la recarga de IDB', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hollow Knight',
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
        plays: [{ status: 'playing', addedAt: '2026-06-15' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const card = need(qs('.play-card[data-play-card="g1-p1"]', root));
    const start = /** @type {HTMLInputElement} */ (
      need(qs('input[data-play-date="startedAt"]', card))
    );
    start.value = '2026-06-20';
    start.dispatchEvent(new Event('change', { bubbles: true }));

    const finish = /** @type {HTMLInputElement} */ (
      need(qs('input[data-play-date="finishedAt"]', card))
    );
    finish.value = '2026-08-01';
    finish.dispatchEvent(new Event('change', { bubbles: true }));

    const notesBox = /** @type {HTMLTextAreaElement} */ (need(qs('textarea[data-play-notes]', card)));
    notesBox.value = 'Segunda vuelta al DLC';
    notesBox.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const p = findPlay('g1', 'g1-p1');
      expect(p.startedAt).toBe('2026-06-20');
      expect(p.finishedAt).toBe('2026-08-01');
      expect(p.notes).toBe('Segunda vuelta al DLC');
    });

    // Recarga desde IndexedDB: los cambios siguen ahí.
    store.set({ doc: null, ready: false });
    await initLibrary();
    const reloaded = findPlay('g1', 'g1-p1');
    expect(reloaded.startedAt).toBe('2026-06-20');
    expect(reloaded.finishedAt).toBe('2026-08-01');
    expect(reloaded.notes).toBe('Segunda vuelta al DLC');
  });

  it('vaciar una fecha elimina el campo (campo ausente = desconocido)', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hollow Knight',
        plays: [{ status: 'finished', addedAt: '2026-06-15', finishedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'finished');

    const finish = /** @type {HTMLInputElement} */ (
      need(qs('input[data-play-date="finishedAt"]', root))
    );
    finish.value = '';
    finish.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(findPlay('g1', 'g1-p1').finishedAt).toBeUndefined();
    });
    expect(Object.prototype.hasOwnProperty.call(findPlay('g1', 'g1-p1'), 'finishedAt')).toBe(false);
  });

  it('elegir plataforma del juego guarda {id,name}; «propia» con nombre guarda {id:null,name}', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        platforms: [
          { id: 6, name: 'PC (Microsoft Windows)' },
          { id: 130, name: 'Nintendo Switch' },
        ],
        plays: [{ status: 'playing', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const select = /** @type {HTMLSelectElement} */ (need(qs('select[data-play-platform]', root)));
    select.value = '130';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(findPlay('g1', 'g1-p1').platform).toEqual({ id: 130, name: 'Nintendo Switch' });
    });

    select.value = '__own__';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const own = /** @type {HTMLInputElement} */ (await vi.waitFor(() => {
      const el = qs('input[data-platform-name]', root);
      expect(el).toBeTruthy();
      return el;
    }));
    own.value = 'RetroArch';
    own.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(findPlay('g1', 'g1-p1').platform).toEqual({ id: null, name: 'RetroArch' });
    });
    expect(need(qs('select[data-play-platform]', root)).textContent).toContain('Propia: RetroArch');
  });

  it('«Añadir jugada» nace Jugando, hereda plataforma y mueve el Estado del juego', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        platforms: [{ id: 130, name: 'Nintendo Switch' }],
        plays: [
          { status: 'finished', addedAt: '2026-03-01', platform: { id: 130, name: 'Nintendo Switch' } },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'finished');

    btn(qs('[data-add-play]', root)).click();

    await vi.waitFor(() => expect(findGame('g1').plays).toHaveLength(2));
    const game = findGame('g1');
    const nueva = game.plays.find((p) => p.id !== 'g1-p1');
    if (!nueva) throw new Error('nueva jugada ausente');
    expect(nueva.status).toBe('playing');
    expect(nueva.platform).toEqual({ id: 130, name: 'Nintendo Switch' });
    expect(nueva.rating).toBeUndefined();
    expect(nueva.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // El Estado del juego pasa a Jugando: la píldora del héroe cambia.
    expect(qs('.d-hero .pill', root)?.classList.contains('st-playing')).toBe(true);
    expect(qs('.d-hero .pill', root)?.textContent?.trim()).toBe('Jugando');
  });

  it('los chips de estado cambian la jugada más reciente sin alterar el número de jugadas', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'backlog', addedAt: '2026-02-01' },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('[data-set-status="abandoned"]', root)).click();

    await vi.waitFor(() => expect(findPlay('g1', 'g1-p2').status).toBe('abandoned'));
    expect(findPlay('g1', 'g1-p1').status).toBe('backlog');
    expect(findGame('g1').plays).toHaveLength(2);
    expect(need(qs('.d-hero .pill', root)).classList.contains('st-abandoned')).toBe(true);
    expect(
      need(qs('[data-set-status="abandoned"]', root)).classList.contains('on')
    ).toBe(true);
  });

  it('borrar la última jugada está bloqueado; borrar otra pide confirmación y funciona', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01' },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    // Borrar la más reciente (queda la antigua): confirmación inline, sin window.confirm.
    const latestCard = need(qs('.play-card[data-play-card="g1-p2"]', root));
    btn(qs('[data-del-play]', latestCard)).click();
    const confirmZone = need(qs('.play-card[data-play-card="g1-p2"]', root));
    expect(qs('.p-confirm', confirmZone)?.textContent).toBe('¿Seguro?');
    btn(qs('[data-del-play-yes]', confirmZone)).click();

    await vi.waitFor(() => expect(findGame('g1').plays).toHaveLength(1));
    expect(findGame('g1').plays[0].id).toBe('g1-p1');
    expect(qs('.p-confirm', root)).toBeNull();

    // Ya con una sola jugada, el borrado queda bloqueado con su motivo.
    const last = need(qs('.play-card[data-play-card="g1-p1"]', root));
    const blocked = need(qs('[data-del-play]', last));
    expect(blocked.hasAttribute('disabled')).toBe(true);
    expect(blocked.getAttribute('title')).toContain('al menos una jugada');
    // Y el juego sigue con su jugada mínima intacta.
    btn(blocked);
    expect(findGame('g1').plays).toHaveLength(1);
  });
});

describe('reglas de edición de datos compartidos (spec §8.5)', () => {
  it('juego IGDB: campos compartidos solo lectura; título y etiquetas siempre editables', async () => {
    await seed([
      {
        id: 'gi',
        title: 'Hades',
        igdbId: 113112,
        coverUrl: 'https://images.example/t_cover_big/hades.jpg',
        description: 'Desafía al dios de los muertos.',
        genres: [{ id: 25, name: 'Roguelike' }],
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
        screenshots: ['https://images.example/shot_1.jpg', 'https://images.example/shot_2.jpg'],
        tags: ['viciante'],
        plays: [{ status: 'playing', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'gi', 'playing');

    expect(qsa('[data-edit-field]', root)).toHaveLength(0);
    expect(qs('[data-edit-title]', root)).toBeTruthy();
    expect(qs('[data-tag-add]', root)).toBeTruthy();
    expect(qsa('.d-shot img', root)).toHaveLength(2);
    expect(need(qs('.d-shot img', root)).getAttribute('loading')).toBe('lazy');

    // Título editable con clic → input → Guardar.
    btn(qs('[data-edit-title]', root)).click();
    const titleInput = /** @type {HTMLInputElement} */ (need(qs('[data-title-input]', root)));
    expect(titleInput.value).toBe('Hades');
    titleInput.value = 'Hades II';
    btn(qs('[data-title-save]', root)).click();
    await vi.waitFor(() => expect(findGame('gi').title).toBe('Hades II'));
    expect(qs('.d-title-btn', root)?.textContent?.trim()).toBe('Hades II');

    // Etiquetas: Enter añade, × quita.
    const tagAdd = /** @type {HTMLInputElement} */ (need(qs('[data-tag-add]', root)));
    tagAdd.value = 'difícil';
    tagAdd.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(findGame('gi').tags).toEqual(['viciante', 'difícil']));
    const chip = need(qs('[data-tag-remove="difícil"]', root));
    btn(chip).click();
    await vi.waitFor(() => expect(findGame('gi').tags).toEqual(['viciante']));
  });

  it('alta manual: descripción, carátula, géneros, plataformas y capturas tienen formularios de edición', async () => {
    await seed([
      {
        id: 'gm',
        title: 'Mi juego',
        plays: [{ status: 'backlog', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'gm', 'backlog');

    const fields = qsa('[data-edit-field]', root).map((el) => el.getAttribute('data-edit-field'));
    expect(fields).toEqual(['description', 'coverUrl', 'genres', 'platforms', 'screenshots']);

    btn(qs('[data-edit-field="description"]', root)).click();
    const area = /** @type {HTMLTextAreaElement} */ (need(qs('[data-field-input]', root)));
    area.value = 'Hecho a mano.';
    btn(qs('[data-field-save]', root)).click();
    await vi.waitFor(() => expect(findGame('gm').description).toBe('Hecho a mano.'));

    btn(qs('[data-edit-field="genres"]', root)).click();
    const genreInput = /** @type {HTMLInputElement} */ (need(qs('[data-field-input]', root)));
    genreInput.value = 'Puzle, Plataformas';
    btn(qs('[data-field-save]', root)).click();
    await vi.waitFor(() =>
      expect(findGame('gm').genres?.map((g) => g.name)).toEqual(['Puzle', 'Plataformas'])
    );
    expect(qsa('[data-sec="genres"] .chip.static', root).map((c) => c.textContent?.trim())).toEqual([
      'Puzle',
      'Plataformas',
    ]);

    btn(qs('[data-edit-field="platforms"]', root)).click();
    const pfInput = /** @type {HTMLInputElement} */ (need(qs('[data-field-input]', root)));
    pfInput.value = 'PC, Steam Deck';
    btn(qs('[data-field-save]', root)).click();
    await vi.waitFor(() =>
      expect(findGame('gm').platforms?.map((p) => p.name)).toEqual(['PC', 'Steam Deck'])
    );

    // Las plataformas editadas alimentan el selector de plataforma efectiva.
    const select = /** @type {HTMLSelectElement} */ (need(qs('select[data-play-platform]', root)));
    expect(select.textContent).toContain('Steam Deck');
  });

  it('alta manual: los datos compartidos vacíos pintan «—» como elemento, no como texto escapado', async () => {
    await seed([
      {
        id: 'gm',
        title: 'Mi juego',
        plays: [{ status: 'backlog', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'gm', 'backlog');

    // Los cinco cuerpos (descripción, carátula, géneros, plataformas, capturas)
    // muestran su raaya como <p class="d-meta"> real; una cadena plana devuelta
    // por sharedBodyHtml llegaba ESCAPADA al interpolarse en la plantilla html.
    const dashes = qsa('section[data-sec] .d-body > p.d-meta', root);
    expect(dashes).toHaveLength(5);
    for (const p of dashes) expect(p.textContent?.trim()).toBe('—');
    expect(root.textContent).not.toContain('<p class="d-meta">');
  });

  it('Cancelar descarta la edición del campo compartido sin escribir nada', async () => {
    await seed([
      {
        id: 'gm',
        title: 'Mi juego',
        description: 'Original',
        plays: [{ status: 'backlog', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'gm', 'backlog');

    btn(qs('[data-edit-field="description"]', root)).click();
    const area = /** @type {HTMLTextAreaElement} */ (need(qs('[data-field-input]', root)));
    area.value = 'Cambiado';
    btn(qs('[data-field-cancel]', root)).click();
    expect(findGame('gm').description).toBe('Original');
    expect(qs('[data-field-form]', root)).toBeNull();
  });
});

describe('borrado de juego', () => {
  it('con confirmación inline borra el juego y sus jugadas y regresa a la estantería', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01' },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
      { id: 'g2', title: 'Celeste', plays: [{ status: 'playing', addedAt: '2026-06-01' }] },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('[data-del-game]', root)).click();
    expect(need(qs('.danger-msg', root)).textContent).toContain('Se borrarán el juego y todas sus jugadas');

    btn(qs('[data-del-game-yes]', root)).click();

    await vi.waitFor(() => {
      expect(currentDoc().games.map((g) => g.id)).toEqual(['g2']);
    });
    expect(store.get().library.gameId).toBeNull();
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(qs('.shelves', root)).toBeTruthy();
    expect(qs('.ficha', root)).toBeNull();
  });

  it('«No» en la confirmación deja todo como estaba', async () => {
    await seed([{ id: 'g1', title: 'Hades', plays: [{ status: 'playing', addedAt: '2026-07-01' }] }]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('[data-del-game]', root)).click();
    btn(qs('[data-del-game-no]', root)).click();
    expect(findGame('g1')).toBeTruthy();
    expect(qs('.danger-msg', root)).toBeNull();
    expect(qs('.ficha', root)).toBeTruthy();
  });
});
