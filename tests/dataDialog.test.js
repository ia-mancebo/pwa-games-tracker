import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { addGame, importDoc, saveExportName, DEFAULT_EXPORT_NAME } from '../src/data/library.js';
import { markConnected, resetFilelink, saveNow } from '../src/data/filelink.js';
import { setHandle, getHandle } from '../src/services/fsa.js';
import { sha256Hex } from '../src/services/hash.js';
import { validateDoc } from '../src/domain/validate.js';
import { acquireTabLock, assertWritable, onLockReleased, resetTablock } from '../src/data/tablock.js';
import { listBackups, readBackup, snapshotBackup } from '../src/data/opfs.js';
import { getMeta } from '../src/data/db.js';
import { closeDataDialog, isDataOpen, openDataDialog } from '../src/views/dataDialog.js';
import { qs, qsa } from '../src/lib/dom.js';

const TODAY = '2026-08-25';
const WORKER_URL = 'https://gt-proxy.example.workers.dev';
const realSetTimeout = setTimeout;

/** Cede macrotareas reales para que IDB (setImmediate) y crypto terminen. */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => {
      realSetTimeout(resolve, 0);
    });
  }
}

/** @param {() => boolean} cond @param {number} [ms] */
async function until(cond, ms = 3000) {
  const step = 25;
  for (let waited = 0; waited < ms; waited += step) {
    if (cond()) return;
    await new Promise((resolve) => {
      realSetTimeout(resolve, step);
    });
  }
  throw new Error('condición no alcanzada a tiempo');
}

/** Títulos del doc actual sin pelearte con la nulidad del store. @returns {string[]} */
function currentTitles() {
  const doc = /** @type {any} */ (store.get().doc);
  return Array.isArray(doc?.games) ? doc.games.map((/** @type {{ title: string }} */ g) => g.title) : [];
}

const DOC_A_TEXT = JSON.stringify({
  schema: 'game-tracker',
  version: 1,
  updatedAt: '2026-08-20T09:30:00Z',
  games: [{ id: 'g1', title: 'Hades', plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-08-01' }] }],
});

const DOC_B_TEXT = JSON.stringify({
  schema: 'game-tracker',
  version: 1,
  updatedAt: '2026-08-23T18:30:00Z',
  games: [
    { id: 'g9', title: 'Celeste', plays: [{ id: 'g9-p1', status: 'finished', addedAt: '2026-08-02', rating: 5 }] },
  ],
});

/**
 * @param {string} initialText
 * @param {{ failWrites?: boolean }} [options]
 */
function makeHandle(initialText, options = {}) {
  const state = {
    text: initialText,
    writes: 0,
    captured: /** @type {string | null} */ (null),
    fail: options.failWrites === true,
  };
  return {
    name: 'game-tracker.json',
    /** @param {string} next */
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
        /** @param {string} data */
        async write(data) {
          state.captured = data;
        },
        async close() {},
      };
    },
    async requestPermission() {
      return 'granted';
    },
  };
}

/** Conecta un archivo ya existente como espejo de sesión. @param {string} text @param {ReturnType<typeof makeHandle>} handle */
async function connectFile(text, handle) {
  const hash = await sha256Hex(text);
  const doc = await importDoc(text, { hash, fileName: 'game-tracker.json' });
  setHandle(/** @type {any} */ (handle));
  markConnected('game-tracker.json');
  return doc;
}

function mountApp() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  createApp(root);
  return root;
}

/** @param {Element | null} el @returns {HTMLElement} */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

function grantFsa() {
  /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([]);
}

function revokeFsa() {
  delete /** @type {any} */ (window).showOpenFilePicker;
  delete /** @type {any} */ (window).showSaveFilePicker;
}

/** @param {string} prop @param {unknown} value */
function defineNav(prop, value) {
  Object.defineProperty(window.navigator, prop, { value, configurable: true });
}

/** @param {string} prop */
function clearNav(prop) {
  try {
    delete /** @type {any} */ (window.navigator)[prop];
  } catch {
    // La propiedad podría no existir o no ser configurable.
  }
}

