import { describe, it, expect } from 'vitest';
import { createGame, createPlay } from './schema.js';
import {
  latestPlay,
  gameStatus,
  sortGamesByRecency,
  gameRating,
  avgRatingOfGames,
  shelfData,
  allTags,
  allGenres,
  allPlatforms,
  SHELF_ORDER,
  round1,
} from './selectors.js';

const TODAY = '2026-08-24';

/**
 * Juego de prueba con jugadas sueltas.
 * @param {string} title
 * @param {Array<{status?: string, addedAt?: string, rating?: number}>} plays
 * @returns {any}
 */
function game(title, plays) {
  return {
    id: title.toLowerCase(),
    title,
    plays: plays.map((p, i) => ({
      id: `${title}-p${i}`,
      status: p.status ?? 'backlog',
      addedAt: p.addedAt,
      ...(p.rating != null ? { rating: p.rating } : {}),
    })),
  };
}

describe('latestPlay / gameStatus', () => {
  it('elige la jugada con addedAt más reciente', () => {
    const g = game('X', [
      { status: 'finished', addedAt: '2026-01-01' },
      { status: 'playing', addedAt: '2026-03-01' },
      { status: 'backlog', addedAt: '2026-02-01' },
    ]);
    expect(gameStatus(g)).toBe('playing');
    expect(latestPlay(g).addedAt).toBe('2026-03-01');
  });

  it('en empate de addedAt gana la última posición del array', () => {
    const g = game('Y', [
      { status: 'finished', addedAt: '2026-01-01' },
      { status: 'abandoned', addedAt: '2026-01-01' },
    ]);
    expect(gameStatus(g)).toBe('abandoned');
  });

  it('juego con una sola jugada', () => {
    const g = createGame({ title: 'Solo', today: TODAY, status: 'playing' });
    expect(gameStatus(g)).toBe('playing');
  });
});

describe('sortGamesByRecency', () => {
  it('ordena por recencia descendente y desempata alfabético', () => {
    const list = [
      game('Beta', [{ addedAt: '2026-01-01' }]),
      game('Alfa', [{ addedAt: '2026-05-01' }]),
      game('Zulu', [{ addedAt: '2026-01-01' }]),
    ];
    const sorted = sortGamesByRecency(list);
    expect(sorted.map((g) => g.title)).toEqual(['Alfa', 'Beta', 'Zulu']);
  });

  it('usa la jugada más reciente, no la primera', () => {
    const list = [
      game('Viejo', [{ addedAt: '2026-01-01' }, { addedAt: '2026-02-01' }]),
      game('Nuevo', [{ addedAt: '2026-01-15' }]),
    ];
    expect(sortGamesByRecency(list).map((g) => g.title)).toEqual(['Viejo', 'Nuevo']);
  });

  it('no muta el array original', () => {
    const list = [game('B', [{ addedAt: '2026-01-01' }]), game('A', [{ addedAt: '2026-02-01' }])];
    sortGamesByRecency(list);
    expect(list.map((g) => g.title)).toEqual(['B', 'A']);
  });
});

describe('ratings', () => {
  it('gameRating promedia jugadas valoradas; null si ninguna', () => {
    expect(gameRating(game('A', [{ rating: 4, addedAt: TODAY }, { rating: 5, addedAt: TODAY }]))).toBe(4.5);
    expect(gameRating(game('B', [{ addedAt: TODAY }]))).toBeNull();
    expect(gameRating(game('C', [{ rating: 3, addedAt: TODAY }, { addedAt: TODAY }]))).toBe(3);
  });

  it('round1 a un decimal', () => {
    expect(round1(4.26)).toBe(4.3);
    expect(round1(4)).toBe(4);
  });

  it('avgRatingOfGames sobre todas las jugadas valoradas', () => {
    const games = [
      game('A', [{ rating: 5, addedAt: TODAY }]),
      game('B', [{ rating: 2, addedAt: TODAY }, { rating: 4, addedAt: TODAY }]),
    ];
    expect(avgRatingOfGames(games)).toBe(3.7);
    expect(avgRatingOfGames([game('C', [{ addedAt: TODAY }])])).toBeNull();
  });
});

