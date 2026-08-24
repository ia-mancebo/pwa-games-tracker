import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, store } from '../src/app.js';
import { initLibrary } from '../src/data/library.js';
import { handleImportPick, handleImportText, handleNewLibrary, resetWelcome } from '../src/views/welcome.js';
import { qs, qsa } from '../src/lib/dom.js';
import { sha256Hex } from '../src/services/hash.js';

/** Doc v1 válido para importar. */
function validDoc() {
  return {
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'g1',
        title: 'Celeste',
        plays: [{ id: 'p1', status: 'finished', addedAt: '2026-08-01', rating: 5 }],
      },
      {
        id: 'g2',
        title: 'Hades',
        plays: [{ id: 'p2', status: 'playing', addedAt: '2026-08-02' }],
      },
    ],
  };
}

/**
 * @returns {HTMLElement}
 */
function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
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

beforeEach(async () => {
  document.body.innerHTML = '';
  resetWelcome();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
  });
  await initLibrary();
});

describe('puerta de bienvenida', () => {
  it('con ready y sin doc muestra las dos opciones y bloquea la navegación', () => {
    const root = mount();
    createApp(root);
    expect(qs('.welcome', root)).toBeTruthy();
    expect(qs('[data-action="import"]', root)).toBeTruthy();
    expect(qs('[data-action="new"]', root)).toBeTruthy();
    expect(qs('.welcome', root)?.textContent).toContain('Tu biblioteca, en un archivo que es tuyo.');
    expect(qs('.nav', root)?.className).toContain('disabled');
    expect(qsa('.nav button[disabled]', root)).toHaveLength(3);
  });

  it('«Empezar biblioteca nueva» (clic) crea el doc, quita la bienvenida y pinta las 4 baldas', async () => {
    const root = mount();
    createApp(root);
    btn(qs('[data-action="new"]', root)).click();
    await vi.waitFor(() => expect(qs('.shelves', root)).toBeTruthy());
    expect(store.get().doc).not.toBeNull();
    expect(store.get().meta.dirty).toBe(true);
    expect(qs('.welcome', root)).toBeNull();
    expect(qs('.nav', root)?.className).not.toContain('disabled');
    const plates = qsa('.plate', root);
    expect(plates).toHaveLength(4);
    expect(plates[0]?.textContent).toContain('Jugando');
    expect(plates[1]?.textContent).toContain('Quiero jugar');
  });

  it('handleNewLibrary directo también deja la app operativa', async () => {
    await handleNewLibrary();
    expect(store.get().doc).toEqual({
      schema: 'game-tracker',
      version: 1,
      updatedAt: expect.any(String),
      games: [],
    });
    expect(store.get().meta.dirty).toBe(true);
  });

  it('la balda muestra conteo y media ★ con coma decimal', async () => {
    const root = mount();
    createApp(root);
    await handleImportText(JSON.stringify(validDoc()), 'game-tracker.json');
    const plates = qsa('.plate', root).map((p) => p.textContent ?? '');
    expect(plates[0]).toContain('Jugando');
    expect(plates[0]).toContain('1 · ★ —');
    expect(plates[2]).toContain('Terminado');
    expect(plates[2]).toContain('1 · ★ 5');
  });
});

describe('importar texto', () => {
  it('JSON inválido muestra el motivo inline y no toca nada', async () => {
    const root = mount();
    createApp(root);
    const imported = await handleImportText('{{{ no es json', null);
    expect(imported).toBe(false);
    expect(store.get().doc).toBeNull();
    expect(qs('.form-error', root)?.textContent).toContain('JSON');
    expect(qs('.welcome', root)).toBeTruthy();
  });

  it('doc válido importa, fija hash y nombre, y desaparece la bienvenida', async () => {
    const root = mount();
    createApp(root);
    const text = JSON.stringify(validDoc());
    const imported = await handleImportText(text, 'game-tracker.json');
    expect(imported).toBe(true);
    expect(store.get().doc?.games).toHaveLength(2);
    expect(store.get().meta).toMatchObject({
      dirty: false,
      lastSavedFileHash: await sha256Hex(text),
      connectedFileName: 'game-tracker.json',
    });
    expect(qs('.welcome', root)).toBeNull();
    expect(qsa('.plate', root)).toHaveLength(4);
  });

  it('versión futura rechazada con mensaje claro y estado intacto', async () => {
    const root = mount();
    createApp(root);
    await handleImportText(JSON.stringify({ ...validDoc(), version: 7 }), null);
    expect(qs('.form-error', root)?.textContent).toContain('Actualiza la app');
    expect(store.get().doc).toBeNull();
    expect(qs('.welcome', root)).toBeTruthy();
  });
});

describe('File System Access', () => {
  it('sin FSA existe input de respaldo y el botón lo dispara sin cambiar nada', () => {
    const root = mount();
    createApp(root);
    const input = /** @type {HTMLInputElement} */ (qs('input[data-import-input]', root));
    expect(input).toBeTruthy();
    let clicked = false;
    input.click = () => {
      clicked = true;
    };
    btn(qs('[data-action="import"]', root)).click();
    expect(clicked).toBe(true);
    expect(store.get().doc).toBeNull();
    expect(qs('.form-error', root)).toBeNull();
  });

  it('cancelar el picker (AbortError) es silencioso: sin error ni cambios', async () => {
    const root = mount();
    createApp(root);
    const err = new Error('cancelado');
    err.name = 'AbortError';
    const win = /** @type {any} */ (window);
    win.showOpenFilePicker = () => Promise.reject(err);
    try {
      await handleImportPick();
      expect(qs('.form-error', root)).toBeNull();
    } finally {
      delete win.showOpenFilePicker;
    }
    expect(store.get().doc).toBeNull();
    expect(qs('.welcome', root)).toBeTruthy();
  });

  it('fallo del picker distinto de AbortError muestra el error inline', async () => {
    const root = mount();
    createApp(root);
    const win = /** @type {any} */ (window);
    win.showOpenFilePicker = () => Promise.reject(new Error('SecurityError'));
    try {
      await handleImportPick();
      expect(qs('.form-error', root)?.textContent).toContain('SecurityError');
    } finally {
      delete win.showOpenFilePicker;
    }
    expect(store.get().doc).toBeNull();
  });
});
