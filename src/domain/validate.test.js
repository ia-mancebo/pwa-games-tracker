import { describe, it, expect } from 'vitest';
import {
  createDoc,
  createGame,
  createPlay,
  isDate,
  validateGameShape,
  validatePlayShape,
} from './schema.js';
import { validateDoc } from './validate.js';

const TODAY = '2026-08-24';

/** Doc v1 válido mínimo: un juego con una jugada. @returns {any} */
function validDocInput() {
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

describe('isDate', () => {
  it('acepta fechas reales YYYY-MM-DD', () => {
    expect(isDate('2026-08-24')).toBe(true);
    expect(isDate('2024-02-29')).toBe(true);
  });
  it('rechaza formato y fechas imposibles', () => {
    expect(isDate('2026-2-24')).toBe(false);
    expect(isDate('2026/08/24')).toBe(false);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-13-01')).toBe(false);
    expect(isDate('24-08-2026')).toBe(false);
    expect(isDate('')).toBe(false);
    expect(isDate(null)).toBe(false);
  });
});

describe('createPlay / createGame / createDoc', () => {
  it('createPlay rellena id y addedAt', () => {
    const play = createPlay({ today: TODAY });
    expect(play.status).toBe('backlog');
    expect(play.addedAt).toBe(TODAY);
    expect(play.id).toBeTruthy();
  });

  it('createGame con solo título crea la primera jugada', () => {
    const game = createGame({ title: 'Hades', today: TODAY });
    expect(game.title).toBe('Hades');
    expect(game.plays).toHaveLength(1);
    expect(game.plays[0].status).toBe('backlog');
  });

  it('createGame rechaza título vacío', () => {
    expect(() => createGame({ title: '  ', today: TODAY })).toThrow();
  });

  it('createDoc sella updatedAt ISO', () => {
    const doc = createDoc({ now: new Date('2026-08-24T10:00:00Z') });
    expect(doc.schema).toBe('game-tracker');
    expect(doc.version).toBe(2);
    expect(doc.updatedAt).toBe('2026-08-24T10:00:00.000Z');
    expect(doc.games).toEqual([]);
  });
});

describe('validateDoc', () => {
  it('acepta un documento v1 válido', () => {
    const res = validateDoc(validDocInput());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.games).toHaveLength(1);
  });

  it('acepta JSON en texto', () => {
    const res = validateDoc(JSON.stringify(validDocInput()));
    expect(res.ok).toBe(true);
  });

  it('rechaza JSON roto', () => {
    const res = validateDoc('{nope');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_JSON');
  });

  it('rechaza schema equivocado', () => {
    const res = validateDoc({ ...validDocInput(), schema: 'otra-cosa' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_SCHEMA');
  });

  it('rechaza versión futura pidiendo actualizar la app', () => {
    const res = validateDoc({ ...validDocInput(), version: 99 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('FUTURE_VERSION');
      expect(res.reason).toContain('Actualiza la app');
    }
  });

  it('rechaza versiones inválidas', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      const res = validateDoc({ ...validDocInput(), version });
      expect(res.ok).toBe(false);
    }
  });

  it('rechaza updatedAt inválido', () => {
    const res = validateDoc({ ...validDocInput(), updatedAt: 'ayer' });
    expect(res.ok).toBe(false);
  });

  it('rechaza campo desconocido en la raíz', () => {
    const res = validateDoc({ ...validDocInput(), extra: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('extra');
  });

  it('rechaza campo desconocido en juego y en jugada', () => {
    const withGameExtra = structuredClone(validDocInput());
    withGameExtra.games[0].cheat = true;
    expect(validateDoc(withGameExtra).ok).toBe(false);
    const withPlayExtra = structuredClone(validDocInput());
    withPlayExtra.games[0].plays[0].cheat = true;
    expect(validateDoc(withPlayExtra).ok).toBe(false);
  });

  it('rechaza juego sin jugadas', () => {
    const doc = validDocInput();
    doc.games[0].plays = [];
    const res = validateDoc(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('al menos una jugada');
  });

  it('rechaza título vacío', () => {
    const doc = validDocInput();
    doc.games[0].title = '';
    expect(validateDoc(doc).ok).toBe(false);
  });

  it('rechaza valoraciones fuera de 1–5 o no enteras', () => {
    for (const rating of [0, 6, 1.5, '5', true]) {
      const doc = validDocInput();
      doc.games[0].plays[0].rating = rating;
      expect(validateDoc(doc).ok).toBe(false);
    }
  });

  it('acepta rating ausente y rechaza fechas de jugada imposibles', () => {
    const doc = validDocInput();
    delete doc.games[0].plays[0].rating;
    expect(validateDoc(doc).ok).toBe(true);
    doc.games[0].plays[0].addedAt = '2026-02-30';
    expect(validateDoc(doc).ok).toBe(false);
  });

  it('rechaza plataforma malformada y acepta id null (propia)', () => {
    const bad = validDocInput();
    bad.games[0].plays[0].platform = { id: 1 };
    expect(validateDoc(bad).ok).toBe(false);
    const own = validDocInput();
    own.games[0].plays[0].platform = { id: null, name: 'Emulador' };
    expect(validateDoc(own).ok).toBe(true);
  });

  it('rechaza más de 5 capturas', () => {
    const doc = validDocInput();
    doc.games[0].screenshots = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(validateDoc(doc).ok).toBe(false);
  });

  it('acepta connection con workerUrl y rechaza formas inválidas', () => {
    const withConnection = { ...validDocInput(), connection: { workerUrl: 'https://gt.workers.dev' } };
    expect(validateDoc(withConnection)).toMatchObject({
      ok: true,
      doc: { connection: { workerUrl: 'https://gt.workers.dev' } },
    });
    expect(validateDoc({ ...validDocInput(), connection: {} })).toMatchObject({ ok: true });

    expect(validateDoc({ ...validDocInput(), connection: 'https://x' })).toMatchObject({ code: 'BAD_SHAPE' });
    expect(validateDoc({ ...validDocInput(), connection: { workerUrl: 7 } })).toMatchObject({ code: 'BAD_SHAPE' });
    expect(validateDoc({ ...validDocInput(), connection: { credencial: 'x' } })).toMatchObject({ code: 'BAD_SHAPE' });
  });

  it('no muta el input y devuelve copia', () => {
    const input = validDocInput();
    const res = validateDoc(input);
    if (res.ok) {
      res.doc.games[0].title = 'cambiado';
      expect(input.games[0].title).toBe('Celeste');
    }
  });
});

describe('validatePlayShape / validateGameShape', () => {
  it('valida jugada suelta', () => {
    expect(validatePlayShape({ id: 'p', status: 'playing', addedAt: TODAY }).ok).toBe(true);
    expect(validatePlayShape({ id: 'p', status: 'nope', addedAt: TODAY }).ok).toBe(false);
    expect(validatePlayShape({ id: 'p', status: 'playing', addedAt: 'x' }).ok).toBe(false);
  });
  it('valida juego suelto', () => {
    const game = createGame({ title: 'Tunic', today: TODAY });
    expect(validateGameShape(game).ok).toBe(true);
  });
});

describe('doc v2', () => {
  const COUNTER = { gameId: 'g1', playId: 'p1', startedAt: '2026-08-24T10:00:00Z' };

  /** Doc v2 válido con Tiempo jugado, Tramos pendientes y Contador. @returns {any} */
  function validDocV2Input() {
    const doc = validDocInput();
    doc.version = 2;
    doc.games[0].plays[0].playedSeconds = 3600;
    doc.games[0].plays[0].pendingSegments = [{ id: 's1', seconds: 120 }];
    doc.counter = COUNTER;
    return doc;
  }

  it('doc v2 con playedSeconds, pendingSegments y counter valida y carga', () => {
    const input = validDocV2Input();
    const res = validateDoc(input);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.doc.version).toBe(2);
      expect(res.doc.games[0].plays[0].playedSeconds).toBe(3600);
      expect(res.doc.games[0].plays[0].pendingSegments).toEqual([{ id: 's1', seconds: 120 }]);
      expect(res.doc.counter).toEqual(COUNTER);
    }
  });

  it('doc v1 sin campos nuevos sigue validando igual (sin migración)', () => {
    const res = validateDoc(validDocInput());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.doc.version).toBe(1);
      expect(res.doc.games[0].plays[0].playedSeconds).toBeUndefined();
      expect(res.doc.games[0].plays[0].pendingSegments).toBeUndefined();
      expect(res.doc.counter).toBeUndefined();
    }
  });

  it('doc v2 sin counter también valida (campos nuevos opcionales)', () => {
    const doc = validDocV2Input();
    delete doc.counter;
    expect(validateDoc(doc).ok).toBe(true);
  });

  it('versión futura con counter en la raíz se rechaza con FUTURE_VERSION', () => {
    const doc = validDocV2Input();
    doc.version = 99;
    const res = validateDoc(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('FUTURE_VERSION');
      expect(res.reason).toContain('Actualiza la app');
    }
  });

  it('la versión futura gana a los campos desconocidos de la raíz', () => {
    const doc = validDocV2Input();
    doc.version = 99;
    doc.extra = true;
    const res = validateDoc(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('FUTURE_VERSION');
      expect(res.reason).toContain('Actualiza la app');
    }
  });

  it('rechaza tiempo jugado mal tipado sin mutar el input', () => {
    for (const playedSeconds of [-5, 1.5, '60', null, true]) {
      const doc = validDocV2Input();
      doc.games[0].plays[0].playedSeconds = playedSeconds;
      const before = structuredClone(doc);
      const res = validateDoc(doc);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBeTruthy();
      expect(doc).toEqual(before);
    }
  });

  it('rechaza tramos pendientes malformados sin mutar el input', () => {
    const badSegments = [
      { seconds: 5 },
      { id: 'x', seconds: -1 },
      { id: 'x', seconds: 1.5 },
      { id: '', seconds: 5 },
      { id: 'x' },
      { id: 'x', seconds: '5' },
      { id: 'x', seconds: 5, extra: 1 },
    ];
    for (const seg of badSegments) {
      const doc = validDocV2Input();
      doc.games[0].plays[0].pendingSegments = [seg];
      const before = structuredClone(doc);
      const res = validateDoc(doc);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBeTruthy();
      expect(doc).toEqual(before);
    }
    for (const pendingSegments of ['x', {}, 5, null]) {
      const doc = validDocV2Input();
      doc.games[0].plays[0].pendingSegments = pendingSegments;
      const res = validateDoc(doc);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBeTruthy();
    }
  });

  it('rechaza ancla de contador malformada con razón clara', () => {
    const cases = [
      { counter: 'x', reason: 'Ancla de contador malformada' },
      { counter: {}, reason: 'Ancla de contador malformada' },
      { counter: { gameId: 'g1', playId: 'p1' }, reason: 'Fecha de inicio del contador inválida' },
      { counter: { gameId: 'g1', playId: 'p1', startedAt: 'ayer' }, reason: 'Fecha de inicio del contador inválida' },
      { counter: { gameId: 'g1', playId: 'p1', startedAt: '2026-08-24' }, reason: 'Fecha de inicio del contador inválida' },
      { counter: { gameId: '', playId: 'p1', startedAt: '2026-08-24T10:00:00Z' }, reason: 'Ancla de contador malformada' },
      { counter: { gameId: 'g1', playId: '', startedAt: '2026-08-24T10:00:00Z' }, reason: 'Ancla de contador malformada' },
      {
        counter: { gameId: 'g1', playId: 'p1', startedAt: '2026-08-24T10:00:00Z', extra: 1 },
        reason: 'Ancla de contador malformada',
      },
    ];
    for (const { counter, reason } of cases) {
      const doc = validDocV2Input();
      doc.counter = counter;
      const before = structuredClone(doc);
      const res = validateDoc(doc);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('BAD_SHAPE');
        expect(res.reason).toContain(reason);
      }
      expect(doc).toEqual(before);
    }
  });
});
