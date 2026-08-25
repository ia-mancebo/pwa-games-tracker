import { describe, expect, it } from 'vitest';
import {
  searchQuery,
  recentQuery,
  upcomingQuery,
  popularityTypesQuery,
  popularQuery,
  hypedQuery,
  idsQuery,
  toGame,
  dedupeById,
} from '../worker/lib.js';

const TODAY = '2026-08-24';
const TODAY_EPOCH = Date.UTC(2026, 7, 24) / 1000;

/**
 * @param {Parameters<typeof toGame>[0]} row
 */
function mapOrThrow(row) {
  const game = toGame(row);
  if (!game) throw new Error('toGame devolvió null inesperadamente');
  return game;
}

const igdbGame = {
  id: 1877,
  name: 'Celeste',
  first_release_date: 1437004800,
  summary: 'A platformer about climbing a mountain.',
  cover: { id: 44444, image_id: 'co1nij' },
  genres: [
    { id: 8, name: 'Platform' },
    { id: 32, name: 'Indie' },
  ],
  platforms: [
    { id: 130, name: 'Nintendo Switch' },
    { id: 6, name: 'PC (Microsoft Windows)' },
  ],
  screenshots: [
    { id: 1, image_id: 'sc1' },
    { id: 2, image_id: 'sc2' },
  ],
};

describe('searchQuery', () => {
  it('construye la query apicalypse completa', () => {
    const query = searchQuery('celeste');
    expect(query).toContain('search "celeste";');
    expect(query).toContain(
      'fields name,first_release_date,genres.name,platforms.name,cover.image_id,summary,screenshots.image_id;',
    );
    expect(query).toContain('where version_parent = null;');
    expect(query).toContain('limit 12;');
  });

  it('escapa comillas dobles del término de búsqueda', () => {
    expect(searchQuery('neon "white"')).toContain('search "neon \\"white\\"";');
  });

  it('recorta espacios sobrantes', () => {
    expect(searchQuery('  halo  ')).toContain('search "halo";');
  });
});

describe('recentQuery / upcomingQuery', () => {
  it('recientes: fecha <= hoy en epoch, orden descendente', () => {
    const query = recentQuery(TODAY);
    expect(query).toContain(`where game.version_parent = null & date <= ${TODAY_EPOCH};`);
    expect(query).toContain('sort date desc;');
    expect(query).toContain('limit 40;');
    expect(query).toContain('game.cover.image_id');
  });

  it('próximos: fecha > hoy en epoch, orden ascendente', () => {
    const query = upcomingQuery(TODAY);
    expect(query).toContain(`where game.version_parent = null & date > ${TODAY_EPOCH};`);
    expect(query).toContain('sort date asc;');
  });

  it('usa medianoche UTC del día indicado como epoch', () => {
    const query = recentQuery('2000-01-01');
    expect(query).toContain('& date <= 946684800;');
  });
});

describe('popularity queries', () => {
  it('popularityTypesQuery pide id y nombre', () => {
    expect(popularityTypesQuery()).toBe('fields id,name;\nlimit 50;');
  });

  it('popularQuery filtra por el tipo resuelto y ordena por valor', () => {
    const query = popularQuery(3);
    expect(query).toContain('fields game_id,value;');
    expect(query).toContain('where popularity_type = 3;');
    expect(query).toContain('sort value desc;');
    expect(query).toContain('limit 12;');
  });

  it('hypedQuery tiene la misma forma con su propio typeId', () => {
    const query = hypedQuery(9);
    expect(query).toContain('where popularity_type = 9;');
    expect(query).toContain('sort value desc;');
    expect(query).toContain('limit 12;');
  });

  it('idsQuery deduplica los game_ids a resolver', () => {
    const query = idsQuery([10, 20, 10]);
    expect(query).toContain('where id = (10,20);');
    expect(query).toContain('limit 2;');
  });
});

describe('toGame', () => {
  it('mapea una fila de IGDB al Game del contrato', () => {
    expect(mapOrThrow(igdbGame)).toEqual({
      igdbId: 1877,
      title: 'Celeste',
      releaseDate: '2015-07-16',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1nij.jpg',
      description: 'A platformer about climbing a mountain.',
      genres: [
        { id: 8, name: 'Platform' },
        { id: 32, name: 'Indie' },
      ],
      platforms: [
        { id: 130, name: 'Nintendo Switch' },
        { id: 6, name: 'PC (Microsoft Windows)' },
      ],
      screenshots: [
        'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg',
        'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc2.jpg',
      ],
    });
  });

  it('mapea la fila anidada de release_dates prefiriendo la fecha del lanzamiento', () => {
    const row = { id: 99, date: 1735689600, game: { ...igdbGame, first_release_date: 1437004800 } };
    const game = mapOrThrow(row);
    expect(game.releaseDate).toBe('2025-01-01');
    expect(game.igdbId).toBe(1877);
    expect(game.title).toBe('Celeste');
  });

  it('devuelve coverUrl y releaseDate null cuando faltan', () => {
    const game = mapOrThrow({ id: 1, name: 'Juego', cover: null, summary: null, genres: null });
    expect(game.coverUrl).toBeNull();
    expect(game.releaseDate).toBeNull();
    expect(game.description).toBe('');
    expect(game.genres).toEqual([]);
    expect(game.platforms).toEqual([]);
    expect(game.screenshots).toEqual([]);
  });

  it('screenshots: máximo 5 URLs y vacío si no vienen', () => {
    const many = mapOrThrow({
      id: 2,
      name: 'X',
      screenshots: Array.from({ length: 8 }, (_, i) => ({ image_id: `sc${i}` })),
    });
    expect(many.screenshots).toHaveLength(5);
    expect(many.screenshots[0]).toBe('https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc0.jpg');
    const none = mapOrThrow({ id: 3, name: 'Y' });
    expect(none.screenshots).toEqual([]);
  });

  it('trunca descripciones largas a ~600 caracteres con elipsis', () => {
    const longSummary = `${'palabra '.repeat(120)}fin`;
    const game = mapOrThrow({ id: 1, name: 'X', summary: longSummary });
    expect(game.description.length).toBeLessThanOrEqual(601);
    expect(game.description.endsWith('…')).toBe(true);
    expect(game.description.startsWith('palabra')).toBe(true);
  });

  it('devuelve null si la fila no tiene juego ni id', () => {
    expect(toGame(null)).toBeNull();
    expect(toGame({})).toBeNull();
    expect(toGame({ date: 123 })).toBeNull();
  });
});

describe('dedupeById', () => {
  it('conserva la primera aparición de cada id', () => {
    const items = [{ id: 1, tag: 'a' }, { id: 2, tag: 'b' }, { id: 1, tag: 'c' }];
    expect(dedupeById(items)).toEqual([{ id: 1, tag: 'a' }, { id: 2, tag: 'b' }]);
  });

  it('acepta una función de clave alternativa (igdbId)', () => {
    const games = [{ igdbId: 5 }, { igdbId: 6 }, { igdbId: 5 }];
    expect(dedupeById(games, (g) => g.igdbId)).toEqual([{ igdbId: 5 }, { igdbId: 6 }]);
  });
});