describe('shelfData', () => {
  it('agrupa por Estado del juego con conteo y media', () => {
    const doc = {
      schema: /** @type {'game-tracker'} */ ('game-tracker'),
      version: /** @type {1} */ (1),
      updatedAt: '2026-08-24T00:00:00Z',
      games: [
        game('Terminado1', [{ status: 'finished', addedAt: '2026-01-01', rating: 4 }]),
        game('Jugando1', [{ status: 'finished', addedAt: '2026-01-01' }, { status: 'playing', addedAt: '2026-05-01', rating: 5 }]),
        game('Quiero1', [{ status: 'backlog', addedAt: '2026-02-01' }]),
        game('Abandonado1', [{ status: 'abandoned', addedAt: '2026-03-01', rating: 2 }]),
      ],
    };
    const shelves = shelfData(doc);
    expect(shelves.map((s) => s.status)).toEqual(SHELF_ORDER);
    const playing = shelves.find((s) => s.status === 'playing');
    expect(playing?.games.map((g) => g.title)).toEqual(['Jugando1']);
    expect(playing?.count).toBe(1);
    expect(playing?.avgRating).toBe(5);
    const finished = shelves.find((s) => s.status === 'finished');
    expect(finished?.count).toBe(1);
    const empty = shelves.find((s) => s.status === 'backlog');
    expect(empty?.count).toBe(1);
    const abandoned = shelves.find((s) => s.status === 'abandoned');
    expect(abandoned?.avgRating).toBe(2);
  });

  it('un juego con jugadas en varios estados aparece solo en el más reciente', () => {
    const doc = {
      schema: /** @type {'game-tracker'} */ ('game-tracker'),
      version: /** @type {1} */ (1),
      updatedAt: '2026-08-24T00:00:00Z',
      games: [
        game('Multi', [
          { status: 'finished', addedAt: '2026-01-01' },
          { status: 'playing', addedAt: '2026-06-01' },
        ]),
      ],
    };
    const shelves = shelfData(doc);
    expect(shelves.find((s) => s.status === 'playing')?.count).toBe(1);
    expect(shelves.find((s) => s.status === 'finished')?.count).toBe(0);
  });
});

describe('listas para filtros', () => {
  it('allTags dedupe y orden es', () => {
    const doc = {
      schema: /** @type {'game-tracker'} */ ('game-tracker'),
      version: /** @type {1} */ (1),
      updatedAt: '2026-08-24T00:00:00Z',
      games: [
        { ...game('A', [{ addedAt: TODAY }]), tags: ['difícil', 'corto'] },
        { ...game('B', [{ addedAt: TODAY }]), tags: ['difícil'] },
      ],
    };
    expect(allTags(doc)).toEqual(['corto', 'difícil']);
  });

  it('allGenres/allPlatforms dedupe por id, excluyen null (plataformas propias no están en juegos)', () => {
    const doc = {
      schema: /** @type {'game-tracker'} */ ('game-tracker'),
      version: /** @type {1} */ (1),
      updatedAt: '2026-08-24T00:00:00Z',
      games: [
        {
          ...game('A', [{ addedAt: TODAY }]),
          genres: [
            { id: 2, name: 'Plataformas' },
            { id: 1, name: 'Acción' },
            { id: 2, name: 'Plataformas' },
          ],
          platforms: [
            { id: 6, name: 'PC (Microsoft Windows)' },
            { id: 48, name: 'PlayStation 4' },
          ],
        },
      ],
    };
    expect(allGenres(doc)).toEqual([
      { id: 1, name: 'Acción' },
      { id: 2, name: 'Plataformas' },
    ]);
    expect(allPlatforms(doc)).toHaveLength(2);
  });
});

describe('createPlay con plataforma propia', () => {
  it('acepta id null', () => {
    const play = createPlay({ today: TODAY, platform: { id: null, name: 'Emulador' } });
    expect(play.platform?.id).toBeNull();
  });
});