/**
 * Polyfill OPFS mínimo en memoria: getDirectory → dir con getFileHandle(name,
 * {create}) → fichero con createWritable(){write,close}, values(),
 * removeEntry() y getFile().
 * @returns {Map<string, string>}
 */
function makeOpfs() {
  const files = /** @type {Map<string, string>} */ (new Map());
  const notFound = () => Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
  const backupDir = {
    /**
     * @param {string} name
     * @param {{ create?: boolean }} [opts]
     */
    async getFileHandle(name, opts = {}) {
      if (!files.has(name) && !opts.create) throw notFound();
      return {
        name,
        async createWritable() {
          let buf = files.get(name) ?? '';
          return {
            /** @param {string} data */
            async write(data) {
              buf = data;
            },
            async close() {
              files.set(name, buf);
            },
          };
        },
        async getFile() {
          return new File([files.get(name) ?? ''], name, { type: 'application/json' });
        },
      };
    },
    async *values() {
      yield* [...files.keys()];
    },
    /** @param {string} name */
    async removeEntry(name) {
      if (!files.delete(name)) throw notFound();
    },
  };
  const root = {
    /**
     * @param {string} name
     * @param {{ create?: boolean }} [opts]
     */
    async getDirectoryHandle(name, opts = {}) {
      if (name !== 'backups' && !opts.create) throw notFound();
      return backupDir;
    },
  };
  defineNav('storage', { getDirectory: async () => root });
  return files;
}

/**
 * Mock de Web Locks con semántica real: sin `ifAvailable` la petición se
 * ENCOLA hasta liberación; con él responde al instante con null si está ocupado.
 */
function makeQueueLocks() {
  let busy = true;
  let freeIt = /** @type {(() => void) | null} */ (null);
  /**
   * @param {string} _name
   * @param {unknown} optsOrCb
   * @param {((lock: unknown) => unknown) | undefined} maybeCb
   */
  const impl = (_name, optsOrCb, maybeCb) => {
    const opts =
      typeof optsOrCb === 'object' && optsOrCb !== null ? /** @type {{ifAvailable?: boolean}} */ (optsOrCb) : {};
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    if (busy) {
      if (opts.ifAvailable) return Promise.resolve(cb?.(null));
      return new Promise((resolve) => {
        freeIt = () => resolve(cb?.({}));
      });
    }
    busy = true;
    return Promise.resolve(cb?.({}));
  };
  return {
    impl,
    release() {
      busy = false;
      freeIt?.();
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false },
    ready: false,
    tabRole: 'primary',
  });
  resetFilelink();
  resetTablock();
});

afterEach(() => {
  closeDataDialog();
  resetFilelink();
  revokeFsa();
  clearNav('storage');
  clearNav('locks');
  clearNav('canShare');
  clearNav('share');
  vi.restoreAllMocks();
});

describe('backups OPFS rotativos (§5.6)', () => {
  it('tras 5 snapshots quedan EXACTAMENTE 3 ficheros backup-<n>.json y listBackups va de nuevo a viejo', async () => {
    const files = makeOpfs();
    const doc = await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    for (let i = 0; i < 5; i += 1) {
      await snapshotBackup(doc);
    }

    expect(files.size).toBe(3);
    for (const name of files.keys()) {
      expect(/^backup-\d+\.json$/.test(name)).toBe(true);
    }
    const listed = await listBackups();
    expect(listed).toHaveLength(3);
    for (let i = 1; i < listed.length; i += 1) {
      expect(listed[i - 1].savedAt >= listed[i].savedAt).toBe(true);
    }
  });

  it('readBackup devuelve { savedAt, doc } que ronda-tripa con el doc volcado', async () => {
    makeOpfs();
    const doc = await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    await snapshotBackup(doc);

    const [info] = await listBackups();
    expect(info.name).toMatch(/^backup-\d+\.json$/);
    const backup = await readBackup(info.name);
    if (!backup) throw new Error('la copia debería existir');
    expect(typeof backup.savedAt).toBe('string');
    expect(backup.doc).toEqual(store.get().doc);
  });

  it('sin OPFS disponible: listBackups vacío y snapshotBackup es no-op silencioso', async () => {
    clearNav('storage');
    const doc = await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    await expect(snapshotBackup(doc)).resolves.toBeUndefined();
    await expect(listBackups()).resolves.toEqual([]);
    await expect(readBackup('backup-1.json')).resolves.toBeNull();
  });
});

