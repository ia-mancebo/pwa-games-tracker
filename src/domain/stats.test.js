import { describe, expect, it } from 'vitest';
import { computeStats, filterOptions } from './stats.js';
import { chipsForDoc } from './selectors.js';

/**
 * Juego de prueba con jugada mínima.
 * @param {Partial<import('./schema.js').Game>} [overrides]
 * @returns {import('./schema.js').Game}
 */
function game(overrides = {}) {
  return {
    id: 'g1',
    title: 'Hades',
    plays: [{ id: 'p1', status: 'playing', addedAt: '2026-01-01' }],
    ...overrides,
  };
}

/**
 * Documento de prueba.
 * @param {import('./schema.js').Game[]} games
 * @returns {import('./schema.js').Doc}
 */
function doc(games) {
  return { schema: 'game-tracker', version: 1, updatedAt: '2026-08-24T00:00:00Z', games };
}

/** Sin filtros. */
const NONE = { platform: null, genre: null, tag: null };

/** Ancla fija de la ventana de 12 meses: agosto 2026. */
const NOW = new Date('2026-08-15T12:00:00Z');

describe('computeStats · recuentos por Estado del juego', () => {
  it('un juego cuenta una vez según su jugada más reciente (por addedAt)', () => {
    const d = doc([
      game({
        id: 'a',
        plays: [
          { id: 'p1', status: 'finished', addedAt: '2026-02-01' },
          { id: 'p2', status: 'playing', addedAt: '2026-07-01' },
        ],
      }),
      game({ id: 'b', title: 'Celeste', plays: [{ id: 'p3', status: 'backlog', addedAt: '2026-03-01' }] }),
      game({ id: 'c', title: 'Gris', plays: [{ id: 'p4', status: 'abandoned', addedAt: '2026-04-01' }] }),
    ]);
    expect(computeStats(d, NONE, NOW).counts).toEqual({
      backlog: 1,
      playing: 1,
      finished: 0,
      abandoned: 1,
    });
  });

  it('total y media ★ sobre las jugadas valoradas de los juegos filtrados', () => {
    const d = doc([
      game({
        id: 'a',
        plays: [
          { id: 'p1', status: 'finished', addedAt: '2026-02-01', rating: 5 },
          { id: 'p2', status: 'playing', addedAt: '2026-07-01', rating: 3 },
        ],
      }),
      game({ id: 'b', title: 'Celeste', plays: [{ id: 'p3', status: 'backlog', addedAt: '2026-03-01' }] }),
    ]);
    const s = computeStats(d, NONE, NOW);
    expect(s.total).toBe(2);
    expect(s.avgRating).toBe(4);
  });

  it('media ★ null cuando ningún juego filtrado tiene valoraciones', () => {
    const d = doc([game({})]);
    expect(computeStats(d, NONE, NOW).avgRating).toBeNull();
  });
});

