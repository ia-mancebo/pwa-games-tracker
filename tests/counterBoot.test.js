/**
 * Reabrir con la app cerrada (ticket 05, ADR-0011): si el Doc trae el ancla de
 * un Contador en marcha, al reinicializar la biblioteca con un `now` posterior
 * el tiempo de pared transcurrido queda como Tramo pendiente prefillado en la
 * jugada anclada y el ancla se deshace — SIN tope ni corrección. Sin navegador:
 * el espejo se siembra directo con `putStateAndMeta` y se arranca a mano
 * (`initLibrary` + `resumeCounter`), que es lo que el boot ejecuta en orden.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initLibrary, resumeCounter } from '../src/data/library.js';
import { putStateAndMeta } from '../src/data/db.js';
import { store } from '../src/app.js';

/** Instante de inicio del Contador sembrado. */
const T0_MS = Date.parse('2026-08-24T10:00:00Z');
const T0 = '2026-08-24T10:00:00Z';

/** Meta de espejo mínima para sembrar. @returns {import('../src/data/db.js').Meta} */
function seedMeta() {
  return {
    dirty: true,
    updatedAt: T0,
    lastSavedFileHash: null,
    connectedFileName: null,
  };
}

/**
 * Doc v2 válido con ancla de Contador sobre un juego/jugada reales; la jugada
 * anclada ya arranca con un Tramo pendiente previo para comprobar que acumula.
 * @param {string} [startedAt] instante de inicio del ancla
 * @returns {any}
 */
function docWithAnchor(startedAt = T0) {
  return {
    schema: 'game-tracker',
    version: 2,
    updatedAt: T0,
    games: [
      {
        id: 'g1',
        title: 'Celeste',
        tags: ['retro'],
        plays: [
          {
            id: 'p1',
            status: 'playing',
            addedAt: '2026-08-01',
            startedAt: '2026-08-01',
            playedSeconds: 3600,
            pendingSegments: [{ id: 's1', seconds: 120 }],
          },
          { id: 'p2', status: 'finished', addedAt: '2026-08-02', rating: 5 },
        ],
      },
      {
        id: 'g2',
        title: 'Hades',
        plays: [{ id: 'p3', status: 'backlog', addedAt: '2026-08-03' }],
      },
    ],
    counter: { gameId: 'g1', playId: 'p1', startedAt },
  };
}

/** Doc v1 válido sin Contador (sin campos nuevos). @returns {any} */
function docV1() {
  return {
    schema: 'game-tracker',
    version: 1,
    updatedAt: T0,
    games: [
      {
        id: 'g1',
        title: 'Celeste',
        plays: [{ id: 'p1', status: 'finished', addedAt: '2026-08-01', rating: 5 }],
      },
    ],
  };
}

/**
 * @param {string} gameId
 * @param {string} playId
 * @returns {import('../src/domain/schema.js').Play | undefined}
 */
function findPlay(gameId, playId) {
  /** @type {import('../src/domain/schema.js').Doc | null | undefined} */
  const doc = store.get().doc;
  return doc?.games.find((g) => g.id === gameId)?.plays.find((p) => p.id === playId);
}

beforeEach(() => {
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
  });
});

describe('resumeCounter (reabrir con la app cerrada)', () => {
  it('boot con ancla: Tramo pendiente con el tiempo de pared y ancla deshecha', async () => {
    const seeded = docWithAnchor();
    await putStateAndMeta(seeded, seedMeta());
    await initLibrary();

    await resumeCounter(new Date(T0_MS + 3661000));

    const doc = store.get().doc;
    expect(doc?.counter).toBeUndefined();
    expect(findPlay('g1', 'p1')?.pendingSegments).toEqual([
      { id: 's1', seconds: 120 },
      { id: expect.any(String), seconds: 3661 },
    ]);
    // El resto del doc intacto (solo cambian updatedAt y el tramo nuevo).
    const expected = structuredClone(seeded);
    delete expected.counter;
    expected.updatedAt = new Date(T0_MS + 3661000).toISOString();
    expected.games[0].plays[0].pendingSegments = [
      { id: 's1', seconds: 120 },
      { id: expect.any(String), seconds: 3661 },
    ];
    expect(doc).toEqual(expected);
  });

  it('boot sin ancla no toca nada: el doc conserva su identidad', async () => {
    const seeded = docV1();
    await putStateAndMeta(seeded, seedMeta());
    await initLibrary();
    const before = store.get().doc;

    await resumeCounter();

    expect(store.get().doc).toBe(before);
    expect(store.get().doc).toEqual(seeded);
  });

  it('sin tope: un tramo de días queda tal cual para revisión', async () => {
    const seeded = docWithAnchor();
    await putStateAndMeta(seeded, seedMeta());
    await initLibrary();

    // Tres días completos de app cerrada: 259200 s, sin recorte.
    await resumeCounter(new Date(T0_MS + 3 * 24 * 3600 * 1000));

    const doc = store.get().doc;
    expect(doc?.counter).toBeUndefined();
    expect(findPlay('g1', 'p1')?.pendingSegments).toEqual([
      { id: 's1', seconds: 120 },
      { id: expect.any(String), seconds: 259200 },
    ]);
  });

  it('ancla huérfana: la limpia sin lanzar y sin crear tramo', async () => {
    for (const counter of [
      { gameId: 'fantasma', playId: 'fantasma', startedAt: T0 },
      { gameId: 'g1', playId: 'fantasma', startedAt: T0 },
    ]) {
      const seeded = docWithAnchor();
      seeded.counter = counter;
      await putStateAndMeta(seeded, seedMeta());
      await initLibrary();

      await expect(resumeCounter(new Date(T0_MS + 3661000))).resolves.toBeTruthy();

      const doc = store.get().doc;
      expect(doc?.counter).toBeUndefined();
      expect(findPlay('g1', 'p1')?.pendingSegments).toEqual([{ id: 's1', seconds: 120 }]);
    }
  });
});
