import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { addGame, importDoc } from '../src/data/library.js';
import {
  markConnected,
  pickAndConnect,
  reconnect,
  resetFilelink,
  resolveConflict,
  saveNow,
  setConflictHandler,
  startAutosave,
} from '../src/data/filelink.js';
import { setHandle, getHandle } from '../src/services/fsa.js';
import { sha256Hex } from '../src/services/hash.js';
import { isConflictOpen, openConflict, closeConflict } from '../src/ui/conflictDialog.js';
import { qs, qsa } from '../src/lib/dom.js';

const TODAY = '2026-08-24';

/** Forma mínima tipada de un vuelco parseado. @typedef {{ games: { title: string }[], updatedAt: string }} DumpedDoc */

/** @param {string} text @returns {DumpedDoc} */
function parseDump(text) {
  return /** @type {DumpedDoc} */ (JSON.parse(text));
}

const FILE_V1_TEXT = JSON.stringify({
  schema: 'game-tracker',
  version: 1,
  updatedAt: '2026-08-20T09:30:00Z',
  games: [{ id: 'g1', title: 'Hades', plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-08-01' }] }],
});

const FILE_V2_TEXT = JSON.stringify({
  schema: 'game-tracker',
  version: 1,
  updatedAt: '2026-08-23T18:30:00Z',
  games: [
    { id: 'g9', title: 'Celeste', plays: [{ id: 'g9-p1', status: 'finished', addedAt: '2026-08-02', rating: 5 }] },
  ],
});

// Capturado antes de usar timers falsos: permite ceder el bucle de eventos real.
const realSetTimeout = setTimeout;

/**
 * Cede macrotareas reales para que IDB (setImmediate) y crypto terminen.
 */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => {
      realSetTimeout(resolve, 0);
    });
  }
}

/**
 * @param {string} initialText
 * @param {{ failWrites?: boolean }} [options]
 * @returns {{ name: string, setText(next: string): void, readonly writes: number, readonly captured: string | null,
 *   getFile(): Promise<File>, createWritable(): Promise<{write(data: string): Promise<void>, close(): Promise<void>}>,
 *   requestPermission(options?: { mode: string }): Promise<string> }}
 */
function makeHandle(initialText, options = {}) {
  const state = { text: initialText, writes: 0, captured: /** @type {string | null} */ (null), fail: options.failWrites === true };
  return {
    name: 'game-tracker.json',
    setText(next) {
      state.text = next;
    },
    get writes() {
      return state.writes;
    },
    get captured() {
      return state.captured;
    },
    async getFile() {
      return new File([state.text], 'game-tracker.json', { type: 'application/json' });
    },
    async createWritable() {
      if (state.fail) throw new Error('disco lleno');
      state.writes += 1;
      return {
        async write(data) {
          state.captured = data;
          // El archivo en disco refleja la escritura (como createWritable real):
          // los vuelcos siguientes pre-chequean el hash contra este contenido.
          state.text = data;
        },
        async close() {},
      };
    },
    async requestPermission() {
      return 'granted';
    },
  };
}

/**
 * Conecta un archivo ya existente como espejo: importa el texto, guarda el
 * handle de sesión y marca la sesión conectada.
 * @param {string} text
 * @param {ReturnType<typeof makeHandle>} handle
 */
async function connectFile(text, handle) {
  const hash = await sha256Hex(text);
  await importDoc(text, { hash, fileName: 'game-tracker.json' });
  setHandle(/** @type {any} */ (handle));
  markConnected('game-tracker.json');
}

/**
 * Escenario de conflicto: espejo sobre V1, archivo externo en V2 y una
 * mutación local sin volcar.
 */
async function seedConflict() {
  const handle = makeHandle(FILE_V2_TEXT);
  await connectFile(FILE_V1_TEXT, handle);
  await addGame({ title: 'Extra', today: TODAY });
  return handle;
}

function mountApp() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  createApp(root);
  return root;
}

/**
 * @param {Element | null} el
 * @returns {HTMLElement}
 */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

function grantFsa() {
  /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([]);
}

function revokeFsa() {
  delete /** @type {any} */ (window).showOpenFilePicker;
}

beforeEach(() => {
  document.body.innerHTML = '';
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false },
    ready: false,
  });
  resetFilelink();
});

