import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 *   playedSeconds?: number,
 *   pendingSegments?: {id: string, seconds: number}[],
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
 * @param {{gameId: string, playId: string, startedAt: string}} [counter] Contador en marcha
 */
async function seed(games, counter) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: games.map((g) => ({
      ...g,
      plays: g.plays.map((p, i) => ({ id: `${g.id}-p${i + 1}`, ...p })),
    })),
    ...(counter ? { counter } : {}),
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

/** Instante de inicio del Contador sembrado. */
const T0 = '2026-08-24T10:00:00Z';
const T0_MS = Date.parse(T0);
/** Pausa a los 2700 s del inicio: el tramo contado debe ser de 2700 s. */
const PAUSE_MS = T0_MS + 2_700_000;

/**
 * Pulsa Pausar con el reloj de sistema fijado en `systemTimeMs` para que el
 * tramo contado sea determinista, y espera a que el consejo quede abierto.
 * @param {HTMLElement} root
 * @param {number} systemTimeMs
 * @returns {Promise<{ playId: string, segmentId: string }>}
 */
async function pauseToAdvice(root, systemTimeMs) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(systemTimeMs));
  try {
    btn(qs('.d-hero [data-counter-toggle]', root)).click();
    await vi.waitFor(() => expect(store.get().ficha.segmentPrompt).toBeTruthy());
  } finally {
    vi.useRealTimers();
  }
  const prompt = store.get().ficha.segmentPrompt;
  if (!prompt) throw new Error('el consejo no se abrió');
  return prompt;
}

/**
 * Siembra g1 con 600 s consolidados y el Contador en marcha desde T0, abre la
 * Ficha y pausa dejando el consejo abierto sobre el tramo nuevo de 2700 s.
 * @returns {Promise<HTMLElement>}
 */