describe('snapshot desde el vuelco (saveNow)', () => {
  it('un vuelco exitoso crea una copia OPFS con el doc dentro', async () => {
    const files = makeOpfs();
    const handle = makeHandle(DOC_A_TEXT);
    await connectFile(DOC_A_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });

    const res = await saveNow();
    await settle();

    expect(res.status).toBe('saved');
    expect(files.size).toBe(1);
    const [name] = [...files.keys()];
    const parsed = JSON.parse(/** @type {string} */ (/** @type {unknown} */ (files.get(name))));
    expect(parsed.savedAt).toBeTruthy();
    expect(parsed.doc.games.map((/** @type {{ title: string }} */ g) => g.title)).toEqual(['Hades', 'Hades II']);
  });

  it('un fallo de escritura NO crea copia', async () => {
    const files = makeOpfs();
    const handle = makeHandle(DOC_A_TEXT, { failWrites: true });
    await connectFile(DOC_A_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });

    const res = await saveNow();
    await settle();

    expect(res.status).toBe('error');
    expect(files.size).toBe(0);
  });
});

describe('navigator.storage.persist() una única vez', () => {
  it('se pide tras el primer guardado exitoso y NO se vuelve a pedir', async () => {
    const persistSpy = vi.fn(() => Promise.resolve(true));
    defineNav('storage', { persist: persistSpy });
    const handle = makeHandle(DOC_A_TEXT);
    await connectFile(DOC_A_TEXT, handle);

    await saveNow();
    await saveNow();
    await settle();

    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(store.get().meta.persistAsked).toBe(true);
    expect((await getMeta())?.persistAsked).toBe(true);
  });

  it('si meta.persistAsked ya está, no se insiste jamás', async () => {
    const persistSpy = vi.fn(() => Promise.resolve(false));
    defineNav('storage', { persist: persistSpy });
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    store.set({ meta: { ...store.get().meta, persistAsked: true } });

    await saveNow();

    expect(persistSpy).not.toHaveBeenCalled();
  });
});