describe('computeStats · distribuciones', () => {
  it('byPlatform cuenta un juego en cada plataforma del catálogo que tiene', () => {
    const d = doc([
      game({
        id: 'a',
        platforms: [
          { id: 130, name: 'Nintendo Switch' },
          { id: 6, name: 'PC (Microsoft Windows)' },
        ],
        plays: [
          { id: 'p1', status: 'playing', addedAt: '2026-01-01' },
          { id: 'p2', status: 'backlog', addedAt: '2026-02-01', platform: { id: null, name: 'Emulador' } },
        ],
      }),
      game({
        id: 'b',
        title: 'Celeste',
        platforms: [{ id: 130, name: 'Nintendo Switch' }],
        plays: [{ id: 'p3', status: 'backlog', addedAt: '2026-03-01' }],
      }),
    ]);
    expect(computeStats(d, NONE, NOW).byPlatform).toEqual([
      { name: 'Nintendo Switch', count: 2 },
      { name: 'PC (Microsoft Windows)', count: 1 },
    ]);
  });

  it('byGenre cuenta un juego en cada género que tiene', () => {
    const d = doc([
      game({
        id: 'a',
        genres: [
          { id: 1, name: 'Acción' },
          { id: 2, name: 'RPG' },
        ],
      }),
      game({ id: 'b', title: 'Celeste', genres: [{ id: 2, name: 'RPG' }] }),
    ]);
    expect(computeStats(d, NONE, NOW).byGenre).toEqual([
      { name: 'RPG', count: 2 },
      { name: 'Acción', count: 1 },
    ]);
  });

  it('byTag cuenta un juego en cada etiqueta propia que tiene', () => {
    const d = doc([
      game({ id: 'a', tags: ['difícil', 'indie'] }),
      game({ id: 'b', title: 'Celeste', tags: ['indie'] }),
    ]);
    expect(computeStats(d, NONE, NOW).byTag).toEqual([
      { name: 'indie', count: 2 },
      { name: 'difícil', count: 1 },
    ]);
  });

  it('distribuciones ordenadas desc por conteo con desempate alfabético es', () => {
    /**
     * @param {string} id
     * @param {string} title
     * @param {string[]} names
     */
    const mk = (id, title, names) =>
      game({ id, title, platforms: names.map((name, i) => ({ id: i + 1, name })) });
    const d = doc([
      mk('a', 'A', ['Switch']),
      mk('b', 'B', ['Switch']),
      mk('c', 'C', ['PC']),
      mk('d', 'D', ['PC']),
    ]);
    expect(computeStats(d, NONE, NOW).byPlatform).toEqual([
      { name: 'PC', count: 2 },
      { name: 'Switch', count: 2 },
    ]);
  });
});

describe('computeStats · terminados en el tiempo', () => {
  it('ventana de 12 meses incluido el actual, más antiguo primero, con cero-relleno', () => {
    const d = doc([
      game({
        id: 'a',
        plays: [{ id: 'p1', status: 'finished', addedAt: '2026-07-01', finishedAt: '2026-08-10' }],
      }),
    ]);
    const months = computeStats(d, NONE, NOW).finishedByMonth;
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ key: '2025-09', count: 0 });
    expect(months.at(-1)).toMatchObject({ key: '2026-08', count: 1 });
  });

  it('etiquetas cortas en español tipo «ago 25»', () => {
    const d = doc([]);
    const months = computeStats(d, NONE, NOW).finishedByMonth;
    expect(months[0].label).toBe('sep 25');
    expect(months[11].label).toBe('ago 26');
  });

  it('cuenta jugadas con finishedAt dentro de la ventana e ignora las de fuera', () => {
    const d = doc([
      game({
        id: 'a',
        plays: [
          { id: 'p1', status: 'finished', addedAt: '2026-03-01', finishedAt: '2026-03-10' },
          { id: 'p2', status: 'finished', addedAt: '2026-03-02', finishedAt: '2026-03-20' },
          { id: 'p3', status: 'finished', addedAt: '2024-01-01', finishedAt: '2024-01-05' },
          { id: 'p4', status: 'playing', addedAt: '2026-03-03' },
        ],
      }),
    ]);
    const months = computeStats(d, NONE, NOW).finishedByMonth;
    expect(months.find((m) => m.key === '2026-03')?.count).toBe(2);
    expect(months.find((m) => m.key === '2024-01')).toBeUndefined();
    expect(months.reduce((sum, m) => sum + m.count, 0)).toBe(2);
  });
});

