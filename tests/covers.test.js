import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COVERS_CACHE,
  COVERS_META_CACHE,
  enforceLimits,
  initCoverSeeding,
  pruneOrphanCovers,
  resetCoverSeeding,
  seedCovers,
  seedCover,
} from '../src/data/covers.js';
import { store } from '../src/app.js';
import { addGame, importDoc, updateGame } from '../src/data/library.js';

const A = 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg';
const B = 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg';
const C = 'https://images.igdb.com/igdb/image/upload/t_cover_big/c.jpg';

/** @returns {{ ok: boolean, status: number }} */
function okRes() {
  return { ok: true, status: 200 };
}

/** Respuesta opaca (no-cors): status 0. @returns {{ status: number, type: string }} */
function opaqueRes() {
  return { status: 0, type: 'opaque' };
}

/**
 * @param {string | { url: string }} req
 * @returns {string}
 */
function urlOf(req) {
  return typeof req === 'string' ? req : req.url;
}

function makeCache() {
  const entries = new Map();
  return {
    entries,
    /** @param {string | { url: string }} req @param {unknown} res */
    async put(req, res) {
      entries.set(urlOf(req), res);
    },
    /** @param {string | { url: string }} req */
    async match(req) {
      return entries.get(urlOf(req));
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
    /** @param {string | { url: string }} req */
    async delete(req) {
      return entries.delete(urlOf(req));
    },
  };
}

const stores = new Map();

beforeEach(() => {
  stores.clear();
  vi.stubGlobal('caches', {
    /** @param {string} name */
    async open(name) {
      let cache = stores.get(name);
      if (!cache) {
        cache = makeCache();
        stores.set(name, cache);
      }
      return cache;
    },
  });
  // Red por defecto correcta: el suscriptor dispara en background y ningún
  // test debe depender del fetch real.
  vi.stubGlobal('fetch', vi.fn(async () => okRes()));
});

afterEach(() => {
  resetCoverSeeding();
  vi.unstubAllGlobals();
});

/**
 * @param {string} name
 */
async function rawCache(name) {
  return await /** @type {any} */ (caches).open(name);
}

/** URLs presentes en covers-v1. @returns {Promise<string[]>} */
async function coverUrls() {
  return [...(await rawCache(COVERS_CACHE)).entries.keys()];
}

/** URLs presentes en la caché meta. @returns {Promise<string[]>} */
async function metaUrls() {
  return [...(await rawCache(COVERS_META_CACHE)).entries.keys()];
}

/**
 * Inserta una entrada directamente con edad controlada.
 * @param {string} url
 * @param {number} ageMs
 */
async function insertAged(url, ageMs) {
  await (await rawCache(COVERS_CACHE)).put(url, okRes());
  await (await rawCache(COVERS_META_CACHE)).put(url, new globalThis.Response(String(Date.now() - ageMs)));
}

/**
 * Juego mínimo válido para el documento.
 * @param {string} id
 * @param {string} title
 * @param {string} [coverUrl]
 */
function gameJson(id, title, coverUrl) {
  return {
    id,
    title,
    ...(coverUrl ? { coverUrl } : {}),
    plays: [{ id: `${id}-p1`, status: 'backlog', addedAt: '2026-06-01' }],
  };
}

/**
 * Importa un doc (misma vía que la bienvenida).
 * @param {unknown[]} games
 */
async function importGames(games) {
  await importDoc({ schema: 'game-tracker', version: 1, updatedAt: '2026-08-25T10:00:00Z', games });
}

describe('seedCover', () => {
  it('cachea una respuesta CORS correcta en covers-v1', async () => {
    const fetchMock = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', fetchMock);

    await expect(seedCover(A)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(A, { mode: 'cors' });
    expect(await coverUrls()).toEqual([A]);
    expect(await metaUrls()).toEqual([A]);
  });

  it('acepta respuestas opacas (status 0)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => opaqueRes()));

    await expect(seedCover(A)).resolves.toBe(true);
    expect(await coverUrls()).toEqual([A]);
  });

  it('una respuesta fallida (404) no se persiste', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));

    await expect(seedCover(A)).resolves.toBe(false);
    expect(await coverUrls()).toEqual([]);
    expect(await metaUrls()).toEqual([]);
  });

  it('si CORS falla reintenta no-cors y cachea lo opaco', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(async () => opaqueRes());
    vi.stubGlobal('fetch', fetchMock);

    await expect(seedCover(A)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ mode: 'cors' });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({ mode: 'no-cors' });
    expect(await coverUrls()).toEqual([A]);
  });

  it('si ambos modos fallan no persiste nada y no lanza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(seedCover(A)).resolves.toBe(false);
    expect(await coverUrls()).toEqual([]);
    expect(await metaUrls()).toEqual([]);
  });
});

