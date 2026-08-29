import { describe, it, expect, beforeEach } from 'vitest';
import { getState, getMeta } from './db.js';
import {
  initLibrary,
  newLibrary,
  importDoc,
  mutate,
  addGame,
  addPlay,
  deletePlay,
  setGameStatus,
  ratePlay,
  markSaved,
  LibraryError,
} from './library.js';
import { store } from '../app.js';
import { gameStatus } from '../domain/selectors.js';

const TODAY = '2026-08-24';
const NOW = new Date('2026-08-24T10:00:00Z');

/** Doc v1 válido para importar. */
function validDoc() {
  return {
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'g1',
        title: 'Celeste',
        plays: [{ id: 'p1', status: 'finished', addedAt: '2026-08-01', rating: 5 }],
      },
    ],
  };
}

beforeEach(async () => {
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
  });
  await initLibrary();
});

describe('initLibrary', () => {
  it('arranca vacío y ready', () => {
    expect(store.get().doc).toBeNull();
    expect(store.get().ready).toBe(true);
  });

  it('un doc persistido sobrevive a la recarga (re-init)', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'Hades', today: TODAY });
    // "recarga": store a cero + init de nuevo contra la misma IDB
    store.set({
      doc: null,
      meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
      ready: false,
    });
    await initLibrary();
    expect(store.get().doc?.games).toHaveLength(1);
    expect(store.get().meta.dirty).toBe(true);
  });
});

describe('newLibrary', () => {
  it('nace dirty y vacía', async () => {
    const doc = await newLibrary(NOW);
    expect(doc.games).toEqual([]);
    expect(store.get().meta.dirty).toBe(true);
    const raw = await getState();
    expect(raw?.updatedAt).toBe('2026-08-24T10:00:00.000Z');
  });
});

describe('importDoc', () => {
  it('import válido sustituye el espejo, limpia dirty y fija hash', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'Viejo', today: TODAY });
    const doc = await importDoc(JSON.stringify(validDoc()), {
      hash: 'abc123',
      fileName: 'game-tracker.json',
    });
    expect(doc.games).toHaveLength(1);
    expect(store.get().meta).toMatchObject({
      dirty: false,
      lastSavedFileHash: 'abc123',
      connectedFileName: 'game-tracker.json',
    });
    const meta = await getMeta();
    expect(meta?.lastSavedFileHash).toBe('abc123');
  });

  it('import inválido NO toca nada', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'Viejo', today: TODAY });
    const before = await getState();
    await expect(importDoc('{"schema":"otro"}')).rejects.toThrow();
    expect(await getState()).toEqual(before);
    expect(store.get().doc?.games[0].title).toBe('Viejo');
  });

  it('versión futura rechazada con mensaje claro', async () => {
    const doc = { ...validDoc(), version: 7 };
    await expect(importDoc(doc)).rejects.toMatchObject({
      code: 'FUTURE_VERSION',
      message: expect.stringContaining('Actualiza la app'),
    });
  });
});

describe('mutate (atomicidad)', () => {
  it('reemplaza el doc y marca dirty', async () => {
    await newLibrary(NOW);
    const doc = await mutate((d) => {
      d.games.push({
        id: 'x1',
        title: 'Tunic',
        plays: [{ id: 'xp', status: 'playing', addedAt: TODAY }],
      });
    }, { now: NOW });
    expect(doc.games).toHaveLength(1);
    expect(store.get().meta.dirty).toBe(true);
  });

  it('si la mutación produce un doc inválido, no se persiste nada', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'Bien', today: TODAY });
    const before = await getState();
    await expect(
      mutate((d) => {
        d.games[0].title = '';
      }, { now: NOW }),
    ).rejects.toThrow();
    expect(await getState()).toEqual(before);
    expect(store.get().doc?.games[0].title).toBe('Bien');
    // dirty se queda como estaba (true por addGame)
    expect(store.get().meta.dirty).toBe(true);
  });

  it('sin doc cargado lanza', async () => {
    store.set({ doc: null });
    await expect(mutate(() => {}, { now: NOW })).rejects.toMatchObject({ code: 'NO_DOC' });
  });
});

