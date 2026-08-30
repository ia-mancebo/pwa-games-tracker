/**
 * Intents de las transiciones de Novedades (src/navigation.js, ADR-0008):
 * sección con push de historial, vuelta al tablón con back, género y Ficha
 * externa sin entradas propias, el refresco automático al entrar en la
 * pestaña y que la Instantánea nunca viaja en los snapshots de backnav.
 * Patrón de history fake de tests/navigation.test.js y tests/backnav.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import {
  backToNovedadesBoard,
  closeNovedadesDetail,
  openNovedadesDetail,
  openNovedadesSection,
  switchTab,
  toggleNovedadesGenre,
} from '../src/navigation.js';
import { installBackNav, resetBackNav } from '../src/backnav.js';
import { resetSheet } from '../src/ui/sheet.js';
import * as novedadesData from '../src/data/novedades.js';

/**
 * Siembra la biblioteca importando un doc (misma vía que la bienvenida).
 */
async function seed() {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: [
      {
        id: 'g1',
        title: 'Hades',
        plays: [{ id: 'g1-p1', status: 'playing', addedAt: '2026-07-01' }],
      },
    ],
  });
}

beforeEach(async () => {
  document.body.innerHTML = '';
  resetBackNav();
  resetSheet();
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    tabRole: 'primary',
    library: {
      view: 'shelves',
      panelStatus: null,
      query: '',
      genre: null,
      platform: null,
      tag: null,
      gameId: null,
    },
    novedades: { section: null, genre: null, detail: null },
    novedadesUi: {
      snapshot: null,
      loading: false,
      refreshing: false,
      degraded: null,
      adding: false,
    },
  });
  await initLibrary();
  await seed();
});

describe('sección · costura directa', () => {
  it('openNovedadesSection empuja historial y backToNovedadesBoard consume la entrada', async () => {
    installBackNav(store);
    openNovedadesSection(store, 'recientes');
    expect(store.get().novedades.section).toBe('recientes');

    backToNovedadesBoard(store);
    expect(store.get().novedades.section).toBeNull();
    // El popstate pendiente se traga: la instantánea obsoleta no restaura.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().novedades.section).toBeNull();

    // El back interno consumió la entrada: el siguiente back del sistema
    // restaura la raíz de la pestaña (sin sección).
    history.back();
    await vi.waitFor(() => expect(store.get().novedades.section).toBeNull());
  });

  it('la sección es una pantalla: el atrás del sistema vuelve al tablón', async () => {
    installBackNav(store);
    openNovedadesSection(store, 'recientes');
    expect(store.get().novedades.section).toBe('recientes');

    history.back();
    await vi.waitFor(() => expect(store.get().novedades.section).toBeNull());
    expect(store.get().novedades.genre).toBeNull();
    expect(store.get().novedades.detail).toBeNull();
  });
});

describe('género y Ficha externa · sin entradas de historial', () => {
  it('toggleNovedadesGenre alterna el filtro sin tocar el historial', async () => {
    installBackNav(store);
    store.set({ novedades: { section: 'recientes', genre: null, detail: null } });
    const pushSpy = vi.spyOn(history, 'pushState');

    toggleNovedadesGenre(store, 'RPG');
    expect(store.get().novedades.genre).toBe('RPG');
    toggleNovedadesGenre(store, 'RPG');
    expect(store.get().novedades.genre).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });

  it('openNovedadesDetail y closeNovedadesDetail no crean entradas de historial', async () => {
    installBackNav(store);
    const pushSpy = vi.spyOn(history, 'pushState');

    openNovedadesDetail(store, 'recientes:0');
    expect(store.get().novedades.detail).toBe('recientes:0');
    closeNovedadesDetail(store);
    expect(store.get().novedades.detail).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });
});

describe('pulsar Novedades reinicia al tablón', () => {
  it('estando en una sección, switchTab a Novedades vuelve al tablón', () => {
    installBackNav(store);
    openNovedadesSection(store, 'recientes');
    expect(store.get().novedades.section).toBe('recientes');

    switchTab(store, 'novedades');
    expect(store.get().novedades.section).toBeNull();
    expect(store.get().novedades.genre).toBeNull();
    expect(store.get().novedades.detail).toBeNull();
  });

  it('viniendo de otra pestaña, switchTab a Novedades repone el tablón', () => {
    installBackNav(store);
    openNovedadesSection(store, 'recientes');
    expect(store.get().novedades.section).toBe('recientes');

    switchTab(store, 'biblioteca');
    switchTab(store, 'novedades');
    expect(store.get().novedades.section).toBeNull();
  });
});

describe('refresco automático al entrar en Novedades', () => {
  it('switchTab a Novedades desde otra pestaña dispara autoRefreshIfNeeded', async () => {
    installBackNav(store);
    const spy = vi.spyOn(novedadesData, 'autoRefreshIfNeeded').mockResolvedValue(null);

    switchTab(store, 'novedades');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('pulsar Novedades ya estando en Novedades no dispara el refresco', async () => {
    installBackNav(store);
    const spy = vi.spyOn(novedadesData, 'autoRefreshIfNeeded').mockResolvedValue(null);

    switchTab(store, 'novedades');
    switchTab(store, 'novedades');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('la Instantánea no viaja en los snapshots de historial', () => {
  it('ningún push incluye novedadesUi ni la Instantánea', async () => {
    installBackNav(store);
    store.set({
      novedadesUi: {
        ...store.get().novedadesUi,
        snapshot: {
          recientes: [],
          proximos: [],
          populares: [],
          esperados: [],
          savedAt: '2026-08-24T09:30:00.000Z',
        },
      },
    });

    openNovedadesSection(store, 'recientes');

    const entry = /** @type {{app?: import('../src/backnav.js').NavSnapshot}} */ (history.state);
    expect(/** @type {any} */ (entry.app)?.novedadesUi).toBeUndefined();
    expect(entry.app?.novedades?.section).toBe('recientes');

    // Un restore antiguo no aplasta la Instantánea viva.
    history.back();
    await vi.waitFor(() => expect(store.get().novedades.section).toBeNull());
    expect(store.get().novedadesUi.snapshot).not.toBeNull();
  });
});