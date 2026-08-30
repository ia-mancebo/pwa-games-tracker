/**
 * Hoja profunda (ticket 2, spec Q12): un único .add-layer con fondo, hoja y
 * cuerpo repintable; el módulo es dueño de TODOS los caminos de cierre
 * iniciados por el usuario (✕, fondo, Escape y botón atrás del sistema vía
 * closeTopSheet/backnav). Los adaptadores solo describen contenido y onClose.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './support/storage.js';
import { store } from '../src/app.js';
import { installBackNav, navigate, resetBackNav } from '../src/backnav.js';
import { openSheet, closeTopSheet, resetSheet } from '../src/ui/sheet.js';
import { qs, qsa } from '../src/lib/dom.js';

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

/** Contenido de prueba con dos botones enfocables. */
const CONTENT = '<button type="button" data-a>Uno</button><button type="button" data-b>Dos</button>';

beforeEach(() => {
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
  });
});

describe('openSheet · estructura y cierre programático', () => {
  it('pinta .add-layer con .add-backdrop y .add-sheet; título en el h2 y contenido en .sheet-body', () => {
    const { close, layer } = openSheet({ title: 'Ficha', content: CONTENT });

    expect(layer.classList.contains('add-sheet')).toBe(true);
    expect(layer.getAttribute('role')).toBe('dialog');
    expect(qs('.add-layer', document.body)).toBeTruthy();
    expect(qs('.add-backdrop[data-sheet-backdrop]', document.body)).toBeTruthy();
    expect(qs('h2#sheet-title', layer)?.textContent).toBe('Ficha');
    expect(qs('[data-sheet-close]', layer)).toBeTruthy();
    expect(qs('[data-sheet-body]', layer)?.querySelector('[data-a]')).toBeTruthy();
    expect(layer.getAttribute('aria-labelledby')).toBe('sheet-title');

    close();
    expect(qs('.add-layer', document.body)).toBeNull();
  });

  it('close() restaura el foco al elemento que lo tenía al abrir', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { close } = openSheet({ title: 'Ficha', content: CONTENT });
    expect(document.activeElement).not.toBe(outside);

    close();
    expect(document.activeElement).toBe(outside);
  });

  it('sin título no hay cabecera, y el foco inicial cae en el primer elemento enfocable del contenido', () => {
    const { close, layer } = openSheet({ content: CONTENT });
    expect(qs('header.add-head', layer)).toBeNull();
    expect(document.activeElement).toBe(qs('[data-a]', layer));
    close();
  });

  it('sin elementos enfocables en el contenido el foco cae en el ✕ de cabecera', () => {
    const { close, layer } = openSheet({ title: 'Solo título', content: '<p>texto</p>' });
    expect(document.activeElement).toBe(qs('[data-sheet-close]', layer));
    close();
  });
});

describe('cierres iniciados por el usuario', () => {
  it('el ✕ ([data-sheet-close]) llama a onClose una vez y retira la capa', () => {
    const onClose = vi.fn();
    const { close, layer } = openSheet({ title: 'Ficha', content: CONTENT, onClose });

    btn(qs('[data-sheet-close]', layer)).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(qs('.add-layer', document.body)).toBeNull();
    close();
  });

  it('el clic en el fondo llama a onClose una vez y retira la capa', () => {
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });

    btn(qs('.add-backdrop', document.body)).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(qs('.add-layer', document.body)).toBeNull();
  });

  it('Escape llama a onClose una vez y retira la capa', () => {
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(qs('.add-layer', document.body)).toBeNull();

    // Segunda pulsación sin hoja: el listener ya no está activo.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('una sola hoja a la vez', () => {
  it('openSheet dos veces deja UNA capa: la segunda reemplaza a la primera sin llamar a su onClose', () => {
    const firstOnClose = vi.fn();
    const { close: closeFirst } = openSheet({
      title: 'Primera',
      content: '<p>a</p>',
      onClose: firstOnClose,
    });
    const first = need(qs('.add-layer', document.body));

    const { layer: secondLayer } = openSheet({
      title: 'Segunda',
      content: '<p>b</p>',
      onClose: vi.fn(),
    });

    const layers = qsa('.add-layer', document.body);
    expect(layers).toHaveLength(1);
    expect(first.isConnected).toBe(false);
    expect(layers[0]).toBe(need(secondLayer.closest('.add-layer')));
    expect(secondLayer.isConnected).toBe(true);
    expect(firstOnClose).not.toHaveBeenCalled();

    closeFirst();
    expect(qs('.add-layer', document.body)).toBeTruthy();
  });
});