async function openPausedFicha() {
  await seed(
    [
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ],
    { gameId: 'g1', playId: 'g1-p1', startedAt: T0 }
  );
  const root = mount();
  createApp(root);
  openFromPanel(root, 'g1', 'playing');
  await pauseToAdvice(root, PAUSE_MS);
  return root;
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
    start.dispatchEvent(new Event('focusout', { bubbles: true }));

    const finish = /** @type {HTMLInputElement} */ (
      need(qs('input[data-play-date="finishedAt"]', card))
    );
    finish.value = '2026-08-01';
    finish.dispatchEvent(new Event('focusout', { bubbles: true }));

    const notesBox = /** @type {HTMLTextAreaElement} */ (
      need(qs('textarea[data-play-notes]', card))
    );
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

  it('un `change` del input date a mitad de escritura no confirma ni re-renderiza (Chrome lo dispara al completarse la fecha)', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hollow Knight',
        plays: [{ status: 'playing', addedAt: '2026-06-15', startedAt: '2026-06-15' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    // Chrome dispara `change` en cuanto la fecha queda completa: al teclear el
    // año, cada dígito la completa. Confirmar ahí re-renderizaba la Ficha a
    // mitad de escritura y el input se reconstruía (el usuario veía una
    // «recarga»). El `change` debe ignorarse: ni doc tocado ni nodo sustituido.
    const start = /** @type {HTMLInputElement} */ (
      need(qs('input[data-play-date="startedAt"]', root))
    );
    start.value = '2026-06-20';
    start.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(findPlay('g1', 'g1-p1').startedAt).toBe('2026-06-15');
    expect(qs('input[data-play-date="startedAt"]', root)).toBe(start);

    // La fecha se confirma al salir del campo (focusout), como el título.
    start.dispatchEvent(new Event('focusout', { bubbles: true }));
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').startedAt).toBe('2026-06-20'));
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
    finish.dispatchEvent(new Event('focusout', { bubbles: true }));

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
    const own = /** @type {HTMLInputElement} */ (
      await vi.waitFor(() => {
        const el = qs('input[data-platform-name]', root);
        expect(el).toBeTruthy();
        return el;
      })
    );
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
          {
            status: 'finished',
            addedAt: '2026-03-01',
            platform: { id: 130, name: 'Nintendo Switch' },
          },
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
    expect(need(qs('[data-set-status="abandoned"]', root)).classList.contains('on')).toBe(true);
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
    expect(qsa('[data-sec="genres"] .chip.static', root).map((c) => c.textContent?.trim())).toEqual(
      ['Puzle', 'Plataformas']
    );

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
    expect(need(qs('.danger-msg', root)).textContent).toContain(
      'Se borrarán el juego y todas sus jugadas'
    );

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
    await seed([
      { id: 'g1', title: 'Hades', plays: [{ status: 'playing', addedAt: '2026-07-01' }] },
    ]);
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

describe('contador en la Ficha: iniciar/pausar y tiempo vivo (ticket 06)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el botón arranca el Contador (ancla en el Doc, jugada a Jugando) y pasa a Pausar', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'backlog', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'backlog');

    const labels = () => qsa('[data-counter-toggle]', root).map((b) => b.textContent?.trim());
    expect(labels()).toEqual(['Iniciar', 'Iniciar']);
    btn(qs('.d-hero [data-counter-toggle]', root)).click();

    await vi.waitFor(() => expect(currentDoc().counter).toBeTruthy());
    expect(currentDoc().counter).toMatchObject({ gameId: 'g1', playId: 'g1-p1' });
    expect(findPlay('g1', 'g1-p1').status).toBe('playing');
    expect(labels()).toEqual(['Pausar', 'Pausar']);
  });

  it('el tiempo mostrado avanza en vivo: Tiempo jugado más tramo en marcha', async () => {
    await seed(
      [
        {
          id: 'g1',
          title: 'Hades',
          plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 3600 }],
        },
      ],
      { gameId: 'g1', playId: 'g1-p1', startedAt: T0 }
    );
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(T0_MS + 65_000));
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const live = () => qsa('[data-live-time]', root).map((el) => el.textContent?.trim());
    // Héroe y tarjeta: 3600 s consolidados + 65 s del tramo en marcha.
    expect(live()).toEqual(['1:01:05', '1:01:05']);
    vi.advanceTimersByTime(3000);
    expect(live()).toEqual(['1:01:08', '1:01:08']);
    vi.advanceTimersByTime(2000);
    expect(live()).toEqual(['1:01:10', '1:01:10']);
  });

  it('Pausar abre el consejo prefillado con lo contado, enfocado en la jugada anclada', async () => {
    await seed(
      [
        {
          id: 'g1',
          title: 'Hades',
          plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
        },
      ],
      { gameId: 'g1', playId: 'g1-p1', startedAt: T0 }
    );
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const prompt = await pauseToAdvice(root, PAUSE_MS);
    expect(prompt).toEqual({ playId: 'g1-p1', segmentId: expect.any(String) });
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    expect(input.value).toBe('2700');
    expect(document.activeElement).toBe(input);
    expect(currentDoc().counter).toBeUndefined();
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
  });

  it('«Guardar tal cual» consolida lo contado en el Tiempo jugado y cierra el consejo', async () => {
    const root = await openPausedFicha();
    btn(qs('[data-seg-save-asis]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(3300));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
    expect(qs('[data-seg-input]', root)).toBeNull();
    expect(store.get().ficha.segmentPrompt).toBeNull();
  });

  it('«Guardar» consolida la duración escrita en el input', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '100';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(700));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
    expect(qs('[data-seg-input]', root)).toBeNull();
  });

  it('«Guardar» con duración inválida la rechaza inline sin llamar al motor', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '-5';
    btn(qs('[data-seg-save]', root)).click();
    const error = need(qs('[data-seg-error]', root));
    expect(error.hasAttribute('hidden')).toBe(false);
    expect(error.textContent).toContain('entero de segundos');
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(store.get().ficha.segmentPrompt).toBeTruthy();
  });

  it('«Descartar» del consejo quita el tramo sin tocar el Tiempo jugado', async () => {
    const root = await openPausedFicha();
    btn(qs('[data-seg-discard]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined());
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    expect(qs('[data-seg-input]', root)).toBeNull();
  });

  it('«Decidir después» cierra el consejo y deja el tramo pendiente señalizado', async () => {
    const root = await openPausedFicha();
    btn(qs('[data-seg-later]', root)).click();
    await vi.waitFor(() => expect(qs('[data-seg-input]', root)).toBeNull());
    expect(store.get().ficha.segmentPrompt).toBeNull();
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(qs('[data-pending-segments]', root)?.getAttribute('data-pending-segments')).toBe('1');
  });

  it('la auto-pausa (Terminar) no abre consejo y deja el tramo pendiente señalizado', async () => {
    await seed(
      [
        {
          id: 'g1',
          title: 'Hades',
          plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
        },
      ],
      { gameId: 'g1', playId: 'g1-p1', startedAt: T0 }
    );
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(PAUSE_MS));
    try {
      btn(qs('[data-set-status="finished"]', root)).click();
      await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').status).toBe('finished'));
    } finally {
      vi.useRealTimers();
    }
    expect(store.get().ficha.segmentPrompt).toBeNull();
    expect(qs('[data-seg-input]', root)).toBeNull();
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(qs('[data-pending-segments]', root)?.getAttribute('data-pending-segments')).toBe('1');
  });

  it('sin Contador en marcha el tictac no escribe el Doc', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(T0_MS));
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const before = store.get().doc;
    vi.advanceTimersByTime(5000);
    expect(store.get().doc).toBe(before);
    expect(store.get().doc?.updatedAt).toBe(before?.updatedAt);
    expect(qsa('[data-live-time]', root)).toHaveLength(0);
    expect(need(qs('.play-card[data-play-card="g1-p1"] .p-time', root)).textContent).toContain(
      '10 min'
    );
  });
});