describe('bloqueo de segunda pestaña (Web Locks)', () => {
  it('acquireTabLock true cuando el lock está libre', async () => {
    defineNav('locks', {
      request: async (
        /** @type {unknown} */ _n,
        /** @type {unknown} */ _o,
        /** @type {(lock: unknown) => void} */ cb,
      ) => {
        await cb({});
      },
    });
    await expect(acquireTabLock()).resolves.toBe(true);
  });

  it('false cuando otra pestaña lo retiene (callback con null)', async () => {
    defineNav('locks', {
      request: async (
        /** @type {unknown} */ _n,
        /** @type {unknown} */ _o,
        /** @type {(lock: unknown) => void} */ cb,
      ) => {
        await cb(null);
      },
    });
    await expect(acquireTabLock()).resolves.toBe(false);
  });

  it('false cuando request rechaza con AbortError', async () => {
    defineNav('locks', {
      request: async () => {
        throw Object.assign(new Error('cancelado'), { name: 'AbortError' });
      },
    });
    await expect(acquireTabLock()).resolves.toBe(false);
  });

  it('sin navigator.locks se asume pestaña única', async () => {
    await expect(acquireTabLock()).resolves.toBe(true);
  });

  it('saveNow no-op en secundaria: nada se escribe ni se marca limpio', async () => {
    store.set({ tabRole: 'secondary' });
    const handle = makeHandle(DOC_A_TEXT);
    await connectFile(DOC_A_TEXT, handle);
    await addGame({ title: 'Hades II', today: TODAY });

    expect(assertWritable()).toBe(false);
    const res = await saveNow();

    expect(res.status).toBe('skipped');
    expect(handle.writes).toBe(0);
    expect(store.get().meta.dirty).toBe(true);
  });

  it('onLockReleased promociona a esta pestaña cuando el lock queda libre', async () => {
    const locks = makeQueueLocks();
    defineNav('locks', { request: locks.impl });
    await expect(acquireTabLock()).resolves.toBe(false);

    const promoted = vi.fn();
    onLockReleased(promoted);
    await settle();
    expect(promoted).not.toHaveBeenCalled();

    locks.release();
    await until(() => promoted.mock.calls.length === 1);
  });

  it('onLockReleased reintenta con backoff tras rechazos hasta conseguirlo', async () => {
    let fails = 2;
    /**
     * @param {unknown} _n
     * @param {unknown} optsOrCb
     * @param {((lock: unknown) => unknown) | undefined} maybeCb
     */
    const impl = (_n, optsOrCb, maybeCb) => {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
      if (!cb) return Promise.reject(new Error('sin callback'));
      if (fails > 0) {
        fails -= 1;
        return Promise.reject(new Error('ocupada'));
      }
      return Promise.resolve(cb({}));
    };
    defineNav('locks', { request: impl });

    const promoted = vi.fn();
    onLockReleased(promoted);
    await until(() => promoted.mock.calls.length === 1, 3000);
    expect(fails).toBe(0);
  });
});

describe('saveExportName (preferencia local del dispositivo)', () => {
  it('normaliza, persiste en meta y en IDB; vacío cae al valor por defecto', async () => {
    expect(await saveExportName('  respaldos/mi.json  ')).toBe('respaldos/mi.json');
    expect(store.get().meta.exportFileName).toBe('respaldos/mi.json');
    expect((await getMeta())?.exportFileName).toBe('respaldos/mi.json');

    expect(await saveExportName('   ')).toBe(DEFAULT_EXPORT_NAME);
    expect(store.get().meta.exportFileName).toBe(DEFAULT_EXPORT_NAME);
  });
});

describe('Conexión: URL del proxy en el diálogo Datos', () => {
  /** Carga una biblioteca y abre el diálogo. */
  async function openWithDoc() {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    openDataDialog();
  }

  /**
   * Escribe un valor en el input de conexión y pulsa Guardar conexión.
   * @param {string} value
   */
  async function saveConnection(value) {
    const input = qs('[data-worker-url]', document.body);
    if (!(input instanceof HTMLInputElement)) throw new Error('falta el input de conexión');
    input.value = value;
    btn(qs('[data-save-worker]', document.body)).click();
    await settle();
  }

  it('guarda la URL normalizada dentro de doc.connection y confirma inline', async () => {
    await openWithDoc();
    await saveConnection(` ${WORKER_URL}/ `);

    expect(store.get().doc?.connection?.workerUrl).toBe(WORKER_URL);
    expect(validateDoc(store.get().doc)).toMatchObject({ ok: true });
    expect(qs('.datos-note', document.body)?.textContent).toContain('Conexión guardada');
    const input = qs('[data-worker-url]', document.body);
    if (!(input instanceof HTMLInputElement)) throw new Error('falta el input de conexión');
    expect(input.value).toBe(WORKER_URL);
  });

  it('una URL que no es http(s) se revierte y avisa sin tocar el doc', async () => {
    await openWithDoc();
    await saveConnection('no-es-una-url');

    expect(qs('.form-error', document.body)?.textContent).toContain('URL no válida');
    expect(store.get().doc?.connection).toBeUndefined();
  });

  it('vaciar el campo quita la Conexión del doc', async () => {
    await openWithDoc();
    await saveConnection(WORKER_URL);
    await saveConnection('');

    expect(store.get().doc?.connection).toBeUndefined();
    expect(qs('.datos-note', document.body)?.textContent).toContain('Conexión quitada');
  });

  it('en pestaña secundaria (solo lectura) no guarda y lo dice', async () => {
    await openWithDoc();
    store.set({ tabRole: 'secondary' });
    await saveConnection(WORKER_URL);

    expect(store.get().doc?.connection).toBeUndefined();
    expect(qs('.form-error', document.body)?.textContent).toContain('solo lectura');
  });
});

