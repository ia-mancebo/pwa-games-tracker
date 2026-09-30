import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  confirmSegment,
  deleteGame,
  deletePlay,
  discardSegment,
  pauseCounter,
  rateHero,
  removeTag,
  setPlayDate,
  setPlayNotes,
  setPlayPlatform,
  setPlayTime,
  setStatus,
  startCounter,
} from './ficha.js';
import { store } from '../app.js';
import { validateDoc } from '../domain/validate.js';

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

describe('contador de tiempo', () => {
  const LATER = new Date('2026-08-24T10:45:00Z');
  const T_PAUSE = new Date('2026-08-24T11:00:00Z');
  const AUTO_PAUSE = /** @type {import('../domain/schema.js').Status[]} */ ([
    'finished',
    'abandoned',
  ]);

  it('iniciar crea el ancla con instante inmediato y pasa la jugada a Jugando, rellenando startedAt solo si faltaba', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01', status: 'backlog' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({ gameId, playId, startedAt: NOW.toISOString() });
    const play = findPlay(gameId, playId);
    expect(play.status).toBe('playing');
    expect(play.startedAt).toBe('2026-08-24');
  });

  it('iniciar no toca un startedAt ya presente', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01', status: 'backlog' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { startedAt: '2026-02-05' });
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.status).toBe('playing');
    expect(play.startedAt).toBe('2026-02-05');
  });

  it('iniciar sobre una jugada Terminada/Abandonada la reabre a Jugando', async () => {
    for (const status of AUTO_PAUSE) {
      await newLibrary(NOW);
      const doc = await addGame({ title: 'Tunic', today: '2026-02-01', status });
      const gameId = doc.games[0].id;
      const playId = doc.games[0].plays[0].id;
      await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
      expect(findPlay(gameId, playId).status).toBe('playing');
    }
  });

  it('iniciar un segundo Contador auto-pausa el primero', async () => {
    await newLibrary(NOW);
    const docA = await addGame({ title: 'A', today: '2026-02-01' });
    const gameIdA = docA.games[0].id;
    const playIdA = docA.games[0].plays[0].id;
    const docB = await addGame({ title: 'B', today: '2026-02-01' });
    const gameIdB = docB.games[1].id;
    const playIdB = docB.games[1].plays[0].id;
    await expect(startCounter(gameIdA, NOW)).resolves.toMatchObject({ ok: true });
    await expect(startCounter(gameIdB, LATER)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({
      gameId: gameIdB,
      playId: playIdB,
      startedAt: LATER.toISOString(),
    });
    expect(findPlay(gameIdA, playIdA).pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
  });

  it('pausar deja Tramo pendiente con los segundos correctos y limpia el ancla', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(pauseCounter(LATER)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toBeUndefined();
    expect(findPlay(gameId, playId).pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
  });

  it('iniciar ignora los Tramos pendientes previos de la jugada (acumulan)', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { pendingSegments: [{ id: 'previo', seconds: 30 }] });
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(pauseCounter(LATER)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).pendingSegments).toEqual([
      { id: 'previo', seconds: 30 },
      { id: expect.any(String), seconds: 2700 },
    ]);
  });

  it('setStatus a Terminado/Abandonado auto-pausa el Contador del juego', async () => {
    for (const status of AUTO_PAUSE) {
      await newLibrary(NOW);
      const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
      const gameId = doc.games[0].id;
      const playId = doc.games[0].plays[0].id;
      await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(T_PAUSE);
      try {
        await expect(setStatus(gameId, status, NOW)).resolves.toMatchObject({ ok: true });
      } finally {
        vi.useRealTimers();
      }
      expect(store.get().doc?.counter).toBeUndefined();
      expect(findPlay(gameId, playId).pendingSegments).toEqual([
        { id: expect.any(String), seconds: 3600 },
      ]);
    }
  });

  it('setStatus a Jugando no pausa el Contador', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(setStatus(gameId, 'playing', NOW)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({ gameId, playId, startedAt: NOW.toISOString() });
    expect(findPlay(gameId, playId).pendingSegments).toBeUndefined();
  });

  it('setStatus de otro juego no pausa el Contador', async () => {
    await newLibrary(NOW);
    const docA = await addGame({ title: 'A', today: '2026-02-01' });
    const gameIdA = docA.games[0].id;
    const playIdA = docA.games[0].plays[0].id;
    const docB = await addGame({ title: 'B', today: '2026-02-01' });
    const gameIdB = docB.games[1].id;
    await expect(startCounter(gameIdA, NOW)).resolves.toMatchObject({ ok: true });
    await expect(setStatus(gameIdB, 'finished', NOW)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({ gameId: gameIdA, playId: playIdA, startedAt: NOW.toISOString() });
    expect(findPlay(gameIdA, playIdA).pendingSegments).toBeUndefined();
  });

  it('addPlay auto-pausa si el juego anclado coincide', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(addPlay(gameId, LATER)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toBeUndefined();
    // La pausa se cierra en el instante de la operación (el now de la rejugada).
    expect(findPlay(gameId, playId).pendingSegments).toEqual([
      { id: expect.any(String), seconds: 2700 },
    ]);
    expect(findGame(gameId).plays).toHaveLength(2);
  });

  it('addPlay de otro juego no pausa el Contador', async () => {
    await newLibrary(NOW);
    const docA = await addGame({ title: 'A', today: '2026-02-01' });
    const gameIdA = docA.games[0].id;
    const playIdA = docA.games[0].plays[0].id;
    const docB = await addGame({ title: 'B', today: '2026-02-01' });
    const gameIdB = docB.games[1].id;
    await expect(startCounter(gameIdA, NOW)).resolves.toMatchObject({ ok: true });
    await expect(addPlay(gameIdB, LATER)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({ gameId: gameIdA, playId: playIdA, startedAt: NOW.toISOString() });
    expect(findPlay(gameIdA, playIdA).pendingSegments).toBeUndefined();
  });

  it('borrar el juego anclado deja el Doc sin ancla y sin Tramo nuevo', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(deleteGame(gameId)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toBeUndefined();
    expect(store.get().doc?.games).toHaveLength(0);
  });

  it('borrar la jugada anclada deja el Doc sin ancla y sin Tramo nuevo', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId1 = doc.games[0].plays[0].id;
    await expect(addPlay(gameId, NOW)).resolves.toMatchObject({ ok: true });
    const playId2 = findGame(gameId).plays[1].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    await expect(deletePlay(gameId, playId2)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toBeUndefined();
    expect(findPlay(gameId, playId1).pendingSegments).toBeUndefined();
  });

  it('el Doc no sufre escrituras durante la marcha', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: TODAY });
    const gameId = doc.games[0].id;
    await expect(startCounter(gameId, NOW)).resolves.toMatchObject({ ok: true });
    const frozen = store.get().doc;
    const snapshot = structuredClone(frozen);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.get().doc).toBe(frozen);
    expect(store.get().doc).toEqual(snapshot);
  });

  it('los comandos devuelven Promise<Result> y los errores llegan como Result sin lanzar', async () => {
    await newLibrary(NOW);
    const pause = pauseCounter(NOW);
    expect(pause).toBeInstanceOf(Promise);
    await expect(pause).resolves.toMatchObject({
      ok: false,
      error: { code: 'NO_COUNTER', message: 'No hay contador en marcha' },
    });
    const start = startCounter('no-existe', NOW);
    expect(start).toBeInstanceOf(Promise);
    await expect(start).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    await expect(pauseCounter(NOW)).resolves.toMatchObject({
      ok: false,
      error: expect.any(LibraryError),
    });
    await expect(startCounter('no-existe', NOW)).resolves.toMatchObject({
      ok: false,
      error: expect.any(LibraryError),
    });
  });
});