afterEach(() => {
  closeConflict();
  resetFilelink();
  revokeFsa();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pickAndConnect (elección deliberada, §5.5)', () => {
  it('conecta vía picker FSA: importa, fija hash base y deja la sesión conectada', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    grantFsa();
    /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([handle]);

    const res = await pickAndConnect();

    expect(res.status).toBe('connected');
    expect(getHandle()).toBe(handle);
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Hades']);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(FILE_V1_TEXT));
    expect(store.get().meta.connectedFileName).toBe('game-tracker.json');
    expect(store.get().file).toEqual({
      status: 'connected',
      name: 'game-tracker.json',
      error: null,
      conflict: null,
      saving: false,
    });
  });

  it('cancelar el picker (AbortError) es silencioso y no cambia nada', async () => {
    grantFsa();
    const err = new Error('cancelado');
    err.name = 'AbortError';
    /** @type {any} */ (window).showOpenFilePicker = () => Promise.reject(err);

    const res = await pickAndConnect();

    expect(res.status).toBe('cancelled');
    expect(store.get().doc).toBeNull();
    expect(store.get().file.status).toBe('disconnected');
  });

  it('un candidato inválido da error, no toca el espejo y no deja handle colgando', async () => {
    grantFsa();
    const handle = makeHandle('{{ no es json');
    /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([handle]);

    const res = await pickAndConnect();

    expect(res.status).toBe('error');
    expect(store.get().doc).toBeNull();
    expect(getHandle()).toBeNull();
    expect(store.get().file.status).toBe('disconnected');
  });

  it('sin FSA cae al input universal: importa y devuelve imported sin conectar', async () => {
    revokeFsa();
    const file = new File([FILE_V1_TEXT], 'game-tracker.json', { type: 'application/json' });
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLInputElement && el.type === 'file') {
        Object.defineProperty(el, 'files', { value: [file], configurable: true });
        realSetTimeout(() => el.dispatchEvent(new Event('change')), 0);
      }
      return originalAppend(el);
    });
    try {
      const res = await pickAndConnect();

      expect(res.status).toBe('imported');
      expect(res.name).toBe('game-tracker.json');
      expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Hades']);
      // Sin handle no hay vuelco posible: la sesión NO queda conectada.
      expect(store.get().file.status).toBe('disconnected');
    } finally {
      appendSpy.mockRestore();
    }
  });
});

describe('saveNow (vuelco verificado, §5.4)', () => {
  it('escribe el documento serializado y limpia dirty solo tras el éxito', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });

    const res = await saveNow();

    expect(res.status).toBe('saved');
    expect(handle.writes).toBe(1);
    const dumped = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped.games.map((g) => g.title)).toEqual(['Hades', 'Hades II']);
    expect(dumped.updatedAt).toBe(store.get().doc?.updatedAt);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(/** @type {string} */ (handle.captured)));
    expect(store.get().file.status).toBe('connected');
  });

  it('fallo de escritura: pastilla de error, el espejo sigue dirty y la app funciona', async () => {
    const handle = makeHandle(FILE_V1_TEXT, { failWrites: true });
    await connectFile(FILE_V1_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });
    const docBefore = store.get().doc;

    const res = await saveNow();

    expect(res.status).toBe('error');
    expect(store.get().file).toMatchObject({ status: 'error', error: 'disco lleno' });
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().doc).toEqual(docBefore);
    expect(handle.captured).toBeNull();

    // Reintentar tras arreglar la escritura recupera la sesión.
    handle.setText(FILE_V1_TEXT);
    const fixed = makeHandle(FILE_V1_TEXT);
    setHandle(/** @type {any} */ (fixed));
    const retried = await saveNow();
    expect(retried.status).toBe('saved');
    expect(store.get().file.status).toBe('connected');
    expect(store.get().meta.dirty).toBe(false);
  });

  it('archivo cambió fuera + cambios sin volcar → conflicto SIN escribir', async () => {
    const handle = await seedConflict();

    const res = await saveNow();

    expect(res.status).toBe('conflict');
    expect(res.fileDoc?.updatedAt).toBe('2026-08-23T18:30:00Z');
    expect(handle.writes).toBe(0);
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().doc?.games.some((g) => g.title === 'Extra')).toBe(true);
  });

  it('archivo cambió fuera + estado limpio → recarga del archivo, sin sobrescribir', async () => {
    const handle = makeHandle(FILE_V2_TEXT);
    await connectFile(FILE_V1_TEXT, handle);

    const res = await saveNow();

    expect(res.status).toBe('reloaded');
    expect(handle.writes).toBe(0);
    expect(store.get().doc?.games[0].title).toBe('Celeste');
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(FILE_V2_TEXT));
  });

  it('sin enlace activo es un no-op (skipped)', async () => {
    await connectFile(FILE_V1_TEXT, makeHandle(FILE_V1_TEXT));
    await addGame({ title: 'Hades II', today: TODAY });
    setHandle(null);

    const res = await saveNow();

    expect(res.status).toBe('skipped');
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().file.status).toBe('connected');
  });

  it('mientras un vuelco está en marcha, otro saveNow devuelve busy', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    let release = () => {};
    const gate = new Promise((r) => {
      release = /** @type {() => void} */ (r);
    });
    const originalGetFile = handle.getFile.bind(handle);
    handle.getFile = async () => {
      await gate;
      return originalGetFile();
    };

    await addGame({ title: 'Hades II', today: TODAY });
    const first = saveNow();
    await settle();
    expect(store.get().file.saving).toBe(true);

    const res = await saveNow();
    expect(res.status).toBe('busy');

    release();
    await settle();
    expect((await first).status).toBe('saved');
    expect(store.get().file.saving).toBe(false);
  });
});

