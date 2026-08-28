import { describe, it, expect, beforeEach } from 'vitest';
import {
  initLibrary,
  newLibrary,
  addGame,
  addPlay as repoAddPlay,
  updatePlay,
  LibraryError,
} from './library.js';
import {
  addPlay,
  addTag,
  deleteGame,
  deletePlay,
  ratePlay,
  removeTag,
  setPlayDate,
  setPlayNotes,
  setPlayPlatform,
  setSharedField,
  setStatus,
  setTitle,
} from './ficha.js';
import { store } from '../app.js';

const TODAY = '2026-08-24';
const NOW = new Date('2026-08-24T10:00:00Z');

beforeEach(async () => {
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
  });
  await initLibrary();
});

/**
 * @param {string} gameId
 * @returns {import('../domain/schema.js').Game}
 */
function findGame(gameId) {
  const game = store.get().doc?.games.find((g) => g.id === gameId);
  if (!game) throw new Error(`juego no encontrado: ${gameId}`);
  return game;
}

/**
 * @param {string} gameId
 * @param {string} playId
 * @returns {import('../domain/schema.js').Play}
 */
function findPlay(gameId, playId) {
  const play = findGame(gameId).plays.find((p) => p.id === playId);
  if (!play) throw new Error(`jugada no encontrada: ${playId}`);
  return play;
}

describe('setTitle', () => {
  it('recorta espacios', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: TODAY });
    await setTitle(doc.games[0].id, '  Celeste  ');
    expect(findGame(doc.games[0].id).title).toBe('Celeste');
  });
});

describe('setSharedField', () => {
  it('descripción y carátula recortan; el vacío deja el campo ausente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    await setSharedField(gameId, 'description', '  Hecho a mano.  ');
    expect(findGame(gameId).description).toBe('Hecho a mano.');
    await setSharedField(gameId, 'coverUrl', '  https://x.jpg  ');
    expect(findGame(gameId).coverUrl).toBe('https://x.jpg');
    await setSharedField(gameId, 'description', '');
    expect(findGame(gameId).description).toBeUndefined();
  });

  it('géneros: la lista vacía deja el campo ausente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, genres: [{ id: 5, name: 'RPG' }] });
    const gameId = doc.games[0].id;
    await setSharedField(gameId, 'genres', '');
    expect(findGame(gameId).genres).toBeUndefined();
  });

  it('géneros: conserva el id de los nombres existentes y asigna uno estable a los nuevos', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, genres: [{ id: 5, name: 'RPG' }] });
    const gameId = doc.games[0].id;
    await setSharedField(gameId, 'genres', 'RPG, Puzle');
    expect(findGame(gameId).genres).toEqual([
      { id: 5, name: 'RPG' },
      { id: expect.any(Number), name: 'Puzle' },
    ]);
    expect(findGame(gameId).genres?.[1].id).not.toBe(5);
  });

  it('capturas: recorta las URLs y la lista vacía deja el campo ausente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    await setSharedField(gameId, 'screenshots', '  https://a.png , https://b.png ');
    expect(findGame(gameId).screenshots).toEqual(['https://a.png', 'https://b.png']);
    await setSharedField(gameId, 'screenshots', '');
    expect(findGame(gameId).screenshots).toBeUndefined();
  });
});

describe('addTag / removeTag', () => {
  it('addTag no deduplica: añadir dos veces la misma deja dos entradas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro'] });
    const gameId = doc.games[0].id;
    await addTag(gameId, 'viciante');
    await addTag(gameId, 'viciante');
    expect(findGame(gameId).tags).toEqual(['retro', 'viciante', 'viciante']);
  });

  it('removeTag quita y, al quedar la lista vacía, la persiste como []', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro', 'rpg'] });
    const gameId = doc.games[0].id;
    await removeTag(gameId, 'retro');
    expect(findGame(gameId).tags).toEqual(['rpg']);
    await removeTag(gameId, 'rpg');
    expect(findGame(gameId).tags).toEqual([]);
  });

  it('removeTag con una etiqueta inexistente no toca nada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro'] });
    const gameId = doc.games[0].id;
    await removeTag(gameId, 'nope');
    expect(findGame(gameId).tags).toEqual(['retro']);
  });
});

describe('setStatus', () => {
  it('opera solo sobre la jugada más reciente y no crea ni borra jugadas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'backlog' });
    const gameId = doc.games[0].id;
    await repoAddPlay(gameId, { today: '2026-07-01', status: 'playing' });
    await setStatus(gameId, 'abandoned', TODAY);
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[0].status).toBe('backlog');
    expect(plays[1].status).toBe('abandoned');
  });

  it('al pasar a Jugando sugiere startedAt solo si está vacío', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    await setStatus(gameId, 'playing', '2026-03-01');
    expect(findGame(gameId).plays[0].startedAt).toBe('2026-03-01');
  });
});

