import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import {
  refreshNovedades,
  autoRefreshIfNeeded,
  initNovedadesRetry,
  resetNovedadesRefresh,
} from '../src/data/novedades.js';
import { getSnapshot, saveSnapshot } from '../src/data/snapshot.js';
import { setWorkerUrl } from '../src/services/igdb.js';
import { COVERS_CACHE } from '../src/data/covers.js';
import { store } from '../src/app.js';
import { initLibrary, newLibrary, importDoc } from '../src/data/library.js';
import { render as renderView, resetNovedadesView } from '../src/views/novedades.js';
import { qs, qsa } from '../src/lib/dom.js';

const WORKER_URL = 'https://gt-proxy.example.workers.dev';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date('2026-08-24T10:00:00Z');

/** @type {Map<string, ReturnType<typeof makeCache>>} */
const stores = new Map();

/** Limpieza del listener de reintento del test actual. @type {(() => void)|null} */
let retryCleanup = null;

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

/**
 * @param {number} igdbId
 * @param {{ title?: string, coverUrl?: string|null, releaseDate?: string|null, genres?: {id:number,name:string}[] }} [extra]
 */
function novGame(igdbId, extra = {}) {
  return {
    igdbId,
    title: `Juego ${igdbId}`,
    releaseDate: '2026-08-01',
    coverUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/co${igdbId}.jpg`,
    description: `Descripción ${igdbId}`,
    genres: [{ id: 8, name: 'Platform' }],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
    ...extra,
  };
}

/** Tablón con la composición exacta 12/12/6/6 (worker/CONTRACT.md). */
function fullBody() {
  return {
    recientes: Array.from({ length: 12 }, (_, i) => novGame(100 + i)),
    proximos: Array.from({ length: 12 }, (_, i) => novGame(200 + i, { releaseDate: '2026-12-01' })),
    populares: Array.from({ length: 6 }, (_, i) => novGame(300 + i)),
    esperados: Array.from({ length: 6 }, (_, i) => novGame(400 + i)),
    generatedAt: '2026-08-24T09:30:00.000Z',
  };
}

/** Cuerpo pequeño para tests de lógica. */
function smallBody() {
  return {
    recientes: [novGame(101)],
    proximos: [novGame(202)],
    populares: [novGame(303)],
    esperados: [novGame(404)],
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
 * Stub global de fetch: /api/* responde el cuerpo dado; las imágenes del CDN
 * responden 200 para la siembra de carátulas.
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

/**
 * Sombrea navigator.onLine (restaurable en afterEach).
 * @param {boolean} value
 */
function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

/**
 * Reescribe savedAt de la instantánea guardada para simular antigüedad
 * (saveSnapshot sella siempre con el reloj real; se escribe por IDB directo).
 * @param {number} ageMs
 */
async function ageSnapshot(ageMs) {
  const snap = await getSnapshot();
  if (!snap) throw new Error('sin instantánea que envejecer');
  const { openDb } = await import('../src/data/db.js');
  const db = await openDb();
  try {
    const tx = db.transaction('novedades', 'readwrite');
    tx.objectStore('novedades').put(
      { ...snap, savedAt: new Date(Date.now() - ageMs).toISOString() },
      'snapshot'
    );
    await new Promise((resolve, reject) => {
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
  } finally {
    db.close();
  }
}

/**
 * Renderiza la vista en un contenedor limpio y espera a que la instantánea
 * cargada sustituya el marcador de carga. Suscribe el render al store para
 * que drill-down y filtros repinten como en la app real.
 * @returns {Promise<HTMLElement>}
 */
async function renderBoard() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  store.subscribe(() => renderView(root, store));
  renderView(root, store);
  await vi.waitFor(() => {
    if (!qs('[data-nov]', root)) throw new Error('vista sin cargar');
  });
  return root;
}

/** @param {string[]} games */
async function seedLibrary(games) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: games.map((title) => ({
      id: `g-${title}`,
      title,
      plays: [{ id: `${title}-p1`, status: 'backlog', addedAt: '2026-06-01' }],
    })),
  });
}

/**
 * @param {Element | null} el
 * @returns {HTMLElement}
 */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

/**
 * Llamadas del mock a rutas /api/* (las imágenes sembradas no cuentan).
 * @param {import('vitest').Mock} fetchMock
 * @returns {string[]} urls de API llamadas
 */
function apiCalls(fetchMock) {
  return fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes('/api/'));
}

beforeEach(async () => {
  window.localStorage.removeItem('gt.workerUrl');
  document.body.innerHTML = '';
  stores.clear();
  resetNovedadesRefresh();
  resetNovedadesView();
  retryCleanup?.();
  retryCleanup = null;
  setOnline(true);
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
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    novedades: { section: null, genre: null },
  });
  await initLibrary();
  await newLibrary(NOW);
});

afterEach(() => {
  retryCleanup?.();
  retryCleanup = null;
  resetNovedadesView();
  vi.unstubAllGlobals();
  setOnline(true);
  window.localStorage.removeItem('gt.workerUrl');
});

describe('refreshNovedades', () => {
  it('con servicio y conexión guarda la instantánea y siembra carátulas', async () => {
    setWorkerUrl(WORKER_URL);
    const fetchMock = stubFetch();

    await expect(refreshNovedades()).resolves.toEqual({ status: 'ok' });

    expect(apiCalls(fetchMock)).toEqual([`${WORKER_URL}/api/novedades`]);
    const snap = await getSnapshot();
    expect(snap?.recientes).toHaveLength(1);
    expect(Number.isNaN(Date.parse(/** @type {string} */ (snap?.savedAt)))).toBe(false);
    const coverUrl = smallBody().recientes[0].coverUrl;
    await vi.waitFor(async () => {
      const covers = await /** @type {any} */ (caches).open(COVERS_CACHE);
      expect(covers.entries.has(coverUrl)).toBe(true);
    });
  });

  it('sin conexión no toca la red ni la instantánea', async () => {
    setWorkerUrl(WORKER_URL);
    setOnline(false);
    const fetchMock = stubFetch();

    await expect(refreshNovedades()).resolves.toEqual({ status: 'offline' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSnapshot()).toBeNull();
  });

  it('sin servicio configurado devuelve unconfigured sin llamar a la red', async () => {
    const fetchMock = stubFetch();

    await expect(refreshNovedades()).resolves.toEqual({ status: 'unconfigured' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fallo de red o HTTP se degrada a service-error', async () => {
    setWorkerUrl(WORKER_URL);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(refreshNovedades()).resolves.toEqual({ status: 'service-error' });
    expect(await getSnapshot()).toBeNull();
  });

  it('respuesta malformada del Worker también es service-error', async () => {
    setWorkerUrl(WORKER_URL);
    stubFetch({ recientes: 'no-soy-array' });

    await expect(refreshNovedades()).resolves.toEqual({ status: 'service-error' });
    expect(await getSnapshot()).toBeNull();
  });
});

describe('autoRefreshIfNeeded', () => {
  it('sin instantánea refresca aunque la sesión sea reciente', async () => {
    setWorkerUrl(WORKER_URL);
    const fetchMock = stubFetch();

    await autoRefreshIfNeeded();

    expect(apiCalls(fetchMock)).toHaveLength(1);
    expect(await getSnapshot()).not.toBeNull();
  });

  it('instantánea fresca (<12 h): no vuelve a la red', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(smallBody());
    const fetchMock = stubFetch();

    await autoRefreshIfNeeded();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('instantánea >12 h y conexión: refresca en silencio', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(smallBody());
    await ageSnapshot(13 * HOUR_MS);
    const fetchMock = stubFetch();

    await autoRefreshIfNeeded();

    expect(apiCalls(fetchMock)).toHaveLength(1);
  });

  it('instantánea >12 h pero sin conexión: no intenta nada', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(smallBody());
    await ageSnapshot(13 * HOUR_MS);
    setOnline(false);
    const fetchMock = stubFetch();

    await autoRefreshIfNeeded();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('initNovedadesRetry', () => {
  it('al volver la red reintenta en silencio si el último intento falló', async () => {
    setWorkerUrl(WORKER_URL);
    setOnline(false);
    await refreshNovedades();
    retryCleanup = initNovedadesRetry();

    setOnline(true);
    const fetchMock = stubFetch();
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect(await getSnapshot()).not.toBeNull());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/novedades');
  });

  it('no reintenta si el último intento no falló', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(smallBody());
    retryCleanup = initNovedadesRetry();

    const fetchMock = stubFetch();
    window.dispatchEvent(new Event('online'));

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('vista Novedades', () => {
  it('pinta las cuatro secciones 12/12/6/6 y el sello permanente', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());

    const root = await renderBoard();

    /** @type {[string, number][]} */
    const expected = [
      ['recientes', 12],
      ['proximos', 12],
      ['populares', 6],
      ['esperados', 6],
    ];
    for (const [key, count] of expected) {
      expect(qsa(`[data-section-row="${key}"] .card`, root)).toHaveLength(count);
    }
    expect(qs('[data-stamp]', root)?.textContent).toContain('Actualizado:');
  });

  it('el botón manual Actualiza: vuelve a la red y repinta desde la instantánea', async () => {
    setWorkerUrl(WORKER_URL);
    stubFetch(fullBody());
    const root = await renderBoard();

    btn(qs('[data-refresh]', root)).click();

    await vi.waitFor(() => expect(qsa('.card', root)).toHaveLength(36));
  });

  it('sin conexión sirve la instantánea con banda «Sin conexión» y Reintentar', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());
    setOnline(false);

    const root = await renderBoard();

    const banner = qs('[data-nbanner]', root);
    expect(banner?.textContent).toContain('Sin conexión');
    expect(qs('[data-retry]', banner ?? root)).toBeTruthy();
    expect(qsa('.card', root)).toHaveLength(36);
  });

  it('fallo del servicio tras reintentar muestra la banda del servicio', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const root = await renderBoard();

    btn(qs('[data-retry]', root) ?? qs('[data-refresh]', root)).click();

    await vi.waitFor(() => {
      const banner = qs('[data-nbanner]', root);
      if (!banner || !banner.textContent?.includes('No se pudo contactar con el servicio')) {
        throw new Error('banda de servicio aún ausente');
      }
    });
  });

  it('sin instantánea y sin conexión muestra el estado vacío de primera vez', async () => {
    setWorkerUrl(WORKER_URL);
    setOnline(false);

    const root = await renderBoard();

    expect(qs('.empty', root)?.textContent).toContain(
      'Novedades necesita conexión la primera vez para descargar el calendario'
    );
    expect(qs('[data-retry]', root)).toBeTruthy();
    expect(qs('[data-section-row="recientes"]', root)).toBeNull();
  });

  it('sin servicio configurado apunta a Datos y deshabilita Actualizar', async () => {
    const root = await renderBoard();

    expect(root.textContent).toContain('Datos');
    const refresh = qs('[data-refresh]', root);
    expect(refresh?.hasAttribute('disabled')).toBe(true);
  });

  it('instantánea >7 días levanta la banda destacada sin bloquear el tablón', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());
    await ageSnapshot(8 * DAY_MS);

    const root = await renderBoard();

    expect(qs('[data-nbanner].warn', root)?.textContent).toContain('7 días');
    expect(qsa('.card', root)).toHaveLength(36);
  });

  it('«➕ Quiero jugarlo» crea el juego local como Quiero jugar y el botón cambia', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());
    const root = await renderBoard();

    btn(qs('[data-section-row="recientes"] .card', root)).click();
    await vi.waitFor(() => expect(qs('.add-sheet', document.body)).toBeTruthy());

    btn(qs('[data-want-play]', document.body)).click();

    await vi.waitFor(() => {
      const sheet = qs('.add-sheet', document.body);
      if (!sheet?.textContent?.includes('Ya en tu biblioteca')) {
        throw new Error('botón aún sin cambiar');
      }
    });
    const game = store.get().doc?.games[0];
    expect(game?.title).toBe('Juego 100');
    expect(game?.igdbId).toBe(100);
    expect(game?.plays[0]?.status).toBe('backlog');
    expect(game?.description).toBe('Descripción 100');
    expect(game?.genres).toEqual([{ id: 8, name: 'Platform' }]);
    expect(game?.platforms).toEqual([{ id: 130, name: 'Nintendo Switch' }]);
    expect(game?.plays[0]?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('título equivalente en biblioteca → «Ya en tu biblioteca» sin duplicar', async () => {
    setWorkerUrl(WORKER_URL);
    await saveSnapshot(fullBody());
    await seedLibrary(['juego 100']);
    const root = await renderBoard();

    btn(qs('[data-section-row="recientes"] .card', root)).click();

    await vi.waitFor(() => expect(qs('.add-sheet', document.body)).toBeTruthy());
    expect(qs('[data-want-play]', document.body)).toBeNull();
    expect(document.body.textContent).toContain('Ya en tu biblioteca');
    expect(store.get().doc?.games).toHaveLength(1);
  });

  it('la placa despliega la lista, los chips de género filtran y «← Novedades» vuelve', async () => {
    setWorkerUrl(WORKER_URL);
    const body = fullBody();
    body.recientes[1] = novGame(111, { genres: [{ id: 12, name: 'RPG' }] });
    await saveSnapshot(body);
    const root = await renderBoard();

    btn(qs('[data-nsection="recientes"]', root)).click();

    await vi.waitFor(() => {
      if (store.get().novedades.section !== 'recientes') throw new Error('sección aún cerrada');
    });
    expect(qsa('.b-row[data-ndetail]', root)).toHaveLength(12);

    btn(qs('[data-ngenre="RPG"]', root)).click();
    await vi.waitFor(() => qsa('.b-row[data-ndetail]', root).length < 12);
    expect(qsa('.b-row[data-ndetail]', root)).toHaveLength(1);
    expect(store.get().novedades.genre).toBe('RPG');

    btn(qs('[data-nback]', root)).click();
    await vi.waitFor(() => {
      if (store.get().novedades.section !== null) throw new Error('drill-down aún abierto');
    });
    expect(qs('[data-section-row="recientes"]', root)).toBeTruthy();
  });
});