describe('reconexión (§5.3)', () => {
  it('mismo hash + pendientes → sesión normal volcando lo pendiente', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });

    const res = await reconnect();

    expect(res.status).toBe('connected');
    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    const dumped = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped.games.map((g) => g.title)).toEqual(['Hades', 'Hades II']);
    expect(store.get().file.status).toBe('connected');
  });

  it('distinto hash + limpio → recarga limpia del archivo, sin diálogo', async () => {
    grantFsa();
    const spy = vi.fn();
    setConflictHandler(spy);
    const handle = makeHandle(FILE_V2_TEXT);
    await connectFile(FILE_V1_TEXT, makeHandle(FILE_V1_TEXT));
    setHandle(/** @type {any} */ (handle));

    const res = await reconnect();

    expect(res.status).toBe('connected');
    expect(spy).not.toHaveBeenCalled();
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(FILE_V2_TEXT));
  });

  it('distinto hash + dirty → conflicto real con el doc del archivo y el local intacto', async () => {
    grantFsa();
    const handle = await seedConflict();

    const res = await reconnect();

    expect(res.status).toBe('conflict');
    expect(res.fileDoc).toEqual(JSON.parse(FILE_V2_TEXT));
    expect(handle.writes).toBe(0);
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().doc?.games.some((g) => g.title === 'Extra')).toBe(true);
    // El conflicto queda pendiente y se puede resolver manteniendo los locales.
    const solved = await resolveConflict('local');
    expect(solved.status).toBe('resolved');
    expect(store.get().meta.dirty).toBe(false);
  });

  it('permiso denegado → denied y todo queda como estaba', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT);
    handle.requestPermission = async () => 'denied';
    await connectFile(FILE_V1_TEXT, handle);

    const res = await reconnect();

    expect(res.status).toBe('denied');
    expect(handle.writes).toBe(0);
    expect(store.get().file.status).toBe('connected');
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Hades']);
  });

  it('sin handle de sesión delega en el picker (elección deliberada)', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V2_TEXT);
    await importDoc(FILE_V1_TEXT, { hash: await sha256Hex(FILE_V1_TEXT), fileName: 'game-tracker.json' });
    /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([handle]);

    const res = await reconnect();

    expect(res.status).toBe('connected');
    expect(getHandle()).toBe(handle);
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().file.status).toBe('connected');
  });
});