describe('mutaciones de dominio', () => {
  it('addGame con solo título → aparece en Quiero jugar con jugada de hoy', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Blue Prince', today: TODAY });
    const g = doc.games[0];
    expect(g.title).toBe('Blue Prince');
    expect(gameStatus(g)).toBe('backlog');
    expect(g.plays[0].addedAt).toBe(TODAY);
  });

  it('addGame con estado elegido', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'X', today: TODAY, status: 'playing' });
    expect(gameStatus(doc.games[0])).toBe('playing');
  });

  it('addPlay añade rejugada; setGameStatus solo toca la más reciente', async () => {
    await newLibrary(NOW);
    let doc = await addGame({ title: 'Hollow Knight', today: '2026-01-01', status: 'finished' });
    const gameId = doc.games[0].id;
    doc = await addPlay(gameId, { today: '2026-08-20', status: 'playing' });
    expect(doc.games[0].plays).toHaveLength(2);
    expect(gameStatus(doc.games[0])).toBe('playing');
    doc = await setGameStatus(gameId, 'finished', TODAY);
    expect(doc.games[0].plays).toHaveLength(2);
    expect(gameStatus(doc.games[0])).toBe('finished');
    expect(doc.games[0].plays[0].status).toBe('finished');
  });

  it('setGameStatus sugiere fechas: startedAt al ir a Jugando, finishedAt a Terminado', async () => {
    await newLibrary(NOW);
    let doc = await addGame({ title: 'Outer Wilds', today: '2026-01-01' });
    const gameId = doc.games[0].id;
    doc = await setGameStatus(gameId, 'playing', '2026-02-01');
    expect(doc.games[0].plays[0].startedAt).toBe('2026-02-01');
    expect(doc.games[0].plays[0].finishedAt).toBeUndefined();
    doc = await setGameStatus(gameId, 'finished', '2026-03-15');
    expect(doc.games[0].plays[0].finishedAt).toBe('2026-03-15');
    // No pisa fechas ya presentes
    doc = await setGameStatus(gameId, 'playing', '2026-04-01');
    expect(doc.games[0].plays[0].startedAt).toBe('2026-02-01');
  });

  it('deletePlay respeta el mínimo de una jugada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Solo', today: TODAY });
    const gameId = doc.games[0].id;
    const playId = doc.games[0].plays[0].id;
    await expect(deletePlay(gameId, playId)).rejects.toMatchObject({ code: 'LAST_PLAY' });
    await addPlay(gameId, { today: '2026-08-25' });
    const after = await deletePlay(gameId, playId);
    expect(after.games[0].plays).toHaveLength(1);
  });

  it('ratePlay pone y quita valoración', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Balatro', today: TODAY });
    const { id: gameId } = doc.games[0];
    const { id: playId } = doc.games[0].plays[0];
    const rated = await ratePlay(gameId, playId, 4);
    expect(rated.games[0].plays[0].rating).toBe(4);
    const cleared = await ratePlay(gameId, playId, null);
    expect(cleared.games[0].plays[0].rating).toBeUndefined();
  });

  it('deleteGame elimina en cascada', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Cuphead', today: TODAY });
    const gameId = doc.games[0].id;
    const after = await mutate((d) => {
      const g = d.games.find((x) => x.id === gameId);
      if (g) g.plays.push({ id: 'extra', status: 'playing', addedAt: TODAY });
    }, { now: NOW });
    expect(after.games[0].plays).toHaveLength(2);
    const deleted = await mutate((d) => {
      const idx = d.games.findIndex((x) => x.id === gameId);
      if (idx !== -1) d.games.splice(idx, 1);
    }, { now: NOW });
    expect(deleted.games).toHaveLength(0);
    expect(store.get().doc?.games).toHaveLength(0);
  });

  it('updateGame cambia título', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Mal', today: TODAY });
    const { id } = doc.games[0];
    const updated = await mutate((d) => {
      const g = d.games.find((x) => x.id === id);
      if (g) g.title = 'Bien';
    }, { now: NOW });
    expect(updated.games[0].title).toBe('Bien');
  });

  it('LibraryError para juego inexistente', async () => {
    await newLibrary(NOW);
    await expect(addPlay('no-existe', { today: TODAY })).rejects.toBeInstanceOf(LibraryError);
  });
});

describe('markSaved', () => {
  it('limpia dirty y guarda hash', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'A', today: TODAY });
    const doc = store.get().doc;
    if (!doc) throw new Error('sin doc');
    expect(store.get().meta.dirty).toBe(true);
    await markSaved({ hash: 'deadbeef', now: NOW, doc });
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe('deadbeef');
    const meta = await getMeta();
    expect(meta?.dirty).toBe(false);
  });

  it('si el documento cambió durante el vuelco, NO limpia dirty', async () => {
    await newLibrary(NOW);
    await addGame({ title: 'A', today: TODAY });
    const docAtSave = store.get().doc;
    if (!docAtSave) throw new Error('sin doc');
    // Mutación intercalada: el doc del vuelco queda desactualizado.
    await addGame({ title: 'B', today: TODAY });
    await markSaved({ hash: 'deadbeef', now: NOW, doc: docAtSave });
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().meta.lastSavedFileHash).toBe('deadbeef');
  });
});