describe('consolidar tramos', () => {
  const LATER = new Date('2026-08-24T10:45:00Z');
  const T_START2 = new Date('2026-08-24T12:00:00Z');
  const T_PAUSE2 = new Date('2026-08-24T12:20:00Z');

  /**
   * Siembra un juego con un Tramo pendiente de 2700s por el cauce del motor
   * (iniciar → pausar), como hace el usuario real.
   * @returns {Promise<{ gameId: string, playId: string, segId: string }>}
   */
  async function seedPendingSegment() {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await startCounter(gameId, NOW);
    await pauseCounter(LATER);
    const segments = findPlay(gameId, playId).pendingSegments ?? [];
    return { gameId, playId, segId: segments[0].id };
  }

  it('confirmar sin duración consolida la prefillada y quita el Tramo de pendientes', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await expect(confirmSegment(gameId, playId, segId, null, NOW)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBe(2700);
    expect(play.pendingSegments).toBeUndefined();
  });

  it('confirmar con otra duración consolida esa duración en su lugar, sumándola al Tiempo jugado', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await updatePlay(gameId, playId, { playedSeconds: 100 });
    await expect(confirmSegment(gameId, playId, segId, 90, NOW)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBe(190);
    expect(play.pendingSegments).toBeUndefined();
  });

  it('confirmar con duración 0 no suma nada y quita el Tramo', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await expect(confirmSegment(gameId, playId, segId, 0, NOW)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBeUndefined();
    expect(play.pendingSegments).toBeUndefined();
  });

  it('descartar quita el Tramo sin rastro en pendientes ni en el consolidado', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(discardSegment(gameId, playId, segId, NOW)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBe(3600);
    expect(play.pendingSegments).toBeUndefined();
  });

  it('varios Tramos pendientes se deciden uno a uno sin afectar al resto', async () => {
    const { gameId, playId, segId: first } = await seedPendingSegment();
    await startCounter(gameId, T_START2);
    await pauseCounter(T_PAUSE2);
    const segments = findPlay(gameId, playId).pendingSegments ?? [];
    expect(segments).toHaveLength(2);
    const second = segments[1].id;
    await expect(confirmSegment(gameId, playId, first, undefined, NOW)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBe(2700);
    expect(findPlay(gameId, playId).pendingSegments).toEqual([{ id: second, seconds: 1200 }]);
    await expect(discardSegment(gameId, playId, second, NOW)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBe(2700);
    expect(findPlay(gameId, playId).pendingSegments).toBeUndefined();
  });

  it('confirmar o descartar un Tramo inexistente devuelve NOT_FOUND sin tocar nada', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(confirmSegment(gameId, playId, 'no-existe', null, NOW)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Tramo pendiente no encontrado' },
    });
    await expect(discardSegment(gameId, playId, 'no-existe', NOW)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Tramo pendiente no encontrado' },
    });
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBe(3600);
    expect(play.pendingSegments).toEqual([{ id: segId, seconds: 2700 }]);
  });

  it('duración inválida devuelve BAD_SHAPE sin tocar nada', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    for (const bad of [-5, 1.5]) {
      await expect(confirmSegment(gameId, playId, segId, bad, NOW)).resolves.toMatchObject({
        ok: false,
        error: { code: 'BAD_SHAPE', message: 'La duración debe ser un entero de segundos' },
      });
    }
    const play = findPlay(gameId, playId);
    expect(play.playedSeconds).toBe(3600);
    expect(play.pendingSegments).toEqual([{ id: segId, seconds: 2700 }]);
  });
});