describe('resolveConflict (§5.5)', () => {
  it('«usar la versión del archivo» importa la versión externa', async () => {
    await seedConflict();
    expect((await saveNow()).status).toBe('conflict');

    const res = await resolveConflict('file');

    expect(res.status).toBe('resolved');
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(FILE_V2_TEXT));
    expect(store.get().file.status).toBe('connected');
  });

  it('«mantener mis cambios» sobrescribe el archivo con lo local (forzado)', async () => {
    const handle = await seedConflict();
    expect((await saveNow()).status).toBe('conflict');

    const res = await resolveConflict('local');

    expect(res.status).toBe('resolved');
    expect(handle.writes).toBe(1);
    const dumped = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped.games.some((g) => g.title === 'Extra')).toBe(true);
    expect(dumped.updatedAt).toBe(store.get().doc?.updatedAt);
    expect(store.get().meta.dirty).toBe(false);
  });

  it('«descargar copia local» crea el blob URL con nombre fechado y NO resuelve', async () => {
    const handle = await seedConflict();
    expect((await saveNow()).status).toBe('conflict');
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    /** @type {Blob[]} */
    const createdBlobs = [];
    /** @param {Blob} blob */
    urlApi.createObjectURL = (blob) => {
      createdBlobs.push(blob);
      return 'blob:test-url';
    };
    urlApi.revokeObjectURL = () => {};
    const anchors = /** @type {HTMLElement[]} */ ([]);
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((el) => {
        if (el instanceof HTMLElement && el.tagName === 'A') anchors.push(el);
        return originalAppend(el);
      });

    try {
      const res = await resolveConflict('download');

      expect(res.status).toBe('downloaded');
      expect(createdBlobs).toHaveLength(1);
      expect(createdBlobs[0]).toBeInstanceOf(Blob);
      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute('download')).toMatch(/^game-tracker-conflicto-\d{4}-\d{2}-\d{2}\.json$/);
      // No resuelve: sigue pendiente, el estado local no cambia.
      expect(handle.writes).toBe(0);
      expect(store.get().meta.dirty).toBe(true);
      expect(store.get().doc?.games.some((g) => g.title === 'Extra')).toBe(true);
      // Y después se puede resolver normalmente.
      expect((await resolveConflict('local')).status).toBe('resolved');
    } finally {
      appendSpy.mockRestore();
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });

  it('sin conflicto pendiente devuelve none', async () => {
    const res = await resolveConflict('file');
    expect(res.status).toBe('none');
  });
});

