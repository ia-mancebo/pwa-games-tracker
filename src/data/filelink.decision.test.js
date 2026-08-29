import { afterEach, describe, expect, it } from 'vitest';
import { store } from '../app.js';
import { decideLink, resetFilelink, saveNow } from './filelink.js';
import { importDoc } from './library.js';
import { setHandle } from '../services/fsa.js';

/**
 * Tabla pura de la decisión del Enlace de archivo (spec §5.5 y «Función de
 * decisión»): hash del archivo contra meta.lastSavedFileHash. Sin fake
 * handles: la función no hace I/O ni toca el store.
 */
describe('decideLink (decisión de tres vías, pura)', () => {
  const META_CLEAN = { dirty: false, lastSavedFileHash: 'hash-base' };
  const META_DIRTY = { dirty: true, lastSavedFileHash: 'hash-base' };

  it('hash igual → same, sin texto ni hash', () => {
    expect(decideLink('v1', 'hash-base', META_CLEAN)).toEqual({ kind: 'same' });
    expect(decideLink('v1', 'hash-base', META_DIRTY)).toEqual({ kind: 'same' });
  });

  it('hash distinto + espejo limpio → reload llevando texto y hash', () => {
    expect(decideLink('v2', 'hash-v2', META_CLEAN)).toEqual({
      kind: 'reload',
      text: 'v2',
      hash: 'hash-v2',
    });
  });

  it('hash distinto + espejo sucio → conflict llevando lo mismo', () => {
    expect(decideLink('v2', 'hash-v2', META_DIRTY)).toEqual({
      kind: 'conflict',
      text: 'v2',
      hash: 'hash-v2',
    });
  });

  it('lastSavedFileHash nulo nunca iguala un hash real → reload/conflict según dirty', () => {
    expect(decideLink('v2', 'hash-v2', { dirty: false, lastSavedFileHash: null })).toEqual({
      kind: 'reload',
      text: 'v2',
      hash: 'hash-v2',
    });
    expect(decideLink('v2', 'hash-v2', { dirty: true, lastSavedFileHash: null })).toEqual({
      kind: 'conflict',
      text: 'v2',
      hash: 'hash-v2',
    });
  });
});

/**
 * Interacción con los guards leyendo el estado: el conflicto pendiente vive
 * en el slice `file` (ADR-0004) y el guard del vuelco lo consulta desde ahí.
 * El stub de handle basta porque el guard corta antes de tocarlo.
 */
describe('guard de conflicto pendiente (lee el estado)', () => {
  const DOC_TEXT = JSON.stringify({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-20T09:30:00Z',
    games: [],
  });

  afterEach(() => {
    resetFilelink();
    setHandle(null);
  });

  it('con conflicto pendiente, el vuelco no forzado se salta', async () => {
    await importDoc(DOC_TEXT, { hash: 'hash-base', fileName: 'game-tracker.json' });
    setHandle(/** @type {any} */ ({ name: 'game-tracker.json' }));
    store.set({
      file: {
        status: 'connected',
        name: 'game-tracker.json',
        error: null,
        conflict: {
          fileText: DOC_TEXT,
          fileHash: 'hash-v2',
          fileDoc: /** @type {import('../domain/schema.js').Doc} */ (JSON.parse(DOC_TEXT)),
        },
        saving: false,
      },
    });
    await expect(saveNow()).resolves.toMatchObject({ status: 'skipped' });
  });
});
