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
  commitSharedField,
  commitTitle,
  deleteGame,
  deletePlay,
  rateHero,
  removeTag,
  setPlayDate,
  setPlayNotes,
  setPlayPlatform,
  setStatus,
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

describe('commitTitle', () => {
  it('recorta espacios y guarda el título', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: TODAY });
    await expect(commitTitle(doc.games[0].id, '  Celeste  ')).resolves.toMatchObject({ ok: true });
    expect(findGame(doc.games[0].id).title).toBe('Celeste');
  });

  it('vacío o solo espacios devuelve error sin tocar el repositorio', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: TODAY });
    const gameId = doc.games[0].id;
    await expect(commitTitle(gameId, '')).resolves.toMatchObject({
      ok: false,
      error: { code: 'BAD_SHAPE' },
    });
    await expect(commitTitle(gameId, '   ')).resolves.toMatchObject({
      ok: false,
      error: { code: 'BAD_SHAPE' },
    });
    expect(findGame(gameId).title).toBe('Tunic');
  });
});

describe('commitSharedField', () => {
  it('descripción y carátula recortan; el vacío deja el campo ausente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    await expect(commitSharedField(gameId, 'description', '  Hecho a mano.  ')).resolves.toMatchObject(
      { ok: true }
    );
    expect(findGame(gameId).description).toBe('Hecho a mano.');
    await expect(commitSharedField(gameId, 'coverUrl', '  https://x.jpg  ')).resolves.toMatchObject({
      ok: true,
    });
    expect(findGame(gameId).coverUrl).toBe('https://x.jpg');
    await expect(commitSharedField(gameId, 'description', '')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).description).toBeUndefined();
  });

  it('géneros: la lista vacía deja el campo ausente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, genres: [{ id: 5, name: 'RPG' }] });
    const gameId = doc.games[0].id;
    await expect(commitSharedField(gameId, 'genres', '')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).genres).toBeUndefined();
  });

  it('géneros: conserva el id de los nombres existentes y asigna uno estable a los nuevos', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, genres: [{ id: 5, name: 'RPG' }] });
    const gameId = doc.games[0].id;
    await expect(commitSharedField(gameId, 'genres', 'RPG, Puzle')).resolves.toMatchObject({
      ok: true,
    });
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
    await expect(
      commitSharedField(gameId, 'screenshots', '  https://a.png , https://b.png ')
    ).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).screenshots).toEqual(['https://a.png', 'https://b.png']);
    await expect(commitSharedField(gameId, 'screenshots', '')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).screenshots).toBeUndefined();
  });
});

describe('addTag / removeTag', () => {
  it('addTag no deduplica: añadir dos veces la misma deja dos entradas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro'] });
    const gameId = doc.games[0].id;
    await expect(addTag(gameId, 'viciante')).resolves.toMatchObject({ ok: true });
    await expect(addTag(gameId, 'viciante')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).tags).toEqual(['retro', 'viciante', 'viciante']);
  });

  it('removeTag quita y, al quedar la lista vacía, la persiste como []', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro', 'rpg'] });
    const gameId = doc.games[0].id;
    await expect(removeTag(gameId, 'retro')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).tags).toEqual(['rpg']);
    await expect(removeTag(gameId, 'rpg')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).tags).toEqual([]);
  });

  it('removeTag con una etiqueta inexistente no toca nada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, tags: ['retro'] });
    const gameId = doc.games[0].id;
    await expect(removeTag(gameId, 'nope')).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).tags).toEqual(['retro']);
  });
});

describe('setStatus', () => {
  it('opera solo sobre la jugada más reciente y no crea ni borra jugadas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'backlog' });
    const gameId = doc.games[0].id;
    await repoAddPlay(gameId, { today: '2026-07-01', status: 'playing' });
    await expect(setStatus(gameId, 'abandoned', NOW)).resolves.toMatchObject({ ok: true });
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[0].status).toBe('backlog');
    expect(plays[1].status).toBe('abandoned');
  });

  it('al pasar a Jugando usa el «hoy» inyectado para startedAt solo si está vacío', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    await expect(setStatus(gameId, 'playing', NOW)).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).plays[0].startedAt).toBe('2026-08-24');
  });

  it('estado inválido devuelve error sin tocar el repositorio', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'backlog' });
    const gameId = doc.games[0].id;
    await expect(setStatus(gameId, /** @type {any} */ ('jugando'), NOW)).resolves.toMatchObject({
      ok: false,
      error: { code: 'BAD_SHAPE' },
    });
    expect(findGame(gameId).plays[0].status).toBe('backlog');
  });
});

