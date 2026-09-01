/**
 * Exportación del diálogo «Datos» con IndexedDB rota: el registro del vuelco
 * (markSaved → putMeta) es un extra tras la copia; su fallo no debe pintar el
 * export como fracasado ni enmascarar que la copia ya está en manos del
 * usuario. Aislado del resto de la suite porque el fallo de putMeta es global
 * al módulo db.js mockeado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/app.js';
import { addGame, importDoc } from '../src/data/library.js';
import { resetFilelink } from '../src/data/filelink.js';
import { sha256Hex } from '../src/services/hash.js';
import { closeDataDialog, openDataDialog } from '../src/views/dataDialog.js';
import { qs } from '../src/lib/dom.js';

vi.mock('../src/data/db.js', async (importOriginal) => {
  const actual = /** @type {typeof import('../src/data/db.js')} */ (await importOriginal());
  return { ...actual, putMeta: vi.fn(async () => Promise.reject(new Error('IDB lleno'))) };
});

const TODAY = '2026-08-25';

const DOC_A_TEXT = JSON.stringify({
  schema: 'game-tracker',
  version: 1,
  updatedAt: '2026-08-20T09:30:00Z',
  games: [{ id: 'g1', title: 'Hades', plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-08-01' }] }],
});

/** Cede macrotareas reales para que IDB (setImmediate) y crypto terminen. */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** @param {Element | null} el @returns {HTMLElement} */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

beforeEach(async () => {
  document.body.innerHTML = '';
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    file: { status: 'disconnected', name: null, error: null, conflict: null, saving: false },
    ready: false,
  });
  resetFilelink();
  await importDoc(DOC_A_TEXT, { hash: await sha256Hex(DOC_A_TEXT), fileName: null });
  await addGame({ title: 'Hades II', today: TODAY });
});

afterEach(() => {
  closeDataDialog();
  resetFilelink();
  vi.restoreAllMocks();
});

describe('exportación con registro del vuelco roto', () => {
  it('la copia descargada manda: el fallo de markSaved NO pinta error ni pierde el éxito', async () => {
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    urlApi.createObjectURL = () => 'blob:test-url';
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
      // La nota de éxito está presente y NO hay error rojo enmascarándola.
      expect(qs('.datos-note', document.body)?.textContent ?? '').toContain('Copia exportada como');
      expect(qs('.form-error', document.body)).toBeNull();
    } finally {
      appendSpy.mockRestore();
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });
});
