import { describe, it, expect } from 'vitest';
import { mapSourceToAddInput, toCoverGame } from './gateway.js';
import { splitCommaList } from '../lib/list.js';

const TODAY = '2026-08-24';

/**
 * Juego de la Fuente con todos los datos compartidos presentes.
 * @returns {import('./gateway.js').SourceGame}
 */
function fullGame() {
  return {
    igdbId: 1877,
    title: 'Celeste',
    coverUrl: 'https://images.igdb.com/co1nij.jpg',
    description: 'Un plataformas para quienes están decididos a escalar.',
    genres: [
      { id: 8, name: 'Platform' },
      { id: 32, name: 'Indie' },
    ],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
    screenshots: ['https://images.igdb.com/sc1.jpg'],
  };
}

describe('mapSourceToAddInput', () => {
  it('juego completo: mapea todos los campos compartidos presentes', () => {
    const payload = mapSourceToAddInput(fullGame(), {
      status: 'playing',
      tagsRaw: ' rol , difícil ',
      today: TODAY,
    });
    expect(payload).toEqual({
      title: 'Celeste',
      status: 'playing',
      today: TODAY,
      tags: ['rol', 'difícil'],
      igdbId: 1877,
      coverUrl: 'https://images.igdb.com/co1nij.jpg',
      description: 'Un plataformas para quienes están decididos a escalar.',
      genres: [
        { id: 8, name: 'Platform' },
        { id: 32, name: 'Indie' },
      ],
      platforms: [{ id: 130, name: 'Nintendo Switch' }],
      screenshots: ['https://images.igdb.com/sc1.jpg'],
    });
  });

  it('juego con solo título: solo title+status+today, sin claves undefined', () => {
    const payload = mapSourceToAddInput({ title: 'Solo título' }, { today: TODAY });
    expect(payload).toEqual({ title: 'Solo título', status: 'backlog', today: TODAY });
    expect(Object.keys(payload).sort()).toEqual(['status', 'title', 'today']);
  });

  it('campos ausentes (null y listas vacías) no se escriben', () => {
    const payload = mapSourceToAddInput(
      {
        title: 'Juego',
        coverUrl: null,
        description: null,
        genres: [],
        platforms: [],
        screenshots: [],
      },
      { today: TODAY }
    );
    expect(payload).toEqual({ title: 'Juego', status: 'backlog', today: TODAY });
  });

  it('carátula declarada (aunque vacía) viaja: el Alta online la conservaba', () => {
    const payload = mapSourceToAddInput(
      { title: 'Juego', igdbId: 7, coverUrl: '', description: '' },
      { today: TODAY }
    );
    expect(payload.coverUrl).toBe('');
    expect(payload.description).toBeUndefined();
  });

  it('etiquetas: se parsean con el splitter compartido; texto vacío omite el campo', () => {
    const raw = ' rol , ,plataformas ,difícil ';
    const payload = mapSourceToAddInput(fullGame(), { tagsRaw: raw, today: TODAY });
    expect(payload.tags).toEqual(['rol', 'plataformas', 'difícil']);
    expect(payload.tags).toEqual(splitCommaList(raw));

    const sinTags = mapSourceToAddInput(fullGame(), { tagsRaw: '  ,  ', today: TODAY });
    expect(sinTags.tags).toBeUndefined();
    expect(Object.keys(sinTags)).not.toContain('tags');
  });

  it('Estado por defecto: sin status → backlog (Quiero jugar); explícito se conserva', () => {
    expect(mapSourceToAddInput(fullGame(), { today: TODAY }).status).toBe('backlog');
    expect(
      mapSourceToAddInput(fullGame(), { status: 'finished', today: TODAY }).status
    ).toBe('finished');
  });

  it('juego sin datos compartidos → payload mínimo', () => {
    const payload = mapSourceToAddInput({ title: 'Minimal' }, { today: TODAY });
    expect(payload).toEqual({ title: 'Minimal', status: 'backlog', today: TODAY });
  });
});

describe('toCoverGame', () => {
  it('id derivado de la Fuente, título y plays vacío; coverUrl solo si es truthy', () => {
    expect(toCoverGame(fullGame())).toEqual({
      id: 'igdb-1877',
      title: 'Celeste',
      coverUrl: 'https://images.igdb.com/co1nij.jpg',
      plays: [],
    });
  });

  it('sin coverUrl (null) omite la clave: render cae al placeholder estable', () => {
    expect(toCoverGame({ igdbId: 5, title: 'Sin carátula', coverUrl: null })).toEqual({
      id: 'igdb-5',
      title: 'Sin carátula',
      plays: [],
    });
  });
});