describe('setPlayTime (corrección del Tiempo jugado)', () => {
  const LATER = new Date('2026-08-24T10:45:00Z');
  const T_PAUSE = new Date('2026-08-24T11:00:00Z');

  /**
   * Siembra un juego con un Tramo pendiente de 2700s por el cauce del motor
   * (iniciar → pausar), como hace el usuario real.
   * @returns {Promise<{ gameId: string, playId: string, segId: string }>}
   */
  async function seedPendingSegment() {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await startCounter(gameId, NOW);
    await pauseCounter(LATER);
    const segments = findPlay(gameId, playId).pendingSegments ?? [];
    return { gameId, playId, segId: segments[0].id };
  }

  it('set al alza: fija el Tiempo jugado de una jugada sin valor', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(setPlayTime(gameId, playId, 7200)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBe(7200);
  });

  it('set a la baja: reemplaza el Tiempo jugado por el valor dado', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(setPlayTime(gameId, playId, 900)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBe(900);
  });

  it('set a 0: deja el campo ausente (convención del repo)', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(setPlayTime(gameId, playId, 0)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBeUndefined();
  });

  it('set sobre jugada sin Tiempo jugado fija el valor', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    expect(findPlay(gameId, playId).playedSeconds).toBeUndefined();
    await expect(setPlayTime(gameId, playId, 600)).resolves.toMatchObject({ ok: true });
    expect(findPlay(gameId, playId).playedSeconds).toBe(600);
  });

  it('segundos inválidos devuelven BAD_SHAPE sin tocar nada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    for (const bad of [-5, -1, 1.5, NaN]) {
      await expect(setPlayTime(gameId, playId, bad)).resolves.toMatchObject({
        ok: false,
        error: { code: 'BAD_SHAPE', message: 'El tiempo jugado debe ser un entero de segundos' },
      });
    }
    expect(findPlay(gameId, playId).playedSeconds).toBe(3600);
  });

  it('jugada desconocida devuelve NOT_FOUND sin tocar nada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(setPlayTime(gameId, 'no-existe', 900)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(findPlay(gameId, playId).playedSeconds).toBe(3600);
  });

  it('auto-pausa al corregir la Jugada anclada y el doc sigue validando', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await startCounter(gameId, NOW);
    await expect(setPlayTime(gameId, playId, 7200, T_PAUSE)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toBeUndefined();
    const play = findPlay(gameId, playId);
    expect(play.pendingSegments).toEqual([{ id: expect.any(String), seconds: 3600 }]);
    expect(play.playedSeconds).toBe(7200);
    expect(validateDoc(store.get().doc)).toMatchObject({ ok: true });
  });

  it('sin auto-pausa cuando el ancla es de otra jugada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const firstPlayId = doc.games[0].plays[0].id;
    await addPlay(gameId);
    const secondPlayId = findGame(gameId).plays[1].id;
    await startCounter(gameId, NOW);
    await expect(setPlayTime(gameId, firstPlayId, 7200)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({
      gameId,
      playId: secondPlayId,
      startedAt: NOW.toISOString(),
    });
    const first = findPlay(gameId, firstPlayId);
    expect(first.playedSeconds).toBe(7200);
    expect(first.pendingSegments).toBeUndefined();
    expect(findPlay(gameId, secondPlayId).pendingSegments).toBeUndefined();
  });

  it('sin auto-pausa cuando el ancla es de otro juego', async () => {
    await newLibrary(NOW);
    const docA = await addGame({ title: 'A', today: '2026-02-01' });
    const gameIdA = docA.games[0].id;
    const playIdA = docA.games[0].plays[0].id;
    const docB = await addGame({ title: 'B', today: '2026-02-01' });
    const gameIdB = docB.games[1].id;
    const playIdB = docB.games[1].plays[0].id;
    await startCounter(gameIdA, NOW);
    await expect(setPlayTime(gameIdB, playIdB, 600)).resolves.toMatchObject({ ok: true });
    expect(store.get().doc?.counter).toEqual({
      gameId: gameIdA,
      playId: playIdA,
      startedAt: NOW.toISOString(),
    });
    expect(findPlay(gameIdB, playIdB).playedSeconds).toBe(600);
    expect(findPlay(gameIdA, playIdA).pendingSegments).toBeUndefined();
  });

  it('los Tramos pendientes quedan intactos al corregir', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: '2026-02-01' });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await startCounter(gameId, NOW);
    await pauseCounter(LATER);
    const segments = findPlay(gameId, playId).pendingSegments ?? [];
    const segId = segments[0].id;
    await updatePlay(gameId, playId, { playedSeconds: 3600 });
    await expect(setPlayTime(gameId, playId, 900)).resolves.toMatchObject({ ok: true });
    const play = findPlay(gameId, playId);
    expect(play.pendingSegments).toEqual([{ id: segId, seconds: 2700 }]);
    expect(play.playedSeconds).toBe(900);
  });

  it('la confirmación posterior suma sobre la base corregida y el doc sigue validando', async () => {
    const { gameId, playId, segId } = await seedPendingSegment();
    await expect(setPlayTime(gameId, playId, 7200)).resolves.toMatchObject({ ok: true });
    await expect(confirmSegment(gameId, playId, segId, null, NOW)).resolves.toMatchObject({
      ok: true,
    });
    expect(findPlay(gameId, playId).playedSeconds).toBe(9900);
    expect(validateDoc(store.get().doc)).toMatchObject({ ok: true });
  });

  it('setPlayTime devuelve Promise<Result> y los errores llegan como Result sin lanzar', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Tunic', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    const bad = setPlayTime(gameId, playId, -5);
    expect(bad).toBeInstanceOf(Promise);
    await expect(bad).resolves.toMatchObject({
      ok: false,
      error: { code: 'BAD_SHAPE', message: 'El tiempo jugado debe ser un entero de segundos' },
    });
    await expect(setPlayTime(gameId, playId, -5)).resolves.toMatchObject({
      ok: false,
      error: expect.any(LibraryError),
    });
  });
});