describe('closeTopSheet', () => {
  it('con hoja abierta: true, corre onClose y retira la capa', () => {
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });

    expect(closeTopSheet()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(qs('.add-layer', document.body)).toBeNull();
  });

  it('sin hoja abierta: false y no hace nada', () => {
    expect(closeTopSheet()).toBe(false);
  });
});

describe('trampa de Tab', () => {
  it('Tab avanza dentro de la hoja en ciclo (el ✕ es parte de él) y no escapa al body', () => {
    const { close, layer } = openSheet({ title: 'Ficha', content: CONTENT });
    const closeBtn = btn(qs('[data-sheet-close]', layer));
    const first = btn(qs('[data-a]', layer));
    const second = btn(qs('[data-b]', layer));
    first.focus();
    expect(document.activeElement).toBe(first);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(second);

    // En el último, Tab da la vuelta al primer enfocable de la hoja (el ✕).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeBtn);
    expect(document.activeElement).not.toBe(document.body);

    // El ciclo sigue: nunca escapa al body.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    // Shift+Tab desde el ✕ salta al último.
    closeBtn.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    expect(document.activeElement).toBe(second);
    close();
  });

  it('con el foco fuera de la hoja, Tab entra al primer elemento', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const { close, layer } = openSheet({ title: 'Ficha', content: CONTENT });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(qs('[data-a]', layer));
    close();
  });
});

describe('integración con el botón atrás del sistema', () => {
  it('history.back() cierra la hoja (onClose corre, la pantalla no cambia) y el siguiente back restaura la pantalla previa', async () => {
    installBackNav(store);
    navigate(store, 'push', { tab: 'novedades' });
    expect(store.get().tab).toBe('novedades');

    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });
    expect(qs('.add-layer', document.body)).toBeTruthy();

    // La pulsación atrás se consume cerrando la hoja: la pantalla no cambia.
    history.back();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(qs('.add-layer', document.body)).toBeNull();
    expect(store.get().tab).toBe('novedades');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('novedades');

    // El re-push deshizo el pop: el segundo back restaura la pantalla previa.
    history.back();
    await vi.waitFor(() => expect(store.get().tab).toBe('biblioteca'));
  });

  it('a profundidad 0 la hoja empuja una centinela: el atrás del sistema la cierra sin cambiar la pantalla ni dejar entradas basura', async () => {
    installBackNav(store);
    // Profundidad 0: sin entrada de historial consumible (la Ficha del tablón).
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });
    expect(qs('.add-layer', document.body)).toBeTruthy();

    history.back();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(qs('.add-layer', document.body)).toBeNull();
    expect(store.get().tab).toBe('biblioteca');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('biblioteca');

    // Sin entradas basura: el siguiente atrás no restaura nada (sale de la app).
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.get().tab).toBe('biblioteca');
  });

  it('el ✕ a profundidad 0 consume la centinela: sin dobles atrás y la siguiente hoja vuelve a cerrarse con atrás', async () => {
    installBackNav(store);
    const onClose = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose });
    btn(qs('[data-sheet-close]', document.body)).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(qs('.add-layer', document.body)).toBeNull();
    // La centinela se consumió (back + swallow): el atrás del sistema no
    // tiene nada que poppear y no repite el cierre.
    await new Promise((resolve) => setTimeout(resolve, 25));
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.get().tab).toBe('biblioteca');

    // Una hoja nueva a profundidad 0 vuelve a tener su centinela.
    const onClose2 = vi.fn();
    openSheet({ title: 'Ficha', content: CONTENT, onClose: onClose2 });
    history.back();
    await vi.waitFor(() => expect(onClose2).toHaveBeenCalledTimes(1));
    expect(qs('.add-layer', document.body)).toBeNull();
  });
});