describe('revisión de tramos pendientes (ticket 07)', () => {
  /**
   * @param {SeedPlay[]} plays
   * @returns {Promise<HTMLElement>}
   */
  async function openWithSegments(plays) {
    await seed([{ id: 'g1', title: 'Hades', plays }]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');
    return root;
  }

  /** @returns {SeedPlay[]} */
  const twoSegments = () => [
    {
      status: 'playing',
      addedAt: '2026-07-01',
      playedSeconds: 600,
      pendingSegments: [
        { id: 'seg1', seconds: 2700 },
        { id: 'seg2', seconds: 1200 },
      ],
    },
  ];

  it('los tramos pendientes de la más reciente se ven y se deciden uno a uno', async () => {
    const root = await openWithSegments(twoSegments());

    expect(qsa('[data-seg-row]', root).map((r) => r.getAttribute('data-seg-row'))).toEqual([
      'seg1',
      'seg2',
    ]);
    expect(qs('[data-pending-segments]', root)?.getAttribute('data-pending-segments')).toBe('2');

    // «Decidir» expande el consejo dentro de la fila del tramo.
    btn(qs('[data-seg-decide="seg1"]', root)).click();
    expect(qs('[data-seg-row="seg1"] [data-seg-input]', root)).toBeTruthy();
    expect(/** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root))).value).toBe('2700');
    btn(qs('[data-seg-save-asis]', root)).click();

    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(3300));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([{ id: 'seg2', seconds: 1200 }]);
    expect(qsa('[data-seg-row]', root).map((r) => r.getAttribute('data-seg-row'))).toEqual([
      'seg2',
    ]);
    expect(qs('[data-pending-segments]', root)?.getAttribute('data-pending-segments')).toBe('1');

    btn(qs('[data-seg-decide="seg2"]', root)).click();
    btn(qs('[data-seg-save-asis]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(4500));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
    expect(qsa('[data-seg-row]', root)).toHaveLength(0);
  });

  it('la duración es editable antes de guardar; cero descarta el tramo', async () => {
    const root = await openWithSegments(twoSegments());

    btn(qs('[data-seg-decide="seg1"]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '100';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(700));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([{ id: 'seg2', seconds: 1200 }]);

    // Cero = descartar: el tramo sale sin sumar nada.
    btn(qs('[data-seg-decide="seg2"]', root)).click();
    const input2 = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input2.value = '0';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined());
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(700);
    expect(qsa('[data-seg-row]', root)).toHaveLength(0);
  });

  it('descartar un tramo lo borra sin rastro ni en pendientes ni en el consolidado', async () => {
    const root = await openWithSegments(twoSegments());

    btn(qs('[data-seg-discard="seg1"]', root)).click();
    await vi.waitFor(() =>
      expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([{ id: 'seg2', seconds: 1200 }])
    );
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    expect(qs('[data-seg-row="seg1"]', root)).toBeNull();
    expect(need(qs('.play-card[data-play-card="g1-p1"] .p-time', root)).textContent).toContain(
      '10 min'
    );
  });

  it('las jugadas menos recientes muestran su Tiempo jugado histórico sin botones', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01' },
          { status: 'abandoned', addedAt: '2026-05-01', playedSeconds: 45258 },
          { status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const old1 = need(qs('.play-card[data-play-card="g1-p1"]', root));
    expect(need(qs('.p-time', old1)).textContent).toContain('0 min');
    const old2 = need(qs('.play-card[data-play-card="g1-p2"]', root));
    expect(need(qs('.p-time', old2)).textContent).toContain('12 h 34 min');
    for (const card of [old1, old2]) {
      expect(qs('[data-counter-toggle]', card)).toBeNull();
      expect(qs('[data-seg-row]', card)).toBeNull();
      expect(qs('[data-live-time]', card)).toBeNull();
    }

    const latest = need(qs('.play-card[data-play-card="g1-p3"]', root));
    expect(qs('[data-counter-toggle]', latest)).toBeTruthy();
    expect(qs('.d-hero [data-counter-toggle]', root)).toBeTruthy();
  });

  it('la señalización de pendientes desaparece al decidirlos todos', async () => {
    const root = await openWithSegments(twoSegments());
    expect(qs('[data-pending-segments]', root)).toBeTruthy();

    btn(qs('[data-seg-decide="seg1"]', root)).click();
    btn(qs('[data-seg-save-asis]', root)).click();
    await vi.waitFor(() =>
      expect(qs('[data-pending-segments]', root)?.getAttribute('data-pending-segments')).toBe('1')
    );

    btn(qs('[data-seg-discard="seg2"]', root)).click();
    await vi.waitFor(() => expect(qs('[data-pending-segments]', root)).toBeNull());
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
  });
});

describe('duración del Tramo con formas de reloj (ticket 01)', () => {
  it('«Guardar» acepta H:MM (horas:minutos) y suma sobre el Tiempo jugado', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '1:30';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(6000));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
    expect(qs('[data-seg-input]', root)).toBeNull();
  });

  it('«Guardar» acepta H:MM:SS sin relleno (1:2:3 = 3723 s)', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '1:2:3';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(4323));
  });

  it('texto no numérico se rechaza inline con las formas aceptadas, sin mutar el doc', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = 'abc';
    btn(qs('[data-seg-save]', root)).click();
    const error = need(qs('[data-seg-error]', root));
    expect(error.hasAttribute('hidden')).toBe(false);
    expect(error.textContent).toContain('H:MM:SS');
    expect(error.textContent).toContain('horas:minutos');
    expect(error.textContent).toContain('entero de segundos');
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(store.get().ficha.segmentPrompt).toBeTruthy();
    expect(qs('[data-seg-input]', root)).toBeTruthy();
  });

  it('campo vacío guarda tal cual la duración prefill, como antes del cambio', async () => {
    const root = await openPausedFicha();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-seg-input]', root)));
    input.value = '';
    btn(qs('[data-seg-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(3300));
    expect(findPlay('g1', 'g1-p1').pendingSegments).toBeUndefined();
  });
});

describe('corrección del Tiempo jugado (ticket 03)', () => {
  it('el lápiz de corrección está siempre visible en el héroe y en cada tarjeta', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01', playedSeconds: 600 },
          { status: 'playing', addedAt: '2026-07-01', playedSeconds: 3600 },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    const pencils = qsa('[data-edit-time]', root);
    expect(pencils).toHaveLength(3);
    for (const pencil of pencils) {
      expect(pencil.getAttribute('aria-label')).toBe('Corregir tiempo jugado');
    }
    expect(qs('.d-hero [data-edit-time]', root)?.getAttribute('data-edit-time')).toBe('g1-p2');
    expect(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).toBeTruthy();
    expect(qs('.play-card[data-play-card="g1-p2"] [data-edit-time]', root)).toBeTruthy();
  });

  it('pulsar el lápiz abre el campo prefilled con el valor exacto en H:MM:SS', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01', playedSeconds: 600 },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    expect(/** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root))).value).toBe(
      '0:10:00'
    );

    btn(qs('.play-card[data-play-card="g1-p2"] [data-edit-time]', root)).click();
    expect(/** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root))).value).toBe(
      '0:00:00'
    );
  });

  it('el editor es único y vive en la fila del lápiz pulsado (héroe repite la más reciente)', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.d-hero [data-edit-time]', root)).click();
    expect(qsa('[data-time-input]', root)).toHaveLength(1);
    const heroInput = need(qs('.d-hero [data-time-input]', root));

    // El otro lápiz de la MISMA jugada revela/foca el editor abierto, sin duplicarlo.
    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    expect(qsa('[data-time-input]', root)).toHaveLength(1);
    expect(qs('.d-hero [data-time-input]', root)).toBe(heroInput);
    expect(document.activeElement).toBe(heroInput);
  });

  it('«Cancelar» y Escape cierran el campo sin cambiar el doc', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [
          { status: 'finished', addedAt: '2026-03-01', playedSeconds: 600 },
          { status: 'playing', addedAt: '2026-07-01' },
        ],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input.value = '99:00:00';
    btn(qs('[data-time-cancel]', root)).click();
    expect(qs('[data-time-input]', root)).toBeNull();
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);

    // Escape igual, sobre la jugada sin campo (ausente = intacto).
    btn(qs('.play-card[data-play-card="g1-p2"] [data-edit-time]', root)).click();
    const input2 = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input2.value = '1:00:00';
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(qs('[data-time-input]', root)).toBeNull();
    expect(findPlay('g1', 'g1-p2').playedSeconds).toBeUndefined();
  });

  it('«Corregir» con H:MM:SS aplica el comando y la Ficha muestra el valor al instante', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input.value = '1:30:00';
    btn(qs('[data-time-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(5400));
    expect(qs('[data-time-input]', root)).toBeNull();
    const card = need(qs('.play-card[data-play-card="g1-p1"]', root));
    expect(need(qs('.p-time-val', card)).textContent).toContain('1 h 30 min');
  });

  it('acepta H:MM (horas:minutos) y segundos sueltos; Enter también aplica', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input.value = '1:30';
    btn(qs('[data-time-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(5400));

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input2 = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input2.value = '90';
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(90));
    expect(qs('[data-time-input]', root)).toBeNull();
  });

  it('entrada inválida muestra el aviso inline sin cerrar el campo ni perder lo tecleado', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input.value = '-5';
    btn(qs('[data-time-save]', root)).click();
    const error = need(qs('[data-time-error]', root));
    expect(error.hasAttribute('hidden')).toBe(false);
    expect(error.textContent).toContain('H:MM:SS');
    expect(error.textContent).toContain('horas:minutos');
    expect(error.textContent).toContain('segundos');
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    const kept = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    expect(kept.value).toBe('-5');

    kept.value = 'abc';
    btn(qs('[data-time-save]', root)).click();
    expect(need(qs('[data-time-error]', root)).hasAttribute('hidden')).toBe(false);
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(600);
    expect(/** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root))).value).toBe('abc');
  });

  it('con el Contador en marcha, corregir lo auto-pausa y el Aviso señala el Tramo pendiente', async () => {
    await seed(
      [
        {
          id: 'g1',
          title: 'Hades',
          plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
        },
      ],
      { gameId: 'g1', playId: 'g1-p1', startedAt: T0 }
    );
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(PAUSE_MS));
    try {
      btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
      // El editor sustituye al valor (y a su reloj vivo) de su fila; el héroe
      // sigue mostrando el reloj vivo mientras el campo está abierto.
      expect(qs('.play-card [data-live-time]', root)).toBeNull();
      expect(qs('.d-hero [data-live-time]', root)).toBeTruthy();
      const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
      input.value = '100';
      btn(qs('[data-time-save]', root)).click();
      await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(100));
    } finally {
      vi.useRealTimers();
    }
    expect(store.get().doc?.counter).toBeUndefined();
    expect(findPlay('g1', 'g1-p1').pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(qsa('[data-live-time]', root)).toHaveLength(0);
    expect(need(qs('[data-aviso-pendientes]', root)).getAttribute('data-aviso-pendientes')).toBe(
      '1'
    );
  });

  it('la corrección sobrevive a la recarga desde IndexedDB (cauce del repositorio)', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ status: 'playing', addedAt: '2026-07-01', playedSeconds: 600 }],
      },
    ]);
    const root = mount();
    createApp(root);
    openFromPanel(root, 'g1', 'playing');

    btn(qs('.play-card[data-play-card="g1-p1"] [data-edit-time]', root)).click();
    const input = /** @type {HTMLInputElement} */ (need(qs('[data-time-input]', root)));
    input.value = '1:30:00';
    btn(qs('[data-time-save]', root)).click();
    await vi.waitFor(() => expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(5400));

    // Recarga desde IndexedDB: la corrección sigue ahí.
    store.set({ doc: null, ready: false });
    await initLibrary();
    expect(findPlay('g1', 'g1-p1').playedSeconds).toBe(5400);
  });
});