describe('autoguardado (§5.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('agenda el vuelco 3 s tras el ÚLTIMO cambio y escribe una sola vez', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startAutosave();

    await addGame({ title: 'Hades II', today: TODAY });
    vi.advanceTimersByTime(2000);
    expect(handle.writes).toBe(0);

    await addGame({ title: 'Hades III', today: TODAY });
    vi.advanceTimersByTime(2999);
    expect(handle.writes).toBe(0);

    vi.advanceTimersByTime(1);
    await settle();

    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    const dumped = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped.games.map((g) => g.title)).toEqual(['Hades', 'Hades II', 'Hades III']);
  });

  it('ocultar la pestaña conectado y sucio dispara un intento inmediato', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    startAutosave();
    await addGame({ title: 'Hades II', today: TODAY });
    expect(handle.writes).toBe(0);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete /** @type {any} */ (document).visibilityState;
    }
    await settle();

    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
  });

  it('vuelve a volcar al recuperar visibilidad tras un vuelco oculto congelado (Android)', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startAutosave();

    // Camino sano: el debounce de 3 s vuelca sin intervención.
    await addGame({ title: 'Hades II', today: TODAY });
    vi.advanceTimersByTime(3000);
    await settle();
    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    // El archivo en disco refleja el último vuelco (hash base coherente).
    handle.setText(JSON.stringify(store.get().doc));

    // Escenario rojo: mutar, ocultar la pestaña y congelar el vuelco oculto.
    await addGame({ title: 'Hades III', today: TODAY });
    expect(store.get().meta.dirty).toBe(true);

    // El handle se congela: getFile nunca resuelve (página congelada por
    // Chrome Android a mitad del vuelco oculto).
    const frozen = new Promise(() => {});
    const originalGetFile = handle.getFile.bind(handle);
    handle.getFile = () => frozen;

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete /** @type {any} */ (document).visibilityState;
    }
    // Deja que el vuelco oculto llegue al getFile congelado (sha256Hex es
    // async): el saveNow queda colgado con saving=true. NO avanzamos el debounce.
    await settle();

    // Restaura el handle y vuelve a visible + foco.
    handle.getFile = originalGetFile;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete /** @type {any} */ (document).visibilityState;
    }
    window.dispatchEvent(new Event('focus'));
    await settle();

    // Sin intervención humana, el archivo debe volcarse.
    expect(handle.writes).toBe(2);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().file.saving).toBe(false);
  });

  it('una mutación durante el vuelco NO se marca como volcada: dirty sigue y el siguiente autoguardado la vuelca', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startAutosave();

    // Puerta en getFile: el vuelco queda en marcha hasta que la abramos.
    let release = () => {};
    const gate = new Promise((r) => {
      release = /** @type {() => void} */ (r);
    });
    const originalGetFile = handle.getFile.bind(handle);
    handle.getFile = async () => {
      await gate;
      return originalGetFile();
    };

    await addGame({ title: 'Hades II', today: TODAY });
    vi.advanceTimersByTime(3000);
    await settle();
    // El vuelco está en marcha (getFile esperando a la puerta).
    expect(store.get().file.saving).toBe(true);

    // Mutación intercalada a mitad del vuelco.
    await addGame({ title: 'Hades III', today: TODAY });
    expect(store.get().meta.dirty).toBe(true);

    // El vuelco termina: escribió la versión anterior, pero dirty NO se limpia.
    release();
    await settle();
    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(true);
    const dumped = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped.games.map((g) => g.title)).toEqual(['Hades', 'Hades II']);

    // El siguiente autoguardado vuelca la mutación intercalada.
    vi.advanceTimersByTime(3000);
    await settle();
    expect(handle.writes).toBe(2);
    expect(store.get().meta.dirty).toBe(false);
    const dumped2 = parseDump(/** @type {string} */ (handle.captured));
    expect(dumped2.games.map((g) => g.title)).toEqual(['Hades', 'Hades II', 'Hades III']);
  });

  it('un vuelco oculto que termina después del retoma no pisa el flag del vuelco nuevo', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startAutosave();

    // Puertas por llamada a getFile: controlamos el intercalado de los dos
    // vuelcos (el oculto congelado y el retoma al volver visible).
    let calls = 0;
    let release1 = () => {};
    let release2 = () => {};
    const gate1 = new Promise((r) => {
      release1 = /** @type {() => void} */ (r);
    });
    const gate2 = new Promise((r) => {
      release2 = /** @type {() => void} */ (r);
    });
    const originalGetFile = handle.getFile.bind(handle);
    handle.getFile = async () => {
      calls += 1;
      if (calls === 1) await gate1;
      if (calls === 2) await gate2;
      return originalGetFile();
    };

    await addGame({ title: 'Hades II', today: TODAY });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete /** @type {any} */ (document).visibilityState;
    }
    await settle();
    expect(store.get().file.saving).toBe(true);

    // Volver visible: se abandona el vuelco oculto y arranca el retoma.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete /** @type {any} */ (document).visibilityState;
    }
    await settle();
    expect(store.get().file.saving).toBe(true);

    // El vuelco oculto termina al fin: su finally NO debe limpiar el flag del
    // retoma (identidad de promesa), que sigue en marcha.
    release1();
    await settle();
    expect(store.get().file.saving).toBe(true);

    // El retoma termina y limpia el flag.
    release2();
    await settle();
    expect(store.get().file.saving).toBe(false);
    expect(store.get().meta.dirty).toBe(false);
    expect(handle.writes).toBe(2);
  });

  it('sin archivo conectado no agenda ningún vuelco', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startAutosave();

    // Mutar conectado agenda el vuelco; desconectar antes de que venza el
    // debounce deja el vuelco sin ejecutar (guard de runScheduledSave).
    await addGame({ title: 'Hades II', today: TODAY });
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false } });
    vi.advanceTimersByTime(60000);
    await settle();

    expect(store.get().meta.dirty).toBe(true);
    expect(handle.captured).toBeNull();
  });
});

