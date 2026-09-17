import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  searchQuery,
  nameContainsQuery,
  rankGames,
  recentQuery,
  upcomingQuery,
  popularityTypesQuery,
  resolvePopularityTypeId,
  popularQuery,
  hypedQuery,
  idsQuery,
  toGame,
  dedupeById,
} from '../worker/lib.js';
import worker from '../worker/worker.js';

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
      'fields name,first_release_date,genres.name,platforms.name,cover.image_id,summary,screenshots.image_id;'
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

describe('nameContainsQuery', () => {
  it('construye la query de respaldo con filtro de versiones y límite de búsqueda', () => {
    const query = nameContainsQuery('until then');
    expect(query).toContain(
      'fields name,first_release_date,genres.name,platforms.name,cover.image_id,summary,screenshots.image_id;'
    );
    expect(query).toContain('where version_parent = null & name ~ *"until then"*;');
    expect(query).toContain('limit 12;');
  });

  it('escapa comillas dobles y barras invertidas igual que searchQuery', () => {
    expect(nameContainsQuery('neon "white"')).toContain('name ~ *"neon \\"white\\""*;');
    expect(nameContainsQuery('back\\slash')).toContain('name ~ *"back\\\\slash"*;');
  });

  it('neutraliza los comodines * del input para que no alteren el patrón', () => {
    expect(nameContainsQuery('until *then*')).toContain('name ~ *"until \\*then\\*"*;');
  });

  it('recorta espacios y devuelve null si la consulta queda vacía', () => {
    expect(nameContainsQuery('  halo  ')).toContain('name ~ *"halo"*;');
    expect(nameContainsQuery('   ')).toBeNull();
    expect(nameContainsQuery('')).toBeNull();
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

describe('resolvePopularityTypeId', () => {
  const types = [
    { id: 1, name: 'Visits' },
    { id: 2, name: 'Want to Play' },
    { id: 10, name: 'Most Wishlisted Upcoming' },
  ];

  it('resuelve por nombre exacto histórico (IGDB Visits)', () => {
    const want = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
    expect(resolvePopularityTypeId([{ id: 1, name: 'IGDB Visits' }], want)).toBe(1);
  });

  it('resuelve el nombre actual de la API (Visits sin prefijo)', () => {
    const want = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
    expect(resolvePopularityTypeId(types, want)).toBe(1);
  });

  it('resuelve «Most Wishlisted Upcoming» y acepta variantes', () => {
    const want = { names: ['Most Wishlisted Upcoming', 'Most Wishlisted'], keyword: 'wishlisted' };
    expect(resolvePopularityTypeId(types, want)).toBe(10);
    expect(resolvePopularityTypeId([{ id: 9, name: 'Most Wishlisted' }], want)).toBe(9);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    const want = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
    expect(resolvePopularityTypeId([{ id: 4, name: '  visits ' }], want)).toBe(4);
  });

  it('cae a la palabra clave si ningún candidato exacto encaja', () => {
    const want = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
    expect(resolvePopularityTypeId([{ id: 7, name: 'Steam Visits' }], want)).toBe(7);
  });

  it('devuelve null si no hay nada parecido', () => {
    const want = { names: ['IGDB Visits', 'Visits'], keyword: 'visits' };
    expect(resolvePopularityTypeId([{ id: 2, name: 'Want to Play' }], want)).toBeNull();
    expect(resolvePopularityTypeId([], want)).toBeNull();
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
    expect(many.screenshots[0]).toBe(
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc0.jpg'
    );
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
    const items = [
      { id: 1, tag: 'a' },
      { id: 2, tag: 'b' },
      { id: 1, tag: 'c' },
    ];
    expect(dedupeById(items)).toEqual([
      { id: 1, tag: 'a' },
      { id: 2, tag: 'b' },
    ]);
  });

  it('acepta una función de clave alternativa (igdbId)', () => {
    const games = [{ igdbId: 5 }, { igdbId: 6 }, { igdbId: 5 }];
    expect(dedupeById(games, (g) => g.igdbId)).toEqual([{ igdbId: 5 }, { igdbId: 6 }]);
  });
});

describe('rankGames', () => {
  const games = [
    { igdbId: 3, title: 'Until Then: Afterimages' },
    { igdbId: 2, title: 'Until Then' },
    { igdbId: 1, title: 'The Road to Until Then' },
    { igdbId: 4, title: 'UNTÍL THEN' },
  ];

  it('ordena exacto, luego prefijo, luego contiene y desempata por igdbId', () => {
    expect(rankGames(games, 'until then').map((g) => g.igdbId)).toEqual([2, 4, 3, 1]);
  });

  it('sin coincidencia textual conserva el orden y no muta la entrada', () => {
    const ordered = rankGames(games, '   ');
    expect(ordered.map((g) => g.igdbId)).toEqual([3, 2, 1, 4]);
    expect(ordered).not.toBe(games);
  });
});

const APP_ORIGIN = 'https://app.example';
const WORKER_ENV = {
  ALLOWED_ORIGINS: APP_ORIGIN,
  CLIENT_ID: 'test-client',
  CLIENT_SECRET: 'test-secret',
};

/**
 * @param {string} url
 * @returns {{ url: string, method: string, headers: { get(name: string): string | null } }}
 */
function workerRequest(url) {
  return {
    url,
    method: 'GET',
    headers: { get: (name) => (name.toLowerCase() === 'origin' ? APP_ORIGIN : null) },
  };
}

/**
 * @param {unknown} body
 * @param {number} [status]
 * @returns {Response}
 */
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stub de fetch del Worker: responde el token de Twitch y delega en `onGames`
 * cada llamada a `games`, registrando su cuerpo Apicalypse.
 * @param {(body: string, call: number) => Response} onGames
 */
function stubWorkerFetch(onGames) {
  /** @type {string[]} */
  const gamesBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const target = String(url);
      if (target.includes('id.twitch.tv')) {
        return jsonRes({ access_token: 'token-de-prueba', expires_in: 3600 });
      }
      if (target.includes('/v4/games')) {
        const body = String(init.body ?? '');
        gamesBodies.push(body);
        return onGames(body, gamesBodies.length);
      }
      return jsonRes({}, 404);
    })
  );
  return { gamesBodies };
}

describe('handleSearch con respaldo por nombre (stopwords de IGDB)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('si el search full-text devuelve 0 filas, reintenta por nombre y rankea el resultado', async () => {
    const { gamesBodies } = stubWorkerFetch((body) =>
      body.includes('name ~')
        ? jsonRes([
            { id: 407104, name: 'Until Then: Deluxe Edition' },
            { id: 134165, name: 'Until Then' },
          ])
        : jsonRes([])
    );

    const res = await worker.fetch(
      workerRequest('https://proxy.dev/api/search?q=until%20then'),
      WORKER_ENV
    );
    expect(res.status).toBe(200);
    const body = /** @type {{ results: { igdbId: number, title: string }[] }} */ (await res.json());
    expect(body.results.map((game) => game.igdbId)).toEqual([134165, 407104]);
    expect(gamesBodies).toHaveLength(2);
    expect(gamesBodies[0]).toContain('search "until then";');
    expect(gamesBodies[1]).toContain('where version_parent = null & name ~ *"until then"*;');
  });

  it('si el search devuelve filas, no hay llamada extra al respaldo', async () => {
    const { gamesBodies } = stubWorkerFetch(() =>
      jsonRes([{ id: 1877, name: 'Celeste', first_release_date: 1437004800 }])
    );

    const res = await worker.fetch(
      workerRequest('https://proxy.dev/api/search?q=celeste'),
      WORKER_ENV
    );
    expect(res.status).toBe(200);
    const body = /** @type {{ results: { igdbId: number, title: string }[] }} */ (await res.json());
    expect(body.results.map((game) => game.title)).toEqual(['Celeste']);
    expect(gamesBodies).toHaveLength(1);
    expect(gamesBodies[0]).not.toContain('name ~');
  });

  it('sin q no llama a IGDB: 400 y tampoco se genera respaldo', async () => {
    const { gamesBodies } = stubWorkerFetch(() => jsonRes([]));
    const res = await worker.fetch(workerRequest('https://proxy.dev/api/search?q='), WORKER_ENV);
    expect(res.status).toBe(400);
    expect(gamesBodies).toHaveLength(0);
  });

  it('si el respaldo falla, responde 502 como cualquier fallo de IGDB', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubWorkerFetch((body) =>
      body.includes('name ~') ? jsonRes({ error: 'boom' }, 500) : jsonRes([])
    );

    const res = await worker.fetch(
      workerRequest('https://proxy.dev/api/search?q=until%20then'),
      WORKER_ENV
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'No se pudo contactar con IGDB.' });
    spy.mockRestore();
  });
});
