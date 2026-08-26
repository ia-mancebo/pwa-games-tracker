/**
 * Enlace de archivo entre sesiones: el handle FSA se guarda en IDB al conectar
 * deliberadamente, `restoreSavedLink` reconecta en silencio cuando el permiso
 * sigue vigente (y resuelve conflicto o recarga limpia como `reconnect`), y
 * con permiso caducado devuelve 'needs-gesture' para que ofrezca el modal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './support/storage.js';
import { store } from '../src/app.js';
import { addGame, importDoc, initLibrary } from '../src/data/library.js';
import {
  markConnected,
  pickAndConnect,
  restoreSavedLink,
  setConflictHandler,
  setHandleStore,
} from '../src/data/filelink.js';
import { setHandle } from '../src/services/fsa.js';
import { sha256Hex } from '../src/services/hash.js';

/**
 * Almacén del enlace en memoria: imita el IDB de producción sin el límite de
 * structuredClone de fake-indexeddb (los fakes de handle llevan métodos).
 * @returns {{ get(k: string): {name: string|null, handle: any}|undefined }}
 */
function mountHandleStore() {
  /** @type {Map<string, {name: string|null, handle: any}>} */
  const entries = new Map();
  setHandleStore({
    /** @returns {Promise<{name: string|null, handle: any}|null>} */
    async get() {
      return entries.get('file') ?? null;
    },
    /**
     * @param {any} handle
     * @param {string|null} name
     */
    async put(handle, name) {
      entries.set('file', { name, handle });
    },
    async clear() {
      entries.delete('file');
    },
  });
  return { get: (k) => entries.get(k) };
}

const TODAY = '2026-08-24';
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
  games: [{ id: 'g9', title: 'Celeste', plays: [{ id: 'g9-p1', status: 'finished', addedAt: '2026-08-02' }] }],
});

/**
 * @param {string} initialText
 * @param {'granted'|'prompt'|'denied'} [perm]
 */
function makeHandle(initialText, perm) {
  const state = { text: initialText, writes: 0 };
  return {
    name: 'game-tracker.json',
    /**
     * @param {string} next
     */
    setText(next) {
      state.text = next;
    },
    get writes() {
      return state.writes;
    },
    text() {
      return state.text;
    },
    async getFile() {
      return new File([state.text], 'game-tracker.json', { type: 'application/json' });
    },
    async createWritable() {
      state.writes += 1;
      return {
        /**
         * @param {string} data
         */
        async write(data) {
          state.text = data;
        },
        async close() {},
      };
    },
    async requestPermission() {
      return perm ?? 'granted';
    },
    ...(perm === undefined
      ? {}
      : {
          async queryPermission() {
            return perm;
          },
        }),
  };
}

/** Stub del picker de apertura para que hasFsa() sea verdad en jsdom.
 * @param {{ name?: string }} [handle]
 */
function stubOpenPicker(handle) {
  /** @type {any} */ (self).showOpenFilePicker = async () => [handle];
}

/** Conecta un texto como enlace deliberado de sesión.
 * @param {string} text
 * @param {any} handle
 */
async function connectFile(text, handle) {
  const hash = await sha256Hex(text);
  await importDoc(text, { hash, fileName: 'game-tracker.json' });
  setHandle(/** @type {any} */ (handle));
  await markConnected('game-tracker.json');
}

/** @type {{ get(k: string): {name: string|null, handle: any}|undefined }} */
let savedHandles;

beforeEach(async () => {
  document.body.innerHTML = '';
  savedHandles = mountHandleStore();
  stubOpenPicker(makeHandle(FILE_V1_TEXT));
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    tabRole: 'primary',
    file: { status: 'disconnected', name: null, error: null },
  });
  await initLibrary();
});

afterEach(() => {
  setConflictHandler(() => {});
  setHandleStore(null);
  /** @type {any} */ (self).showOpenFilePicker = undefined;
});