describe('comprobación al recuperar foco (§5.5)', () => {
  it('archivo cambiado fuera + limpio → recarga silenciosa sin conflicto', async () => {
    const spy = vi.fn();
    setConflictHandler(spy);
    const handle = makeHandle(FILE_V2_TEXT);
    await connectFile(FILE_V1_TEXT, makeHandle(FILE_V1_TEXT));
    setHandle(/** @type {any} */ (handle));
    startAutosave();

    window.dispatchEvent(new Event('focus'));
    await settle();

    expect(spy).not.toHaveBeenCalled();
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(FILE_V2_TEXT));
  });

  it('archivo cambiado fuera + dirty → conflicto al handler, resoluble', async () => {
    const spy = vi.fn();
    setConflictHandler(spy);
    await seedConflict();
    startAutosave();

    window.dispatchEvent(new Event('focus'));
    await settle();

    expect(spy).toHaveBeenCalledTimes(1);
    const info = spy.mock.calls[0][0];
    expect(info.fileDoc.updatedAt).toBe('2026-08-23T18:30:00Z');
    expect(store.get().meta.dirty).toBe(true);
    expect(store.get().doc?.games.some((g) => g.title === 'Extra')).toBe(true);

    await resolveConflict('file');
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().meta.dirty).toBe(false);
  });
});

describe('pastilla de archivo (chrome de la app)', () => {
  it('desconectado muestra «Archivo no conectado — Reconectar»; la puerta de bienvenida la oculta', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false } });

    const root = mountApp();
    const connect = qs('[data-connect]', root);
    expect(connect?.textContent).toContain('Archivo no conectado — Reconectar');

    // Sin handle, Reconectar cae al picker; cancelar (sin FSA real aquí) no rompe.
    revokeFsa();
    btn(connect).click();
    await settle();
    expect(store.get().file.status).toBe('disconnected');
  });

  it('conectado muestra nombre, indicador «cambios sin volcar» y Guardar ahora funciona', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    const root = mountApp();

    expect(qs('.filebar', root)?.textContent).toContain('Archivo: game-tracker.json');
    expect(qs('.file-dirty', root)).toBeNull();

    await addGame({ title: 'Hades II', today: TODAY });
    expect(qs('.file-dirty', root)?.textContent).toContain('cambios sin volcar');

    btn(qs('[data-save-now]', root)).click();
    await settle();

    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    expect(qs('.file-dirty', root)).toBeNull();
  });

  it('mientras corre el vuelco la pastilla muestra «volcando…» y desaparece al terminar', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    const root = mountApp();

    // Puerta en getFile: el vuelco queda en marcha hasta que la abramos.
    let release = () => {};
    const gate = new Promise((r) => {
      release = /** @type {() => void} */ (r);
    });
    const originalGetFile = handle.getFile.bind(handle);
    handle.getFile = async () => {
      await gate;
      return originalGetFile();
    };

    await addGame({ title: 'Hades II', today: TODAY });
    expect(qs('.file-dirty', root)?.textContent).toContain('cambios sin volcar');

    btn(qs('[data-save-now]', root)).click();
    await settle();
    expect(qs('.file-dirty', root)?.textContent).toContain('volcando…');

    release();
    await settle();
    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    expect(qs('.file-dirty', root)).toBeNull();
  });

  it('error muestra la pastilla de reintento y Recuperar vuelve a conectado', async () => {
    grantFsa();
    const handle = makeHandle(FILE_V1_TEXT, { failWrites: true });
    await connectFile(FILE_V1_TEXT, handle);
    const root = mountApp();
    await addGame({ title: 'Hades II', today: TODAY });
    await saveNow();
    await settle();

    expect(qs('.pill-btn', root)?.textContent).toContain('disco lleno');
    expect(qs('[data-retry]', root)).toBeTruthy();

    handle.setText(FILE_V1_TEXT);
    const healthy = makeHandle(FILE_V1_TEXT);
    setHandle(/** @type {any} */ (healthy));
    btn(qs('[data-retry]', root)).click();
    await settle();

    expect(store.get().file.status).toBe('connected');
    expect(qs('.filebar', root)?.textContent).toContain('Archivo: game-tracker.json');
  });

  it('error con mensaje largo: la pastilla conserva la clase del guard de wrapping', async () => {
    grantFsa();
    const LONG_ERROR =
      'SecurityError: The operation is insecure. No se pudo escribir el archivo en el sistema de archivos.';
    store.set({ file: { status: 'error', name: null, error: LONG_ERROR, conflict: null, saving: false } });

    const root = mountApp();
    const pill = qs('.filebar .pill-btn', root);
    expect(pill?.textContent).toBe(LONG_ERROR);
    expect(qs('[data-retry]', root)).toBeTruthy();
  });

  it('sin FSA informa del guardado automático local, sin botones de enlace', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    const root = mountApp();

    expect(qs('.filebar', root)?.textContent).toContain('Guardado automático en este navegador');
    expect(qs('.filebar', root)?.textContent).not.toContain('Sin acceso a archivos');
    expect(qs('[data-save-now]', root)).toBeNull();
    expect(qs('[data-connect]', root)).toBeNull();
    expect(qs('[data-retry]', root)).toBeNull();
  });
});

