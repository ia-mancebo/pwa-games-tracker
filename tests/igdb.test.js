import { afterEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import {
  IgdbError,
  fetchNovedades,
  getWorkerUrl,
  isConfigured,
  searchGames,
  setWorkerUrl,
} from '../src/services/igdb.js';

/** @type {import('vitest').Mock} */
let fetchMock;

/**
 * @param {unknown} body
 * @param {{ ok?: boolean, status?: number }} [opts]
 * @returns {{ ok: boolean, status: number, json: () => Promise<unknown> }}
 */
function jsonRes(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/**
 * Resultado de búsqueda con la forma del contrato del Worker.
 * @param {Partial<{igdbId: number, title: string}>} [overrides]
 */
function contractGame(overrides = {}) {
  return {
    igdbId: 1877,
    title: 'Celeste',
    releaseDate: '2018-01-25',
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1nij.jpg',
    description: 'Un plataformas para quienes están decididos a escalar.',
    genres: [{ id: 8, name: 'Platform' }],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem('gt.workerUrl');
});

describe('configuración del Worker (localStorage)', () => {
  it('sin configuración previa devuelve cadena vacía y no está configurado', () => {
    expect(getWorkerUrl()).toBe('');
    expect(isConfigured()).toBe(false);
  });

  it('setWorkerUrl recorta espacios y barra final; round-trip con localStorage y isConfigured', () => {
    setWorkerUrl('  https://gt-proxy.example.workers.dev/  ');
    expect(getWorkerUrl()).toBe('https://gt-proxy.example.workers.dev');
    expect(window.localStorage.getItem('gt.workerUrl')).toBe('https://gt-proxy.example.workers.dev');
    expect(isConfigured()).toBe(true);

    setWorkerUrl('   ');
    expect(getWorkerUrl()).toBe('');
    expect(window.localStorage.getItem('gt.workerUrl')).toBeNull();
    expect(isConfigured()).toBe(false);
  });

  it('una cadena que no es URL http(s) no cuenta como configurada', () => {
    setWorkerUrl('notaurl');
    expect(getWorkerUrl()).toBe('notaurl');
    expect(isConfigured()).toBe(false);
  });
});

describe('searchGames', () => {
  it('construye la URL con q codificado y devuelve los resultados parseados', async () => {
    const results = [contractGame(), contractGame({ igdbId: 1020, title: 'Elden Ring' })];
    fetchMock = vi.fn(async () => jsonRes({ results }));
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(searchGames('celeste 2 & co')).resolves.toEqual(results);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://gt-proxy.example.workers.dev/api/search?q=celeste%202%20%26%20co'
    );
  });

  it('HTTP 500 lanza IgdbError con el mensaje de servicio', async () => {
    fetchMock = vi.fn(async () => jsonRes({ error: 'Error interno del Worker.' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(searchGames('x')).rejects.toMatchObject({
      name: 'IgdbError',
      message: 'No se pudo contactar con el servicio',
    });
  });

  it('fallo de red lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(searchGames('x')).rejects.toBeInstanceOf(IgdbError);
    await expect(searchGames('x')).rejects.toMatchObject({
      message: 'No se pudo contactar con el servicio',
    });
  });

  it('JSON malformado (sin results array) lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => jsonRes({ unexpected: true }));
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(searchGames('x')).rejects.toBeInstanceOf(IgdbError);
  });

  it('sin servicio configurado lanza IgdbError sin llegar a llamar a fetch', async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchGames('x')).rejects.toBeInstanceOf(IgdbError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborta a los 10 s y lanza IgdbError', async () => {
    vi.useFakeTimers();
    try {
      fetchMock = vi.fn(
        /** @param {string} _url @param {RequestInit} [init] */
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new window.DOMException('Abortado', 'AbortError'))
            );
          })
      );
      vi.stubGlobal('fetch', fetchMock);
      setWorkerUrl('https://gt-proxy.example.workers.dev');

      const pending = searchGames('x');
      const expectation = expect(pending).rejects.toMatchObject({
        name: 'IgdbError',
        message: 'No se pudo contactar con el servicio',
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchNovedades', () => {
  it('devuelve el cuerpo del tablón cuando trae las cuatro secciones', async () => {
    const body = {
      recientes: [contractGame({ igdbId: 246938, title: 'Hollow Knight: Silksong' })],
      proximos: [],
      populares: [contractGame({ igdbId: 1020, title: 'Elden Ring' })],
      esperados: [],
      generatedAt: '2026-08-24T09:30:00.000Z',
    };
    fetchMock = vi.fn(async () => jsonRes(body));
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(fetchNovedades()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gt-proxy.example.workers.dev/api/novedades');
  });

  it('cuerpo sin las secciones esperadas lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => jsonRes({ recientes: [] }));
    vi.stubGlobal('fetch', fetchMock);
    setWorkerUrl('https://gt-proxy.example.workers.dev');

    await expect(fetchNovedades()).rejects.toMatchObject({
      name: 'IgdbError',
      message: 'No se pudo contactar con el servicio',
    });
  });
});
