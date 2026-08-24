import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, store, TABS } from '../src/app.js';
import { initLibrary, newLibrary, addGame, ratePlay } from '../src/data/library.js';
import { qs, qsa } from '../src/lib/dom.js';

const TODAY = '2026-08-24';
const NOW = new Date('2026-08-24T10:00:00Z');

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
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
  });
  await initLibrary();
});

describe('createApp', () => {
  it('sin biblioteca cargada muestra la bienvenida y bloquea la navegación', () => {
    const root = mount();
    createApp(root);
    expect(qs('.welcome', root)).toBeTruthy();
    expect(qs('main', root)?.textContent).not.toContain('Novedades sin datos');
    expect(qs('.nav', root)?.className).toContain('disabled');
    expect(qsa('.nav button[disabled]', root)).toHaveLength(3);
  });

  it('renders the rail with the three nav buttons', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);
    const buttons = qsa('.nav button[data-tab]', root);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(TABS.map((t) => t.label));
  });

  it('clicking Novedades sets the tab and swaps main content without navigation', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);
    const hrefBefore = window.location.href;
    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');
    expect(qs('main', root)?.textContent).toContain('Novedades sin datos');
    expect(window.location.href).toBe(hrefBefore);
  });

  it('moves aria-current to the active tab and renders its view', async () => {
    await newLibrary(NOW);
    const root = mount();
    createApp(root);
    expect(qs('[data-tab="biblioteca"]', root)?.getAttribute('aria-current')).toBe('true');
    expect(qs('[data-tab="estadisticas"]', root)?.getAttribute('aria-current')).toBe('false');

    btn(qs('[data-tab="estadisticas"]', root)).click();

    expect(qs('[data-tab="estadisticas"]', root)?.getAttribute('aria-current')).toBe('true');
    expect(qs('[data-tab="biblioteca"]', root)?.getAttribute('aria-current')).toBe('false');
    expect(qs('main', root)?.textContent).toContain('Sin datos todavía');
  });

  it('rail widgets show real counts and average from the doc', async () => {
    await newLibrary(NOW);
    const doc = await addGame({ title: 'Hades', today: TODAY, status: 'playing' });
    const [game] = doc.games;
    await ratePlay(game.id, game.plays[0].id, 4);
    const root = mount();
    createApp(root);
    const values = qsa('.bw b', root).map((el) => el.textContent?.trim());
    expect(values).toEqual(['1', '0', '4']);
  });

  it('rail widgets show dashes without a doc', () => {
    const root = mount();
    createApp(root);
    const values = qsa('.bw b', root).map((el) => el.textContent?.trim());
    expect(values).toEqual(['0', '0', '—']);
  });
});
