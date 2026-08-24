import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { coverHtml } from '../src/ui/cover.js';
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

/** Juego mínimo válido para sembrar en el documento.
 * @typedef {{
 *   id: string,
 *   title: string,
 *   tags?: string[],
 *   platforms?: {id: number, name: string}[],
 *   coverUrl?: string,
 *   plays: { id: string, status: string, addedAt: string, rating?: number }[],
 * }} SeedGame
 */

/**
 * Juego mínimo válido para sembrar en el documento.
 * @param {string} id
 * @param {string} title
 * @param {{ status: string, addedAt: string, rating?: number }[]} plays
 * @returns {SeedGame}
 */
function gameJson(id, title, plays) {
  return {
    id,
    title,
    plays: plays.map((p, i) => ({
      id: `${id}-p${i + 1}`,
      status: p.status,
      addedAt: p.addedAt,
      ...(p.rating != null ? { rating: p.rating } : {}),
    })),
  };
}

/**
 * Siembra la biblioteca importando un doc (misma vía que la bienvenida).
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

/**
 * Sección de balda por etiqueta española de su placa.
 * @param {Element} root
 * @param {string} label
 * @returns {Element}
 */
function shelfSection(root, label) {
  const section = qsa('.shelves .shelf', root).find(
    (s) => qs('.plate b', s)?.textContent === label,
  );
  if (!section) throw new Error(`balda no encontrada: ${label}`);
  return section;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    library: { view: 'shelves', panelStatus: null },
  });
  await initLibrary();
});

describe('estantería', () => {
  it('un juego con jugadas en varios estados aparece solo en la balda de su jugada más reciente', async () => {
    await seed([
      gameJson('g1', 'Hades', [
        { status: 'finished', addedAt: '2026-05-01', rating: 5 },
        { status: 'playing', addedAt: '2026-07-01' },
      ]),
    ]);
    const root = mount();
    createApp(root);

    const cards = qsa('.card[data-game-id="g1"]', root);
    expect(cards).toHaveLength(1);
    expect(cards[0].closest('.shelf')).toBe(shelfSection(root, 'Jugando'));
    expect(qs('[data-game-id="g1"]', shelfSection(root, 'Terminado'))).toBeNull();
  });

  it('las baldas muestran máximo 6 portadas y «+N más» con el conteo correcto', async () => {
    await seed(
      Array.from({ length: 8 }, (_, i) =>
        gameJson(`g${i + 1}`, `Título ${i + 1}`, [
          { status: 'backlog', addedAt: `2026-06-${String(i + 1).padStart(2, '0')}` },
        ]),
      ),
    );
    const root = mount();
    createApp(root);

    const backlog = shelfSection(root, 'Quiero jugar');
    expect(qsa('.card[data-game-id]', backlog)).toHaveLength(6);
    expect(qs('.card.more', backlog)?.textContent?.trim()).toBe('+2 más');
    // Las demás baldas están vacías: sin «+N más» en toda la estantería.
    expect(qsa('.card.more', root)).toHaveLength(1);
    expect(qs('.row-empty', shelfSection(root, 'Jugando'))?.textContent).toContain(
      'Sin juegos todavía',
    );
  });

  it('mismo orden recencia descendente con desempate alfabético en balda y panel', async () => {
    await seed([
      gameJson('ga', 'Alpha', [{ status: 'playing', addedAt: '2026-01-10' }]),
      gameJson('gb', 'Bravo', [{ status: 'playing', addedAt: '2026-03-02' }]),
      gameJson('gc', 'Charlie', [{ status: 'playing', addedAt: '2026-03-02' }]),
    ]);
    const root = mount();
    createApp(root);

    const playing = shelfSection(root, 'Jugando');
    const idsInShelf = qsa('.card[data-game-id]', playing).map((el) =>
      el.getAttribute('data-game-id'),
    );
    expect(idsInShelf).toEqual(['gb', 'gc', 'ga']);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    const idsInPanel = qsa('.b-row', root).map((el) => el.getAttribute('data-game-id'));
    expect(idsInPanel).toEqual(idsInShelf);
  });
});

