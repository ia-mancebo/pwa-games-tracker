import { afterEach, describe, expect, it, vi } from 'vitest';
import { IgdbError, createDataSource } from '../src/services/igdb.js';

const WORKER_URL = 'https://gt-proxy.example.workers.dev';

/** Adapter de pruebas: URL fija sin tocar estado global (segundo adapter del seam). */
const testClient = () => createDataSource(() => WORKER_URL);

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
});

describe('configuración de la Conexión (entra por la interface)', () => {
  it('normaliza la URL: recorta espacios y barra final', () => {
    const client = createDataSource(() => `  ${WORKER_URL}/  `);
    expect(client.workerUrl()).toBe(WORKER_URL);
    expect(client.isConfigured()).toBe(true);
  });

  it('sin conexión (cadena vacía) no está configurado y workerUrl es vacía', () => {
    const client = createDataSource(() => '');
    expect(client.workerUrl()).toBe('');
    expect(client.isConfigured()).toBe(false);
  });

  it('una cadena que no es URL http(s) no cuenta como configurada', () => {
    const client = createDataSource(() => 'notaurl');
    expect(client.workerUrl()).toBe('notaurl');
    expect(client.isConfigured()).toBe(false);
  });

  it('el factory acepta cualquier lector: mismo cliente, distinta fuente', () => {
    let url = WORKER_URL;
    const client = createDataSource(() => url);
    expect(client.isConfigured()).toBe(true);
    url = '';
    expect(client.isConfigured()).toBe(false);
  });
});

describe('searchGames', () => {
  it('construye la URL con q codificado y devuelve los resultados parseados', async () => {
    const results = [contractGame(), contractGame({ igdbId: 1020, title: 'Elden Ring' })];
    fetchMock = vi.fn(async () => jsonRes({ results }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testClient().searchGames('celeste 2 & co')).resolves.toEqual(results);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://gt-proxy.example.workers.dev/api/search?q=celeste%202%20%26%20co'
    );
  });

  it('HTTP 500 lanza IgdbError con el mensaje de servicio', async () => {
    fetchMock = vi.fn(async () => jsonRes({ error: 'Error interno del Worker.' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testClient().searchGames('x')).rejects.toMatchObject({
      name: 'IgdbError',
      message: 'No se pudo contactar con el servicio',
    });
  });

  it('fallo de red lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(testClient().searchGames('x')).rejects.toBeInstanceOf(IgdbError);
    await expect(testClient().searchGames('x')).rejects.toMatchObject({
      message: 'No se pudo contactar con el servicio',
    });
  });

  it('JSON malformado (sin results array) lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => jsonRes({ unexpected: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testClient().searchGames('x')).rejects.toBeInstanceOf(IgdbError);
  });

  it('sin servicio configurado lanza IgdbError sin llegar a llamar a fetch', async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createDataSource(() => '').searchGames('x')).rejects.toBeInstanceOf(IgdbError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborta a los 25 s y lanza IgdbError', async () => {
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

      const pending = testClient().searchGames('x');
      const expectation = expect(pending).rejects.toMatchObject({
        name: 'IgdbError',
        message: 'No se pudo contactar con el servicio',
      });
      await vi.advanceTimersByTimeAsync(25_000);
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

    await expect(testClient().fetchNovedades()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gt-proxy.example.workers.dev/api/novedades');
  });

  it('cuerpo sin las secciones esperadas lanza IgdbError', async () => {
    fetchMock = vi.fn(async () => jsonRes({ recientes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testClient().fetchNovedades()).rejects.toMatchObject({
      name: 'IgdbError',
      message: 'No se pudo contactar con el servicio',
    });
  });
});
