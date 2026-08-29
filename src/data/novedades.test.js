/**
 * Módulo de datos de Novedades (src/data/novedades.js) sin DOM: la carga de
 * la Instantánea al slice (ensureNovedadesContent, idempotente) y el refresco
 * escribiendo refreshing/degraded en el slice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../app.js';
import { initLibrary, newLibrary } from './library.js';
import {
  ensureNovedadesContent,
  refreshNovedades,
  resetNovedadesRefresh,
} from './novedades.js';
import { clearSnapshot, saveSnapshot } from './snapshot.js';
import { seedWorkerUrl } from '../../tests/support/connection.js';

const WORKER_URL = 'https://gt-proxy.example.workers.dev';
const NOW = new Date('2026-08-24T10:00:00Z');

/** @type {Map<string, ReturnType<typeof makeCache>>} */
const stores = new Map();

function makeCache() {
  const entries = new Map();
  return {
    entries,
    /** @param {string | { url: string }} req @param {unknown} res */
    async put(req, res) {
      entries.set(typeof req === 'string' ? req : req.url, res);
    },
    /** @param {string | { url: string }} req */
    async match(req) {
      return entries.get(typeof req === 'string' ? req : req.url);
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
    /** @param {string | { url: string }} req */
    async delete(req) {
      return entries.delete(typeof req === 'string' ? req : req.url);
    },
  };
}

function smallBody() {
  return {
    recientes: [
      {
        igdbId: 101,
        title: 'Juego 101',
        releaseDate: '2026-08-01',
        coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co101.jpg',
        description: 'Descripción 101',
        genres: [{ id: 8, name: 'Platform' }],
        platforms: [{ id: 130, name: 'Nintendo Switch' }],
      },
    ],
    proximos: [],
    populares: [],
    esperados: [],
    generatedAt: '2026-08-24T09:30:00.000Z',
  };
}

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, status: number, json: () => Promise<unknown> }}
 */
function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * @param {unknown} [body]
 * @returns {import('vitest').Mock}
 */
function stubFetch(body = smallBody()) {
  const mock = vi.fn(
    /** @param {string} url */
    async (url) => {
      if (String(url).includes('/api/')) return jsonRes(body);
      return { ok: true, status: 200 };
    }
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** @param {boolean} value */
function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

beforeEach(async () => {
  document.body.innerHTML = '';
  stores.clear();
  resetNovedadesRefresh();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    novedades: { section: null, genre: null, detail: null },
    novedadesUi: {
      snapshot: null,
      loading: false,
      refreshing: false,
      degraded: null,
      adding: false,
    },
  });
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
  await initLibrary();
  await newLibrary(NOW);
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('ensureNovedadesContent', () => {
  it('siembra loading, carga la Instantánea desde IDB al slice y apaga loading', async () => {
    await saveSnapshot(smallBody());
    const p = ensureNovedadesContent();
    expect(store.get().novedadesUi.loading).toBe(true);
    await p;
    expect(store.get().novedadesUi.loading).toBe(false);
    expect(store.get().novedadesUi.snapshot?.recientes).toHaveLength(1);
  });

  it('sin instantánea en IDB deja el slice en null y apaga loading', async () => {
    await ensureNovedadesContent();
    expect(store.get().novedadesUi.loading).toBe(false);
    expect(store.get().novedadesUi.snapshot).toBeNull();
  });

  it('es idempotente: una segunda llamada no vuelve a leer IDB', async () => {
    await saveSnapshot(smallBody());
    await ensureNovedadesContent();
    await clearSnapshot();
    await ensureNovedadesContent();
    expect(store.get().novedadesUi.snapshot?.recientes).toHaveLength(1);
  });
});

describe('refreshNovedades', () => {
  it('escribe refreshing en vuelo y al terminar degraded null + snapshot nuevo', async () => {
    seedWorkerUrl(WORKER_URL);
    stubFetch();
    const p = refreshNovedades();
    expect(store.get().novedadesUi.refreshing).toBe(true);
    await p;
    expect(store.get().novedadesUi.refreshing).toBe(false);
    expect(store.get().novedadesUi.degraded).toBeNull();
    expect(store.get().novedadesUi.snapshot?.recientes).toHaveLength(1);
  });

  it('sin conexión escribe degraded offline y conserva la instantánea', async () => {
    seedWorkerUrl(WORKER_URL);
    await saveSnapshot(smallBody());
    await ensureNovedadesContent();
    setOnline(false);
    await refreshNovedades();
    expect(store.get().novedadesUi.degraded).toBe('offline');
    expect(store.get().novedadesUi.snapshot?.recientes).toHaveLength(1);
  });

  it('sin servicio configurado escribe degraded unconfigured', async () => {
    await refreshNovedades();
    expect(store.get().novedadesUi.degraded).toBe('unconfigured');
  });

  it('fallo del servicio escribe degraded service-error', async () => {
    seedWorkerUrl(WORKER_URL);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await refreshNovedades();
    expect(store.get().novedadesUi.degraded).toBe('service-error');
  });
});