describe('computeStats · top 5', () => {
  it('orden por media desc con desempate alfabético', () => {
    const d = doc([
      game({ id: 'a', title: 'Zelda', plays: [{ id: 'p1', status: 'finished', addedAt: '2026-01-01', rating: 4 }] }),
      game({ id: 'b', title: 'Braid', plays: [{ id: 'p1', status: 'finished', addedAt: '2026-01-01', rating: 5 }] }),
      game({ id: 'c', title: 'Apex', plays: [{ id: 'p1', status: 'finished', addedAt: '2026-01-01', rating: 5 }] }),
    ]);
    const top = computeStats(d, NONE, NOW).top5;
    expect(top.map((t) => t.game.title)).toEqual(['Apex', 'Braid', 'Zelda']);
    expect(top.map((t) => t.rating)).toEqual([5, 5, 4]);
  });

  it('solo juegos valorados y máximo cinco', () => {
    const rated = Array.from({ length: 7 }, (_, i) =>
      game({
        id: `r${i}`,
        title: `Rated ${i}`,
        plays: [{ id: 'p1', status: 'finished', addedAt: '2026-01-01', rating: ((i % 5) + 1) }],
      }),
    );
    const unrated = game({ id: 'x', title: 'Sin nota', plays: [{ id: 'p1', status: 'backlog', addedAt: '2026-01-01' }] });
    const top = computeStats(doc([...rated, unrated]), NONE, NOW).top5;
    expect(top).toHaveLength(5);
    expect(top.map((t) => t.rating)).toEqual([5, 4, 3, 2, 2]);
  });

  it('la media del juego para el ranking es la de sus jugadas valoradas', () => {
    const d = doc([
      game({
        id: 'a',
        plays: [
          { id: 'p1', status: 'finished', addedAt: '2026-01-01', rating: 2 },
          { id: 'p2', status: 'playing', addedAt: '2026-02-01', rating: 4 },
          { id: 'p3', status: 'backlog', addedAt: '2026-03-01' },
        ],
      }),
    ]);
    expect(computeStats(d, NONE, NOW).top5).toEqual([{ game: d.games[0], rating: 3 }]);
  });
});

describe('computeStats · filtros', () => {
  const d = doc([
    game({
      id: 'a',
      genres: [{ id: 1, name: 'RPG' }],
      platforms: [{ id: 130, name: 'Switch' }],
      tags: ['indie'],
      plays: [{ id: 'p1', status: 'playing', addedAt: '2026-01-01', rating: 4 }],
    }),
    game({
      id: 'b',
      title: 'Celeste',
      genres: [{ id: 2, name: 'Plataformas' }],
      platforms: [{ id: 6, name: 'PC' }],
      tags: ['indie'],
      plays: [{ id: 'p2', status: 'backlog', addedAt: '2026-02-01' }],
    }),
  ]);

  it('las dimensiones se acumulan con Y lógico', () => {
    expect(computeStats(d, { platform: 'Switch', genre: null, tag: null }, NOW).total).toBe(1);
    expect(computeStats(d, { platform: 'Switch', genre: 'RPG', tag: null }, NOW).total).toBe(1);
    expect(computeStats(d, { platform: null, genre: null, tag: 'indie' }, NOW).total).toBe(2);
    expect(computeStats(d, { platform: 'Switch', genre: 'Plataformas', tag: null }, NOW).total).toBe(0);
  });

  it('un valor desconocido deja todo a cero y vacío', () => {
    const s = computeStats(d, { platform: 'Dreamcast', genre: null, tag: null }, NOW);
    expect(s.total).toBe(0);
    expect(s.counts).toEqual({ backlog: 0, playing: 0, finished: 0, abandoned: 0 });
    expect(s.byPlatform).toEqual([]);
    expect(s.byGenre).toEqual([]);
    expect(s.byTag).toEqual([]);
    expect(s.top5).toEqual([]);
    expect(s.avgRating).toBeNull();
  });

  it('los terminados por mes respetan también los filtros', () => {
    const f = { platform: 'Switch', genre: null, tag: null };
    const months = computeStats(d, f, NOW).finishedByMonth;
    expect(months.reduce((sum, m) => sum + m.count, 0)).toBe(0);
  });
});

describe('filterOptions', () => {
  it('devuelve las tres filas de chips del documento', () => {
    const d = doc([
      game({
        id: 'a',
        genres: [{ id: 1, name: 'RPG' }],
        platforms: [{ id: 130, name: 'Switch' }],
        tags: ['indie'],
      }),
    ]);
    expect(filterOptions(d)).toEqual(chipsForDoc(d));
  });
});