describe('diálogo «Datos»', () => {
  /** @param {{ text: string | null, done: boolean }} capture */
  function grantSavePicker(capture) {
    grantFsa();
    const picker = vi.fn((/** @type {unknown} */ _opts) =>
      Promise.resolve({
        createWritable: async () => ({
          /** @param {string} data */
          write: async (data) => {
            capture.text = data;
          },
          close: async () => {
            capture.done = true;
          },
        }),
      }),
    );
    /** @type {any} */ (window).showSaveFilePicker = picker;
    return picker;
  }

  it('exporta vía showSaveFilePicker con el nombre sugerido y el texto reimporta idéntico', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: 'origen.json' });
    await addGame({ title: 'Hades II', today: TODAY });
    await saveExportName('mi-copia.json');
    const capture = /** @type {{ text: string | null, done: boolean }} */ ({ text: null, done: false });
    const picker = grantSavePicker(capture);
    openDataDialog();

    btn(qs('[data-export]', document.body)).click();
    await settle();

    expect(capture.done).toBe(true);
    expect(picker.mock.calls[0][0]).toMatchObject({ suggestedName: 'mi-copia.json' });
    const exported = /** @type {string} */ (capture.text);
    const reparsed = JSON.parse(exported);
    expect(validateDoc(reparsed)).toMatchObject({ ok: true });
    expect(reparsed).toEqual(store.get().doc);
    expect(store.get().meta.dirty).toBe(false);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(exported));
  });

  it('sin showSaveFilePicker cae a la descarga universal con el mismo contenido', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    await addGame({ title: 'Hades II', today: TODAY });
    grantFsa();
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    const createdBlobs = /** @type {Blob[]} */ ([]);
    urlApi.createObjectURL = (/** @type {Blob} */ blob) => {
      createdBlobs.push(blob);
      return 'blob:test-url';
    };
    urlApi.revokeObjectURL = () => {};
    const anchors = /** @type {HTMLElement[]} */ ([]);
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLElement && el.tagName === 'A') anchors.push(el);
      return originalAppend(el);
    });
    openDataDialog();
    try {
      btn(qs('[data-export]', document.body)).click();
      await settle();

      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute('download')).toBe('game-tracker.json');
      expect(createdBlobs).toHaveLength(1);
      expect(store.get().meta.dirty).toBe(false);
    } finally {
      appendSpy.mockRestore();
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });

  it('cancelar el guardado (AbortError) es silencioso: sin error, sin descarga, sigue dirty', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    await addGame({ title: 'Hades II', today: TODAY });
    grantFsa();
    const anchors = /** @type {HTMLElement[]} */ ([]);
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLElement && el.tagName === 'A') anchors.push(el);
      return originalAppend(el);
    });
    const err = new Error('cancelado');
    err.name = 'AbortError';
    /** @type {any} */ (window).showSaveFilePicker = vi.fn(() => Promise.reject(err));
    openDataDialog();
    try {
      btn(qs('[data-export]', document.body)).click();
      await settle();

      expect(qs('.form-error', document.body)).toBeNull();
      expect(anchors).toHaveLength(0);
      expect(store.get().meta.dirty).toBe(true);
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('conectar un archivo inválido muestra error inline y no toca nada', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: 'a.json' });
    grantFsa();
    const bad = makeHandle('{{ no es json');
    /** @type {any} */ (window).showOpenFilePicker = () => Promise.resolve([bad]);
    openDataDialog();

    btn(qs('[data-conectar]', document.body)).click();
    await settle();

    expect(isDataOpen()).toBe(true);
    expect(qs('.form-error', document.body)?.textContent).toContain('JSON válido');
    expect(currentTitles()).toEqual(['Hades']);
    expect(getHandle()).toBeNull();
  });

  it('«Compartir copia» queda oculto sin canShare y comparte un File cuando existe', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    openDataDialog();
    expect(qs('[data-share]', document.body)).toBeNull();
    closeDataDialog();

    defineNav('canShare', () => true);
    const shareSpy = vi.fn((/** @type {unknown} */ _arg) => Promise.resolve());
    defineNav('share', shareSpy);
    openDataDialog();

    const shareBtn = qs('[data-share]', document.body);
    expect(shareBtn).toBeTruthy();
    btn(shareBtn).click();
    await settle();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = /** @type {{ files: File[] }} */ (shareSpy.mock.calls[0][0]);
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].name).toBe('game-tracker.json');
    expect(arg.files[0].type).toBe('application/json');
  });

  it('Restaurar una copia sustituye el estado actual por su contenido y cierra', async () => {
    makeOpfs();
    const docA = await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: 'a.json' });
    await snapshotBackup(docA);
    const docB = await importDoc(DOC_B_TEXT, { hash: await sha256Hex(DOC_B_TEXT), fileName: 'b.json' });
    await snapshotBackup(docB);

    openDataDialog();
    await settle();
    const restores = qsa('[data-restore]', document.body);
    expect(restores).toHaveLength(2);
    // La primera fila es la más reciente (Celeste); restauramos la antigua (Hades).
    btn(restores[1]).click();
    await settle();

    expect(isDataOpen()).toBe(false);
    expect(currentTitles()).toEqual(['Hades']);
    expect(store.get().meta.lastSavedFileHash).toBe(await sha256Hex(DOC_A_TEXT));
  });

  it('sin copias muestra el estado vacío', async () => {
    openDataDialog();
    await until(() => Boolean(qs('.datos-empty', document.body)?.textContent?.includes('no hay copias')));
  });

  it('muestra el estado del almacenamiento persistente vía persisted()', async () => {
    defineNav('storage', { persisted: async () => true });
    openDataDialog();
    await until(() => Boolean(qs('[data-persist-status]', document.body)?.textContent?.includes('persistente')));
  });

  it('los botones «Datos» del raíl y del filebar abren el diálogo', async () => {
    await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
    const root = mountApp();
    const openers = qsa('[data-open-data]', root);
    expect(openers.length).toBeGreaterThanOrEqual(2);

    btn(openers[0]).click();
    expect(isDataOpen()).toBe(true);
    closeDataDialog();

    const barBtn = qs('[data-open-data].bar-datos', root);
    expect(barBtn).toBeTruthy();
    btn(barBtn).click();
    expect(isDataOpen()).toBe(true);
  });

  it('segunda pestaña activa el modo solo lectura: banner, clase raíz y sin Guardar ahora', async () => {
    const handle = makeHandle(DOC_A_TEXT);
    await connectFile(DOC_A_TEXT, handle);
    grantFsa();
    const root = mountApp();

    store.set({ tabRole: 'secondary' });

    expect(root.classList.contains('readonly-tab')).toBe(true);
    const banner = qs('.ro-banner', root);
    expect(banner?.textContent).toContain('Otra pestaña tiene la biblioteca abierta');
    expect(banner?.textContent).toContain('solo lectura');
    expect(qs('[data-become-primary]', banner ?? root)).toBeTruthy();
    expect(qs('[data-save-now]', root)).toBeNull();
    // El FAB sigue en el DOM pero oculto por CSS (.readonly-tab .fab).
    expect(qs('[data-add-game]', root)).toBeTruthy();

    const locks = makeQueueLocks();
    defineNav('locks', { request: locks.impl });
    btn(qs('[data-become-primary]', root)).click();
    locks.release();
    await until(() => store.get().tabRole === 'primary');

    expect(root.classList.contains('readonly-tab')).toBe(false);
    expect(qs('[data-save-now]', root)).toBeTruthy();
    expect(qs('.ro-banner', root)).toBeNull();
  });
});