describe('persistencia del handle del enlace', () => {
  it('markConnected guarda el handle para la próxima sesión; no sobreescribe sin handle', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    expect(savedHandles.get('file')?.name).toBe('game-tracker.json');
    expect(savedHandles.get('file')?.handle).toBe(handle);

    // Sin handle de sesión no se machaca el registro existente.
    setHandle(null);
    await markConnected('otro.json');
    expect(savedHandles.get('file')?.name).toBe('game-tracker.json');
  });

  it('pickAndConnect persiste el handle elegido en el picker', async () => {
    const picked = makeHandle(FILE_V1_TEXT);
    stubOpenPicker(picked);
    const res = await pickAndConnect();
    expect(res.status).toBe('connected');
    expect(savedHandles.get('file')?.name).toBe('game-tracker.json');
  });
});

describe('restoreSavedLink', () => {
  it('sin registro guardado devuelve none y no toca nada', async () => {
    await connectFile(FILE_V1_TEXT, makeHandle(FILE_V1_TEXT));
    await setHandleStore({
      async get() {
        return null;
      },
      async put() {},
      async clear() {},
    });
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null } });
    expect(await restoreSavedLink()).toBe('none');
    expect(store.get().file.status).toBe('disconnected');
  });

  it('hash igual + espejo limpio ⇒ conecta sin escribir', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null } });

    expect(await restoreSavedLink()).toBe('connected');
    expect(store.get().file.status).toBe('connected');
    expect(store.get().file.name).toBe('game-tracker.json');
    expect(store.get().meta.dirty).toBe(false);
    expect(handle.writes).toBe(0);
  });

  it('hash igual + espejo sucio ⇒ conecta y VUELCA los pendientes (autoguardado)', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    setHandle(null); // nueva sesión sin handle en memoria
    store.set({ file: { status: 'disconnected', name: null, error: null } });
    await addGame({ title: 'Extra', today: TODAY });
    expect(store.get().meta.dirty).toBe(true);

    // El handle vuelve de IDB al restaurar; nada más lo marca editable.
    expect(await restoreSavedLink()).toBe('connected');
    expect(store.get().file.status).toBe('connected');
    expect(store.get().meta.dirty).toBe(false);
    expect(handle.writes).toBe(1);
    const dumped = JSON.parse(handle.text());
    expect(dumped.games.some((/** @type {{ title: string }} */ g) => g.title === 'Extra')).toBe(
      true
    );
  });

  it('archivo cambiado fuera + espejo sucio ⇒ conflicto real y sesión conectada', async () => {
    let conflicts = 0;
    setConflictHandler(() => {
      conflicts += 1;
    });
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    handle.setText(FILE_V2_TEXT); // cambió fuera mientras no mirábamos
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null } });
    await addGame({ title: 'Extra', today: TODAY });

    expect(await restoreSavedLink()).toBe('connected');
    expect(conflicts).toBe(1);
    expect(store.get().file.status).toBe('connected');
    setConflictHandler(() => {});
  });

  it('archivo cambiado fuera + espejo limpio ⇒ recarga limpia del contenido nuevo', async () => {
    const handle = makeHandle(FILE_V1_TEXT);
    await connectFile(FILE_V1_TEXT, handle);
    handle.setText(FILE_V2_TEXT);
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null } });

    expect(await restoreSavedLink()).toBe('connected');
    expect(store.get().doc?.games[0]?.title).toBe('Celeste');
    expect(store.get().meta.dirty).toBe(false);
  });

  it('permiso caducado ⇒ needs-gesture y sesión desconectada (el pedirlo ya es gesto)', async () => {
    const handle = makeHandle(FILE_V1_TEXT, 'prompt');
    await connectFile(FILE_V1_TEXT, handle);
    setHandle(null);
    store.set({ file: { status: 'disconnected', name: null, error: null } });

    expect(await restoreSavedLink()).toBe('needs-gesture');
    expect(store.get().file.status).toBe('disconnected');
  });
});