describe('panel', () => {
  it('pulsar la placa abre el panel del estado y «← Estantería» vuelve', async () => {
    await seed([
      gameJson('g1', 'Hades', [{ status: 'playing', addedAt: '2026-07-01' }]),
      gameJson('g2', 'Celeste', [{ status: 'finished', addedAt: '2026-05-02', rating: 5 }]),
    ]);
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    expect(store.get().library.view).toBe('panel');
    expect(store.get().library.panelStatus).toBe('playing');
    expect(qs('.toolbar strong', root)?.textContent).toBe('Jugando');
    expect(qs('[data-back-shelves]', root)?.textContent?.trim()).toBe('← Estantería');
    expect(qsa('.b-row', root)).toHaveLength(1);
    expect(qs('.b-title', root)?.textContent).toBe('Hades');

    btn(qs('[data-back-shelves]', root)).click();
    expect(store.get().library.view).toBe('shelves');
    expect(store.get().library.panelStatus).toBeNull();
    expect(qs('.shelves', root)).toBeTruthy();
    expect(qs('.b-row', root)).toBeNull();
  });

  it('la tarjeta «+N más» abre el panel con todos los juegos del estado', async () => {
    await seed(
      Array.from({ length: 8 }, (_, i) =>
        gameJson(`g${i + 1}`, `Título ${i + 1}`, [
          { status: 'backlog', addedAt: `2026-06-${String(i + 1).padStart(2, '0')}` },
        ]),
      ),
    );
    const root = mount();
    createApp(root);

    btn(qs('.card.more[data-open-panel="backlog"]', root)).click();
    expect(store.get().library.panelStatus).toBe('backlog');
    expect(qsa('.b-row', root)).toHaveLength(8);
    expect(qs('.pill.st-backlog', root)).toBeTruthy();
  });

  it('el panel lista filas densas con etiquetas propias y plataformas', async () => {
    await seed([
      {
        id: 'g1',
        title: 'Hades',
        tags: ['viciante'],
        platforms: [
          { id: 6, name: 'PC (Microsoft Windows)' },
          { id: 130, name: 'Nintendo Switch' },
        ],
        plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-07-01' }],
      },
    ]);
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    const row = need(qs('.b-row', root));
    expect(qs('.cover.mini', row)).toBeTruthy();
    expect(qs('.tag-mini.own', row)?.textContent).toBe('#viciante');
    expect(qs('.b-col-pf', row)?.textContent).toBe('PC (Microsoft Windows), Nintendo Switch');
    expect(qs('.pill', row)?.textContent).toBe('Jugando');
    expect(qs('.stars.muted', row)?.textContent).toBe('—');
  });

  it('pagina en bloques de 100 con «Cargar más» hasta agotar el estado', async () => {
    await seed(
      Array.from({ length: 150 }, (_, i) => {
        const n = String(i + 1).padStart(3, '0');
        return gameJson(`g${n}`, `Juego ${n}`, [{ status: 'finished', addedAt: '2026-04-15' }]);
      }),
    );
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="finished"]', root)).click();
    let rows = qsa('.b-row', root);
    expect(rows).toHaveLength(100);
    expect(qs('.b-title', rows[0])?.textContent).toBe('Juego 001');
    expect(qs('[data-load-more]', root)?.textContent?.trim()).toBe('Cargar más');

    btn(qs('[data-load-more]', root)).click();
    rows = qsa('.b-row', root);
    expect(rows).toHaveLength(150);
    expect(qs('.b-title', rows[rows.length - 1])?.textContent).toBe('Juego 150');
    expect(qs('[data-load-more]', root)).toBeNull();
  });

  it('reabrir el panel reinicia la paginación a los primeros 100', async () => {
    await seed([
      ...Array.from({ length: 120 }, (_, i) => {
        const n = String(i + 1).padStart(3, '0');
        return gameJson(`ga${n}`, `Alfa ${n}`, [{ status: 'finished', addedAt: '2026-04-15' }]);
      }),
      gameJson('gz1', 'Zeta', [{ status: 'playing', addedAt: '2026-07-01' }]),
    ]);
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="finished"]', root)).click();
    btn(qs('[data-load-more]', root)).click();
    expect(qsa('.b-row', root)).toHaveLength(120);

    btn(qs('[data-back-shelves]', root)).click();
    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    expect(qsa('.b-row', root)).toHaveLength(1);

    btn(qs('[data-back-shelves]', root)).click();
    btn(qs('.plate[data-open-panel="finished"]', root)).click();
    expect(qsa('.b-row', root)).toHaveLength(100);
    expect(qs('[data-load-more]', root)).toBeTruthy();
  });

  it('volver a Biblioteca desde otra pestaña repone la estantería', async () => {
    await seed([gameJson('g1', 'Hades', [{ status: 'playing', addedAt: '2026-07-01' }])]);
    const root = mount();
    createApp(root);

    btn(qs('.plate[data-open-panel="playing"]', root)).click();
    expect(store.get().library.view).toBe('panel');

    btn(qs('[data-tab="novedades"]', root)).click();
    btn(qs('[data-tab="biblioteca"]', root)).click();

    expect(store.get().tab).toBe('biblioteca');
    expect(store.get().library.view).toBe('shelves');
    expect(qs('.shelves', root)).toBeTruthy();
    expect(qs('.b-row', root)).toBeNull();
  });
});

describe('coverHtml', () => {
  it('con coverUrl pinta una imagen lazy; sin ella, placeholder con iniciales estables', () => {
    const withCover = coverHtml({
      id: 'x1',
      title: 'Hades',
      coverUrl: 'https://images.example/t_cover_big/abc.jpg',
      plays: [],
    });
    expect(withCover).toContain('<img loading="lazy" src="https://images.example/t_cover_big/abc.jpg"');

    const a = coverHtml({ id: 'x1', title: 'Final Fantasy Tactics', plays: [] });
    const b = coverHtml({ id: 'x1', title: 'Final Fantasy Tactics', plays: [] });
    expect(a).toContain('<b>FF</b>');
    expect(a).toBe(b);
    expect(a).toMatch(/--c1:hsl\(\d+ 46% 40%\)/);

    const other = coverHtml({ id: 'x2', title: 'Celeste', plays: [] });
    expect(other).not.toBe(a);
  });

  it('la variante mini añade la clase mini', () => {
    const mini = coverHtml({ id: 'x1', title: 'Hades', plays: [] }, { mini: true });
    expect(mini).toContain('cover mini');
  });
});
