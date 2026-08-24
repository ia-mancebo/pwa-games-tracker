import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, store, TABS } from '../src/app.js';
import { qs, qsa } from '../src/lib/dom.js';

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

describe('createApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    store.set({ tab: 'biblioteca' });
  });

  it('renders the rail with the three nav buttons', () => {
    const root = mount();
    createApp(root);
    const buttons = qsa('.nav button[data-tab]', root);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(TABS.map((t) => t.label));
  });

  it('clicking Novedades sets the tab and swaps main content without navigation', () => {
    const root = mount();
    createApp(root);
    const hrefBefore = window.location.href;
    btn(qs('[data-tab="novedades"]', root)).click();
    expect(store.get().tab).toBe('novedades');
    expect(qs('main', root)?.textContent).toContain('Novedades sin datos');
    expect(window.location.href).toBe(hrefBefore);
  });

  it('moves aria-current to the active tab and renders its view', () => {
    const root = mount();
    createApp(root);
    expect(qs('[data-tab="biblioteca"]', root)?.getAttribute('aria-current')).toBe('true');
    expect(qs('[data-tab="estadisticas"]', root)?.getAttribute('aria-current')).toBe('false');

    btn(qs('[data-tab="estadisticas"]', root)).click();

    expect(qs('[data-tab="estadisticas"]', root)?.getAttribute('aria-current')).toBe('true');
    expect(qs('[data-tab="biblioteca"]', root)?.getAttribute('aria-current')).toBe('false');
    expect(qs('main', root)?.textContent).toContain('Sin datos todavía');
  });
});