describe('ratePlay', () => {
  it('pone valoración 1–5 y null la quita', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Balatro', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await ratePlay(gameId, playId, 5);
    expect(findPlay(gameId, playId).rating).toBe(5);
    await ratePlay(gameId, playId, 1);
    expect(findPlay(gameId, playId).rating).toBe(1);
    await ratePlay(gameId, playId, null);
    expect(findPlay(gameId, playId).rating).toBeUndefined();
  });
});

describe('addPlay (herencia de plataforma)', () => {
  it('nace Jugando y hereda la plataforma de la jugada más reciente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({
      title: 'Hades',
      today: '2026-02-01',
      status: 'finished',
      platforms: [{ id: 130, name: 'Nintendo Switch' }],
    });
    const gameId = doc.games[0].id;
    const firstPlayId = doc.games[0].plays[0].id;
    await updatePlay(gameId, firstPlayId, { platform: { id: 130, name: 'Nintendo Switch' } });
    await addPlay(gameId, TODAY);
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[1].status).toBe('playing');
    expect(plays[1].platform).toEqual({ id: 130, name: 'Nintendo Switch' });
  });

  it('sin plataforma en la más reciente, la nueva nace sin plataforma', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'finished' });
    const gameId = doc.games[0].id;
    await addPlay(gameId, TODAY);
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[1].status).toBe('playing');
    expect(plays[1].platform).toBeUndefined();
  });
});

describe('borrado por undefined (campos de jugada)', () => {
  it('setPlayDate con cadena vacía borra startedAt/finishedAt', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { startedAt: '2026-02-05', finishedAt: '2026-02-20' });
    await setPlayDate(gameId, playId, 'startedAt', '');
    await setPlayDate(gameId, playId, 'finishedAt', '');
    const play = findPlay(gameId, playId);
    expect(play.startedAt).toBeUndefined();
    expect(play.finishedAt).toBeUndefined();
  });

  it('setPlayDate con valor fija la fecha', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await setPlayDate(gameId, playId, 'startedAt', '2026-02-05');
    expect(findPlay(gameId, playId).startedAt).toBe('2026-02-05');
  });

  it('setPlayNotes con cadena vacía borra las notas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { notes: 'Segunda vuelta' });
    await setPlayNotes(gameId, playId, '');
    expect(findPlay(gameId, playId).notes).toBeUndefined();
  });
});

describe('setPlayPlatform', () => {
  it('plataforma propia: {id:null,name} se guarda tal cual', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await setPlayPlatform(gameId, playId, { id: null, name: 'RetroArch' });
    expect(findPlay(gameId, playId).platform).toEqual({ id: null, name: 'RetroArch' });
  });

  it('plataforma del catálogo: {id,name} se guarda tal cual', async () => {
    await newLibrary(NOW);
    const doc = await addGame({
      title: 'Hades',
      today: TODAY,
      platforms: [{ id: 130, name: 'Nintendo Switch' }],
    });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await setPlayPlatform(gameId, playId, { id: 130, name: 'Nintendo Switch' });
    expect(findPlay(gameId, playId).platform).toEqual({ id: 130, name: 'Nintendo Switch' });
  });

  it('null o undefined borra el campo', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { platform: { id: null, name: 'RetroArch' } });
    await setPlayPlatform(gameId, playId, null);
    expect(findPlay(gameId, playId).platform).toBeUndefined();
    await setPlayPlatform(gameId, playId, { id: 130, name: 'Nintendo Switch' });
    await setPlayPlatform(gameId, playId, undefined);
    expect(findPlay(gameId, playId).platform).toBeUndefined();
  });
});

describe('errores como error de biblioteca', () => {
  it('deletePlay sobre la última jugada lanza LAST_PLAY', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Solo', today: TODAY });
    await expect(deletePlay(doc.games[0].id, doc.games[0].plays[0].id)).rejects.toMatchObject({
      code: 'LAST_PLAY',
    });
  });

  it('comandos con playId desconocido lanzan NOT_FOUND', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    await repoAddPlay(gameId, { today: '2026-08-25' });
    await expect(setPlayNotes(gameId, 'no-existe', 'x')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(deletePlay(gameId, 'no-existe')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deleteGame con id desconocido lanza NOT_FOUND', async () => {
    await newLibrary(NOW);
    await expect(deleteGame('no-existe')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('los errores son instancias de LibraryError', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Solo', today: TODAY });
    await expect(deletePlay(doc.games[0].id, doc.games[0].plays[0].id)).rejects.toBeInstanceOf(
      LibraryError
    );
    await expect(deleteGame('no-existe')).rejects.toBeInstanceOf(LibraryError);
  });
});
