/**
 * Modal grande de arranque sin enlace de archivo: solo aparece con biblioteca
 * cargada, se cierra con «Seguir por ahora», se cierra solo al conectar y
 * «Empezar biblioteca nueva» nace vacía.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { store } from '../src/app.js';
import { importDoc, initLibrary, newLibrary } from '../src/data/library.js';
import {
  openReconnectModal,
  resetReconnectModal,
} from '../src/ui/reconnectModal.js';
import { qs } from '../src/lib/dom.js';

/** @param {Element | null} el @returns {HTMLElement} */
function btn(el) {
  if (!el) throw new Error('elemento no encontrado');
  return /** @type {HTMLElement} */ (el);
}

/** @param {Element | null} el @returns {Element} */
function need(el) {
  if (!el) throw new Error('elemento no encontrado');
  return el;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetReconnectModal();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    tabRole: 'primary',
    file: { status: 'disconnected', name: null, error: null, conflict: null },
  });
  await initLibrary();
});

describe('modal de reconexión', () => {
  it('no aparece sin biblioteca cargada; con biblioteca sí', async () => {
    openReconnectModal();
    expect(qs('.reconnect-layer', document.body)).toBeNull();

    await newLibrary(new Date());
    store.set({
      meta: { ...store.get().meta, connectedFileName: 'game-tracker.json' },
    });
    openReconnectModal();
    const layer = need(qs('.reconnect-layer', document.body));
    expect(layer.getAttribute('role')).toBeNull();
    const sheet = need(qs('.add-sheet.reconnect-sheet', layer));
    expect(sheet.getAttribute('role')).toBe('alertdialog');
    expect(qs('#reconnect-title', sheet)?.textContent).toContain('Archivo no conectado');
  });

  it('«Seguir por ahora» lo cierra sin tocar la biblioteca', async () => {
    await newLibrary(new Date());
    openReconnectModal();
    btn(qs('[data-dismiss-reconnect]', document.body)).click();
    expect(qs('.reconnect-layer', document.body)).toBeNull();
    expect(store.get().doc?.games).toHaveLength(0);
  });

  it('se cierra automáticamente cuando la sesión conecta por otra vía', async () => {
    await newLibrary(new Date());
    openReconnectModal();
    expect(qs('.reconnect-layer', document.body)).toBeTruthy();
    store.set({ file: { status: 'connected', name: 'game-tracker.json', error: null, conflict: null } });
    expect(qs('.reconnect-layer', document.body)).toBeNull();
  });

  it('«Empezar biblioteca nueva» descarta el espejo y nace vacía', async () => {
    await newLibrary(new Date());
    await importDoc({
      schema: 'game-tracker',
      version: 1,
      updatedAt: '2026-08-23T10:00:00Z',
      games: [
        { id: 'g1', title: 'Hades', plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-07-01' }] },
        { id: 'g2', title: 'Coco', plays: [{ id: 'g2-p1', status: 'finished', addedAt: '2026-06-01' }] },
      ],
    });
    openReconnectModal();
    expect((store.get().doc?.games.length ?? -1) > 0).toBe(true);
    btn(qs('[data-new-library]', document.body)).click();
    await vi.waitFor(() => {
      if ((store.get().doc?.games.length ?? 1) !== 0) throw new Error('biblioteca aún no vacía');
    });
    expect(store.get().meta.dirty).toBe(true);
    expect(qs('.reconnect-layer', document.body)).toBeNull();
  });
});