describe('diálogo de conflicto (§5.5)', () => {
  it('muestra ambas fechas, las tres opciones y cierra con backdrop sin resolver', async () => {
    await seedConflict();
    // El conflicto se lee del estado (ADR-0004): hay que elevarlo antes de abrir.
    expect((await saveNow()).status).toBe('conflict');
    openConflict();

    expect(isConflictOpen()).toBe(true);
    const sheet = qs('.conflict-sheet', document.body);
    expect(sheet?.textContent).toContain('Conflicto de versiones');
    expect(sheet?.textContent).toContain('2026-08-23 18:30');
    const localStamp = (store.get().doc?.updatedAt ?? '').replace('T', ' ').slice(0, 16);
    expect(sheet?.textContent).toContain(localStamp);
    expect(qsa('.conflict-actions button', document.body).map((b) => b.textContent?.trim())).toEqual([
      'Usar la versión del archivo',
      'Mantener mis cambios',
      'Descargar copia local',
    ]);

    btn(qs('.add-backdrop', document.body)).click();
    expect(isConflictOpen()).toBe(false);
    expect(store.get().meta.dirty).toBe(true);
  });

  it('«Mantener mis cambios» resuelve por los locales y cierra', async () => {
    const handle = await seedConflict();
    expect((await saveNow()).status).toBe('conflict');
    openConflict();

    btn(qs('[data-choice="local"]', document.body)).click();
    await settle();

    expect(isConflictOpen()).toBe(false);
    expect(handle.writes).toBe(1);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().doc?.games.some((g) => g.title === 'Extra')).toBe(true);
  });

  it('«Usar la versión del archivo» arma confirmación fuerte; Sí importa y No desarma', async () => {
    await seedConflict();
    expect((await saveNow()).status).toBe('conflict');
    openConflict();

    btn(qs('[data-choice="file"]', document.body)).click();
    expect(qs('.conflict-confirm', document.body)?.textContent).toContain(
      '¿Seguro? Se descartarán tus cambios locales.',
    );

    btn(qs('[data-confirm="no"]', document.body)).click();
    expect(qs('[data-choice="file"]', document.body)).toBeTruthy();

    btn(qs('[data-choice="file"]', document.body)).click();
    btn(qs('[data-confirm="yes"]', document.body)).click();
    await settle();

    expect(isConflictOpen()).toBe(false);
    expect(store.get().doc?.games.map((g) => g.title)).toEqual(['Celeste']);
    expect(store.get().meta.dirty).toBe(false);
  });

  it('«Descargar copia local» mantiene el diálogo abierto con nota y estado intacto', async () => {
    const handle = await seedConflict();
    expect((await saveNow()).status).toBe('conflict');
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    urlApi.createObjectURL = () => 'blob:test-url';
    urlApi.revokeObjectURL = () => {};

    try {
      openConflict();
      btn(qs('[data-choice="download"]', document.body)).click();
      await settle();

      expect(isConflictOpen()).toBe(true);
      expect(qs('.conflict-note', document.body)?.textContent).toContain('Copia local descargada');
      expect(handle.writes).toBe(0);
      expect(store.get().meta.dirty).toBe(true);
      // Tras comparar, elige mantener sus cambios y ahí sí cierra.
      btn(qs('[data-choice="local"]', document.body)).click();
      await settle();
      expect(isConflictOpen()).toBe(false);
    } finally {
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });
});
