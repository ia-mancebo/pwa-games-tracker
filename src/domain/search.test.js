import { describe, it, expect } from 'vitest';
import { chipsForDoc, filterGames, gameMatchesQuery, normalizeText } from './search.js';

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

describe('normalizeText', () => {
  it('hace equivalentes «pokémon», «pokemon» y «POKÉMON»', () => {
    expect(normalizeText('Pokémon')).toBe(normalizeText('pokemon'));
    expect(normalizeText('POKÉMON')).toBe(normalizeText('pokemon'));
    expect(normalizeText('pokémon')).toBe('pokemon');
  });

  it('minúsculas y tildes fuera en un caso largo', () => {
    expect(normalizeText('ÁRBOL De PéRú')).toBe('arbol de peru');
  });
});

describe('gameMatchesQuery', () => {
  const g = game({
    title: 'Pokémon Esmeralda',
    tags: ['viciante', 'rol'],
    genres: [
      { id: 1, name: 'Acción' },
      { id: 2, name: 'RPG' },
    ],
    platforms: [
      { id: 130, name: 'Nintendo Switch' },
      { id: 6, name: 'PC (Microsoft Windows)' },
    ],
  });

  it('coincide por título, insensible a mayúsculas y tildes', () => {
    expect(gameMatchesQuery(g, 'pokemon')).toBe(true);
    expect(gameMatchesQuery(g, 'POKÉMON')).toBe(true);
    expect(gameMatchesQuery(g, 'esmeralda')).toBe(true);
    expect(gameMatchesQuery(g, 'zelda')).toBe(false);
  });

  it('coincide por etiqueta propia', () => {
    expect(gameMatchesQuery(g, 'viciante')).toBe(true);
    expect(gameMatchesQuery(g, 'VICIANTE')).toBe(true);
  });

  it('coincide por género, incluso sin tilde («accion»)', () => {
    expect(gameMatchesQuery(g, 'acción')).toBe(true);
    expect(gameMatchesQuery(g, 'accion')).toBe(true);
    expect(gameMatchesQuery(g, 'rpg')).toBe(true);
  });

  it('coincide por plataforma', () => {
    expect(gameMatchesQuery(g, 'switch')).toBe(true);
    expect(gameMatchesQuery(g, 'nintendo')).toBe(true);
  });

  it('coincide con subcadenas del pajar completo', () => {
    expect(gameMatchesQuery(g, 'émon esm')).toBe(true);
  });

  it('consulta vacía o de solo espacios coincide con todo', () => {
    expect(gameMatchesQuery(g, '')).toBe(true);
    expect(gameMatchesQuery(g, '   ')).toBe(true);
  });
});

describe('filterGames', () => {
  const hades = game({
    id: 'hades',
    title: 'Hades',
    genres: [{ id: 10, name: 'Roguelike' }],
    platforms: [{ id: 6, name: 'PC' }],
    tags: ['viciante'],
  });
  const pokemon = game({
    id: 'pokemon',
    title: 'Pokémon Esmeralda',
    genres: [{ id: 11, name: 'RPG' }],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
    tags: ['rol'],
  });
  const zelda = game({
    id: 'zelda',
    title: 'Zelda',
    genres: [{ id: 11, name: 'RPG' }],
    platforms: [
      { id: 6, name: 'PC' },
      { id: 130, name: 'Nintendo Switch' },
    ],
  });
  const list = [hades, pokemon, zelda];

  it('sin filtros devuelve la lista completa en orden', () => {
    expect(filterGames(list, { query: '', genre: null, platform: null, tag: null })).toEqual(list);
  });

  it('filtra por género usando el nombre', () => {
    const out = filterGames(list, { query: '', genre: 'RPG', platform: null, tag: null });
    expect(out.map((g) => g.id)).toEqual(['pokemon', 'zelda']);
  });

  it('filtra por plataforma usando el nombre', () => {
    const out = filterGames(list, { query: '', genre: null, platform: 'PC', tag: null });
    expect(out.map((g) => g.id)).toEqual(['hades', 'zelda']);
  });

  it('filtra por etiqueta propia', () => {
    const out = filterGames(list, { query: '', genre: null, platform: null, tag: 'rol' });
    expect(out.map((g) => g.id)).toEqual(['pokemon']);
  });

  it('acumula dimensiones distintas con Y lógico', () => {
    const out = filterGames(list, {
      query: '',
      genre: 'RPG',
      platform: 'Nintendo Switch',
      tag: null,
    });
    expect(out.map((g) => g.id)).toEqual(['pokemon', 'zelda']);

    const strict = filterGames(list, {
      query: '',
      genre: 'RPG',
      platform: 'Nintendo Switch',
      tag: 'rol',
    });
    expect(strict.map((g) => g.id)).toEqual(['pokemon']);

    expect(
      filterGames(list, { query: 'zelda', genre: 'RPG', platform: 'PC', tag: null }).map(
        (g) => g.id,
      ),
    ).toEqual(['zelda']);
  });

  it('combinación imposible devuelve lista vacía', () => {
    expect(filterGames(list, { query: '', genre: 'RPG', platform: 'PC', tag: 'rol' })).toEqual([]);
  });

  it('la búsqueda y los filtros conviven (Y lógico)', () => {
    const out = filterGames(list, { query: 'pokemon', genre: null, platform: null, tag: null });
    expect(out.map((g) => g.id)).toEqual(['pokemon']);
  });
});

describe('chipsForDoc', () => {
  it('devuelve nombres únicos y ordenados, sin objetos', () => {
    const d = doc([
      game({
        id: 'a',
        title: 'A',
        genres: [
          { id: 2, name: 'RPG' },
          { id: 1, name: 'Acción' },
        ],
        platforms: [{ id: 6, name: 'PC' }],
        tags: ['difícil'],
      }),
      game({
        id: 'b',
        title: 'B',
        genres: [{ id: 2, name: 'RPG' }],
        platforms: [{ id: 130, name: 'Switch' }],
        tags: ['difícil', 'coop'],
      }),
      game({ id: 'c', title: 'C', plays: [{ id: 'c-p1', status: 'backlog', addedAt: '2026-01-03' }] }),
    ]);
    expect(chipsForDoc(d)).toEqual({
      genres: ['Acción', 'RPG'],
      platforms: ['PC', 'Switch'],
      tags: ['coop', 'difícil'],
    });
  });

  it('documento vacío: tres listas vacías', () => {
    expect(chipsForDoc(doc([]))).toEqual({ genres: [], platforms: [], tags: [] });
  });
});
