/**
 * Suite de humo del composition root (ticket 04, ADR-0010): `start(root)`
 * cablea los diez pasos del arranque en orden — sheet closer antes de
 * createApp (antes de que exista historial que consumirlo), handler y
 * suscripción de conflicto antes de cualquier restore que pueda elevarlo,
 * autoguardado al final de la secuencia funcional — y `registerSW` corre
 * fuera del `if (root)` como en el main.js tribal. Sin render: los módulos
 * se espean y solo se aserta el ORDEN del cableado. `resetBoot()` es el
 * teardown único que compone los resets de los módulos con estado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/app.js';
import { start, resetBoot } from '../src/boot.js';

/** Registro de llamadas compartido por los espias de módulo (vi.hoisted:
 *  las fábricas de vi.mock corren antes que el cuerpo del archivo). */
const { calls } = vi.hoisted(() => ({ calls: /** @type {string[]} */ ([]) }));

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => {
    calls.push('registerSW');
    return vi.fn();
  }),
}));

vi.mock('../src/ui/sheet.js', () => ({
  initSheet: vi.fn(() => calls.push('initSheet')),
  resetSheet: vi.fn(() => calls.push('resetSheet')),
}));

vi.mock('../src/data/library.js', () => ({
  initLibrary: vi.fn(async () => calls.push('initLibrary')),
}));

vi.mock('../src/app.js', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    createApp: vi.fn(() => calls.push('createApp')),
  };
});

vi.mock('../src/data/filelink.js', () => ({
  restoreSavedLink: vi.fn(async () => {
    calls.push('restoreSavedLink');
    return 'connected';
  }),
  setConflictHandler: vi.fn(() => calls.push('setConflictHandler')),
  startAutosave: vi.fn(() => calls.push('startAutosave')),
  resetFilelink: vi.fn(() => calls.push('resetFilelink')),
}));

vi.mock('../src/ui/conflictDialog.js', () => ({
  openConflict: vi.fn(() => calls.push('openConflict')),
  initConflictDialog: vi.fn(() => calls.push('initConflictDialog')),
}));

vi.mock('../src/data/covers.js', () => ({
  initCoverSeeding: vi.fn(() => calls.push('initCoverSeeding')),
  resetCoverSeeding: vi.fn(() => calls.push('resetCoverSeeding')),
}));

vi.mock('../src/data/tablock.js', () => ({
  acquireTabLock: vi.fn(async () => {
    calls.push('acquireTabLock');
    return true;
  }),
  onLockReleased: vi.fn(() => calls.push('onLockReleased')),
  resetTablock: vi.fn(() => calls.push('resetTablock')),
}));

vi.mock('../src/data/novedades.js', () => ({
  initNovedadesRetry: vi.fn(() => calls.push('initNovedadesRetry')),
  resetNovedadesRefresh: vi.fn(() => calls.push('resetNovedadesRefresh')),
}));

vi.mock('../src/services/fsa.js', () => ({
  hasFsa: vi.fn(() => false),
}));

vi.mock('../src/ui/reconnectModal.js', () => ({
  openReconnectModal: vi.fn(() => calls.push('openReconnectModal')),
  resetReconnectModal: vi.fn(() => calls.push('resetReconnectModal')),
}));

vi.mock('../src/data/persist.js', () => ({
  requestPersistOnce: vi.fn(async () => calls.push('requestPersistOnce')),
}));

vi.mock('../src/backnav.js', () => ({
  resetBackNav: vi.fn(() => calls.push('resetBackNav')),
}));

vi.mock('../src/ui/toasts.js', () => ({
  showOfflineToast: vi.fn(),
  showUpdateToast: vi.fn(),
}));

/** @returns {HTMLElement} */
function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
  calls.length = 0;
  vi.clearAllMocks();
  store.set({
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false },
    ready: false,
    tabRole: 'primary',
  });
});

describe('start(root): orden del cableado', () => {
  it('registra el sheet closer ANTES de createApp (antes de que exista historial que consumirlo)', async () => {
    await start(mount());

    expect(calls.indexOf('initSheet')).toBeLessThan(calls.indexOf('createApp'));
  });

  it('registra el handler y la suscripción de conflicto ANTES de restoreSavedLink', async () => {
    await start(mount());

    expect(calls.indexOf('setConflictHandler')).toBeLessThan(calls.indexOf('restoreSavedLink'));
    expect(calls.indexOf('initConflictDialog')).toBeLessThan(calls.indexOf('restoreSavedLink'));
  });

  it('startAutosave va al final de la secuencia funcional, tras el restore condicional', async () => {
    await start(mount());

    expect(calls.indexOf('startAutosave')).toBeGreaterThan(calls.indexOf('restoreSavedLink'));
  });

  it('con biblioteca en el espejo, requestPersistOnce cierra la secuencia funcional', async () => {
    store.set({ doc: /** @type {any} */ ({}), ready: true });
    await start(mount());

    expect(calls.indexOf('requestPersistOnce')).toBeGreaterThan(calls.indexOf('startAutosave'));
  });
});

describe('registerSW fuera del if (root)', () => {
  it('con root null el flujo del service worker sigue disparándose (como main.js hoy)', async () => {
    await start(null);

    expect(calls).toContain('registerSW');
  });

  it('con root null no arranca nada de la app', async () => {
    await start(null);

    expect(calls).not.toContain('initLibrary');
    expect(calls).not.toContain('createApp');
  });
});

describe('resetBoot', () => {
  it('compone los resets de los módulos con estado en un solo seam, sin lanzar', () => {
    expect(() => resetBoot()).not.toThrow();

    expect(calls).toEqual(
      expect.arrayContaining([
        'resetFilelink',
        'resetSheet',
        'resetBackNav',
        'resetCoverSeeding',
        'resetTablock',
        'resetNovedadesRefresh',
        'resetReconnectModal',
      ]),
    );
  });
});