describe('rateHero', () => {
  it('pone valoración 1–5 y null la quita', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Balatro', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(rateHero(gameId, 5)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).rating).toBe(5);
    await expect(rateHero(gameId, 1)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).rating).toBe(1);
    await expect(rateHero(gameId, null)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).rating).toBeUndefined();
  });

  it('valora la jugada más reciente, no la primera', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Balatro', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const firstId = doc.games[0].plays[0].id;
    await repoAddPlay(gameId, { today: '2026-07-01' });
    await expect(rateHero(gameId, 4)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, firstId).rating).toBeUndefined();
    expect(findGame(gameId).plays[1].rating).toBe(4);
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
    await expect(addPlay(gameId, NOW)).resolves.toMatchObject({ ok: true });
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[1].status).toBe('playing');
    expect(plays[1].platform).toEqual({ id: 130, name: 'Nintendo Switch' });
  });

  it('sin plataforma en la más reciente, la nueva nace sin plataforma', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'finished' });
    const gameId = doc.games[0].id;
    await expect(addPlay(gameId, NOW)).resolves.toMatchObject({ ok: true });
    const plays = findGame(gameId).plays;
    expect(plays).toHaveLength(2);
    expect(plays[1].status).toBe('playing');
    expect(plays[1].platform).toBeUndefined();
  });

  it('usa el «hoy» inyectado como fecha de alta', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01', status: 'finished' });
    const gameId = doc.games[0].id;
    await expect(addPlay(gameId, NOW)).resolves.toMatchObject({ ok: true });
    expect(findGame(gameId).plays[1].addedAt).toBe('2026-08-24');
  });
});

describe('borrado por undefined (campos de jugada)', () => {
  it('setPlayDate con cadena vacía borra startedAt/finishedAt', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { startedAt: '2026-02-05', finishedAt: '2026-02-20' });
    await expect(setPlayDate(gameId, playId, 'startedAt', '')).resolves.toMatchObject({ ok: true });
    await expect(setPlayDate(gameId, playId, 'finishedAt', '')).resolves.toMatchObject({
      ok: true,
    });
    const play = findPlay(gameId, playId);
    expect(play.startedAt).toBeUndefined();
    expect(play.finishedAt).toBeUndefined();
  });

  it('setPlayDate con valor fija la fecha', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(setPlayDate(gameId, playId, 'startedAt', '2026-02-05')).resolves.toMatchObject({
      ok: true,
    });
    expect(findPlay(gameId, playId).startedAt).toBe('2026-02-05');
  });

  it('setPlayNotes con cadena vacía borra las notas', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { notes: 'Segunda vuelta' });
    await expect(setPlayNotes(gameId, playId, '')).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).notes).toBeUndefined();
  });
});

describe('setPlayPlatform', () => {
  it('plataforma propia: {id:null,name} se guarda tal cual', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(setPlayPlatform(gameId, playId, { id: null, name: 'RetroArch' })).resolves.toMatchObject(
      { ok: true }
    );
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
    await expect(setPlayPlatform(gameId, playId, { id: 130, name: 'Nintendo Switch' })).resolves.toMatchObject(
      { ok: true }
    );
    expect(findPlay(gameId, playId).platform).toEqual({ id: 130, name: 'Nintendo Switch' });
  });

  it('null o undefined borra el campo', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { platform: { id: null, name: 'RetroArch' } });
    await expect(setPlayPlatform(gameId, playId, null)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).platform).toBeUndefined();
    await expect(setPlayPlatform(gameId, playId, { id: 130, name: 'Nintendo Switch' })).resolves.toMatchObject(
      { ok: true }
    );
    await expect(setPlayPlatform(gameId, playId, undefined)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).platform).toBeUndefined();
  });
});

describe('errores como Result', () => {
  it('deletePlay sobre la última jugada devuelve LAST_PLAY', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Solo', today: TODAY });
    await expect(deletePlay(doc.games[0].id, doc.games[0].plays[0].id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'LAST_PLAY' },
    });
  });

  it('comandos con playId desconocido devuelven NOT_FOUND', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY });
    const gameId = doc.games[0].id;
    await repoAddPlay(gameId, { today: '2026-08-25' });
    await expect(setPlayNotes(gameId, 'no-existe', 'x')).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    await expect(deletePlay(gameId, 'no-existe')).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('deleteGame con id desconocido devuelve NOT_FOUND', async () => {
    await newLibrary(NOW);
    await expect(deleteGame('no-existe')).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('los errores son instancias de LibraryError', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Solo', today: TODAY });
    await expect(deletePlay(doc.games[0].id, doc.games[0].plays[0].id)).resolves.toMatchObject({
      ok: false,
      error: expect.any(LibraryError),
    });
    await expect(deleteGame('no-existe')).resolves.toMatchObject({
      ok: false,
      error: expect.any(LibraryError),
    });
  });
});