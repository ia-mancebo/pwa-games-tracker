import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
import { qs, qsa } from '../src/lib/dom.js';
import { addTag, removeTag, tagChipsHtml, tagEditorHtml } from '../src/ui/tags.js';

beforeEach(async () => {
  document.body.innerHTML = '';
  store.set({
    tab: 'biblioteca',
    doc: null,
    meta: { dirty: false, updatedAt: null, lastSavedFileHash: null, connectedFileName: null },
    ready: false,
    library: {
      view: 'shelves',
      panelStatus: null,
      query: '',
      genre: null,
      platform: null,
      tag: null,
      gameId: null,
    },
  });
  await initLibrary();
});

describe('tagChipsHtml (Panel: solo lectura)', () => {
  it('pinta un chip .tag-mini.own por etiqueta con prefijo #', () => {
    const box = document.createElement('div');
    box.innerHTML = tagChipsHtml(['retro', 'viciante']);
    const chips = qsa('.tag-mini.own', box);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent?.trim()).toBe('#retro');
    expect(chips[1]?.textContent?.trim()).toBe('#viciante');
  });

  it('no pinta botones de quitar', () => {
    const box = document.createElement('div');
    box.innerHTML = tagChipsHtml(['retro']);
    expect(qs('[data-tag-remove]', box)).toBeNull();
    expect(qs('.tag-x', box)).toBeNull();
  });
});

describe('tagEditorHtml (Ficha: edición)', () => {
  it('pinta chips con botón [data-tag-remove] y su aria-label', () => {
    const box = document.createElement('div');
    box.innerHTML = tagEditorHtml(['retro', 'rpg']);
    const chips = qsa('.tag-mini.own', box);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent?.trim().startsWith('#retro')).toBe(true);
    const remove = qs('[data-tag-remove="retro"]', box);
    expect(remove).toBeTruthy();
    expect(remove?.getAttribute('aria-label')).toBe('Quitar retro');
    expect(remove?.textContent?.trim()).toBe('×');
  });

  it('incluye el campo [data-tag-add] con su aria-label', () => {
    const box = document.createElement('div');
    box.innerHTML = tagEditorHtml(['retro']);
    const add = qs('[data-tag-add]', box);
    expect(add).toBeTruthy();
    expect(add?.getAttribute('placeholder')).toBe('añadir…');
    expect(add?.getAttribute('aria-label')).toBe('Añadir etiqueta propia');
  });

  it('sin etiquetas muestra la pista y mantiene el campo de añadir', () => {
    const box = document.createElement('div');
    box.innerHTML = tagEditorHtml([]);
    expect(qs('.d-meta', box)?.textContent?.trim()).toBe('Sin etiquetas todavía.');
    expect(qs('[data-tag-add]', box)).toBeTruthy();
    expect(qs('[data-tag-remove]', box)).toBeNull();
  });
});

/**
 * @param {string} id
 * @returns {import('../src/domain/schema.js').Game}
 */
function findGame(id) {
  const doc = store.get().doc;
  const game = doc?.games.find((g) => g.id === id);
  if (!game) throw new Error(`juego no encontrado: ${id}`);
  return game;
}

/**
 * @param {{ id: string, title: string, tags?: string[] }[]} games
 */
async function seed(games) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games: games.map((g) => ({
      ...g,
      plays: [{ id: `${g.id}-p1`, status: 'playing', addedAt: '2026-07-01' }],
    })),
  });
}

describe('addTag (Enter en el editor)', () => {
  it('recorta, limpia el campo y añade la etiqueta vía el motor de la Ficha', async () => {
    await seed([{ id: 'g1', title: 'Hades', tags: ['retro'] }]);
    const input = document.createElement('input');
    input.value = '  viciante  ';

    await addTag(findGame('g1'), input);

    expect(input.value).toBe('');
    expect(findGame('g1').tags).toEqual(['retro', 'viciante']);
  });

  it('no deduplica: añadir dos veces la misma deja dos entradas', async () => {
    await seed([{ id: 'g1', title: 'Hades' }]);
    const input = document.createElement('input');

    input.value = 'viciante';
    await addTag(findGame('g1'), input);
    input.value = 'viciante';
    await addTag(findGame('g1'), input);

    expect(findGame('g1').tags).toEqual(['viciante', 'viciante']);
  });

  it('entrada vacía: no actualiza nada', async () => {
    await seed([{ id: 'g1', title: 'Hades', tags: ['retro'] }]);
    const input = document.createElement('input');
    input.value = '   ';

    await addTag(findGame('g1'), input);

    expect(findGame('g1').tags).toEqual(['retro']);
  });
});

describe('removeTag (× en el editor)', () => {
  it('quita la etiqueta indicada vía el motor de la Ficha', async () => {
    await seed([{ id: 'g1', title: 'Hades', tags: ['retro', 'viciante'] }]);

    await removeTag(findGame('g1'), 'retro');

    expect(findGame('g1').tags).toEqual(['viciante']);
  });

  it('quitar la única etiqueta deja la lista vacía', async () => {
    await seed([{ id: 'g1', title: 'Hades', tags: ['retro'] }]);

    await removeTag(findGame('g1'), 'retro');

    expect(findGame('g1').tags).toEqual([]);
  });

  it('quitar una etiqueta inexistente deja las demás intactas', async () => {
    await seed([{ id: 'g1', title: 'Hades', tags: ['retro'] }]);

    await removeTag(findGame('g1'), 'rpg');

    expect(findGame('g1').tags).toEqual(['retro']);
  });
});