describe('seedCovers', () => {
  it('cuenta solo los éxitos y descarta duplicados', async () => {
    const fetchMock = vi.fn(async (url) => (String(url) === B ? { ok: false, status: 404 } : okRes()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(seedCovers([A, A, B, C])).resolves.toBe(2);
    expect(new Set(await coverUrls())).toEqual(new Set([A, C]));
  });
});

describe('pruneOrphanCovers', () => {
  it('borra las URLs que ningún juego posee y conserva las vivas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()));
    await Promise.all([seedCover(A), seedCover(B), seedCover(C)]);

    const doc = /** @type {import('../src/domain/schema.js').Doc} */ ({
      schema: 'game-tracker',
      version: 1,
      updatedAt: '2026-08-25T10:00:00Z',
      games: [gameJson('g1', 'Vivo', A)],
    });

    await expect(pruneOrphanCovers(doc)).resolves.toBe(2);
    expect(await coverUrls()).toEqual([A]);
    expect(await metaUrls()).toEqual([A]);
  });
});

describe('enforceLimits', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('deja exactamente 500 entradas borrando las más viejas', async () => {
    for (let i = 0; i < 505; i++) {
      await insertAged(`https://cdn.test/${i}.jpg`, (2000 - i) * 1000);
    }

    await expect(enforceLimits()).resolves.toBe(5);

    const urls = await coverUrls();
    expect(urls).toHaveLength(500);
    for (let i = 0; i < 5; i++) expect(urls).not.toContain(`https://cdn.test/${i}.jpg`);
    expect(urls).toContain('https://cdn.test/504.jpg');
    expect(await metaUrls()).toHaveLength(500);
  });

  it('borra por edad (>1 año) aunque haya hueco de sobra', async () => {
    await insertAged(A, 400 * DAY);
    await insertAged(B, DAY);
    await insertAged(C, 2 * DAY);

    await expect(enforceLimits()).resolves.toBe(1);
    expect(await coverUrls()).toEqual(expect.arrayContaining([B, C]));
    expect(await coverUrls()).not.toContain(A);
    expect(await metaUrls()).not.toContain(A);
  });
});

describe('integración con la biblioteca (initCoverSeeding)', () => {
  beforeEach(() => {
    store.set({ doc: null });
    initCoverSeeding();
  });

  it('addGame con carátula la siembra sin bloquear', async () => {
    await importGames([gameJson('g1', 'Sin portada')]);

    const fetchMock = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', fetchMock);

    await addGame({ title: 'Celeste', today: '2026-08-25', coverUrl: A });

    await vi.waitFor(async () => expect(await coverUrls()).toContain(A), { timeout: 2000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('importar un doc distinto poda las huérfanas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()));

    await importGames([gameJson('g1', 'Uno', A)]);
    await vi.waitFor(async () => expect(await coverUrls()).toContain(A), { timeout: 2000 });

    // Huérfana directa en caché (p. ej. sembrada antes de un import).
    await (await rawCache(COVERS_CACHE)).put(B, okRes());

    await importGames([gameJson('g2', 'Dos', C)]);

    await vi.waitFor(
      async () => expect(new Set(await coverUrls())).toEqual(new Set([C])),
      { timeout: 2000 },
    );
  });

  it('no re-siembra URLs ya intentadas', async () => {
    await importGames([gameJson('g1', 'Sin portada')]);

    const fetchMock = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', fetchMock);

    await addGame({ title: 'Celeste', today: '2026-08-25', coverUrl: A });
    await vi.waitFor(async () => expect(await coverUrls()).toContain(A), { timeout: 2000 });

    const doc = store.get().doc;
    if (!doc) throw new Error('sin documento');
    await updateGame(doc.games[0].id, { title: 'Celeste renombrado' });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
