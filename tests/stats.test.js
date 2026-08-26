import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, store } from '../src/app.js';
import { importDoc, initLibrary } from '../src/data/library.js';
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

/**
 * @param {Element | null} el
 * @returns {Element}
 */
function need(el) {
  if (!el) throw new Error('elemento no encontrado');
  return el;
}

/**
 * Siembra la biblioteca importando un doc (misma vía que la bienvenida).
 * @param {object[]} games
 */
async function seed(games) {
  await importDoc({
    schema: 'game-tracker',
    version: 1,
    updatedAt: '2026-08-23T10:00:00Z',
    games,
  });
}

/** Biblioteca de ejemplo: dos con nota y plataformas compartidas, una sin nada. */
const SAMPLE_GAMES = [
  {
    id: 'g1',
    title: 'Hades',
    genres: [{ id: 1, name: 'RPG' }],
    platforms: [{ id: 130, name: 'Nintendo Switch' }],
    tags: ['indie'],
    plays: [{ id: 'g1-p1', status: 'finished', addedAt: '2026-05-01', rating: 5 }],
  },
  {
    id: 'g2',
    title: 'Celeste',
    genres: [{ id: 2, name: 'Plataformas' }],
    platforms: [
      { id: 130, name: 'Nintendo Switch' },
      { id: 6, name: 'PC' },
    ],
    tags: ['indie', 'difícil'],
    plays: [{ id: 'g2-p1', status: 'playing', addedAt: '2026-06-01', rating: 4 }],
  },
  {
    id: 'g3',
    title: 'Gris',
    genres: [{ id: 2, name: 'Plataformas' }],
    platforms: [{ id: 6, name: 'PC' }],
    plays: [{ id: 'g3-p1', status: 'backlog', addedAt: '2026-07-01' }],
  },
];

/**
 * Pone la app en la pestaña Estadísticas sobre un root montado.
 * @param {HTMLElement} root
 */
function openStats(root) {
  createApp(root);
  btn(qs('[data-tab="estadisticas"]', root)).click();
}

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
    stats: { platform: null, genre: null, tag: null },
  });
  await initLibrary();
});

describe('dashboard de estadísticas', () => {
  it('los KPIs cuadran con la biblioteca sembrada: total, cuatro estados y media ★', async () => {
    await seed(SAMPLE_GAMES);
    const root = mount();
    openStats(root);

    /** @param {string} id */
    const kpi = (id) => qs(`[data-kpi="${id}"] .num`, root)?.textContent?.trim() ?? '';
    expect(kpi('total')).toBe('3');
    expect(kpi('backlog')).toBe('1');
    expect(kpi('playing')).toBe('1');
    expect(kpi('finished')).toBe('1');
    expect(kpi('abandoned')).toBe('0');
    expect(kpi('avg')).toBe('4,5');
  });

  it('los avisos de distribución y Top 5 vacíos pintan como elemento, no como texto escapado', async () => {
    await seed([
      { id: 'g1', title: 'Gris', plays: [{ id: 'g1-p1', status: 'backlog', addedAt: '2026-07-01' }] },
    ]);
    const root = mount();
    openStats(root);

    // Sin plataforma/género/etiquetas ni valoraciones: esas cuatro cajas
    // muestran su aviso como <p class="d-meta"> real; devuelto como cadena
    // plana llegaba ESCAPADO al interpolarse en la plantilla html. «Terminados
    // en el tiempo» siempre pinta su ventana de 12 meses, sin aviso.
    const notices = qsa('section.cardbox > p.d-meta', root);
    expect(notices).toHaveLength(4);
    for (const p of notices.slice(0, 3)) expect(p.textContent?.trim()).toBe('Sin datos.');
    expect(notices[3].textContent?.trim()).toBe('Sin valoraciones todavía.');
    expect(root.textContent).not.toContain('<p class="d-meta">');
  });

  it('las tres filas de filtros empiezan con «Todas» activa', async () => {
    await seed(SAMPLE_GAMES);
    const root = mount();
    openStats(root);

    for (const dim of ['platform', 'genre', 'tag']) {
      const row = qs(`[data-dim="${dim}"]`, root);
      if (!row) throw new Error(`fila ausente: ${dim}`);
      const first = /** @type {HTMLElement} */ (row.querySelector('.chip'));
      expect(first.textContent.trim()).toBe('Todas');
      expect(first.classList.contains('on')).toBe(true);
    }
    expect(qsa('.chip-row', root)).toHaveLength(3);
  });

  it('clicar un chip de plataforma recompute los KPIs y marca el chip activo', async () => {
    await seed(SAMPLE_GAMES);
    const root = mount();
    openStats(root);

    btn(qs('[data-f-platform="Nintendo Switch"]', root)).click();

    expect(qs('[data-kpi="total"] .num', root)?.textContent?.trim()).toBe('2');
    const active = qs('[data-dim="platform"] .chip.on', root);
    expect(active?.textContent.trim()).toBe('Nintendo Switch');
    // Acumula con la dimensión género sin perder la primera selección.
    expect(qs('[data-dim="platform"] .chip.on', root)).toBe(active);
  });

  it('filtros sin resultados muestran el aviso y «Quitar filtros» restaura', async () => {
    await seed(SAMPLE_GAMES);
    const root = mount();
    openStats(root);

    btn(qs('[data-f-platform="PC"]', root)).click();
    btn(qs('[data-f-genre="RPG"]', root)).click();

    expect(qs('.stats-empty', root)?.textContent).toContain('Sin resultados con estos filtros');
    expect(qs('[data-clear-filters]', root)).not.toBeNull();
    expect(qs('[data-kpi="total"]', root)).toBeNull();

    btn(qs('[data-clear-filters]', root)).click();

    expect(qs('[data-kpi="total"] .num', root)?.textContent?.trim()).toBe('3');
    expect(qsa('.chip.on', need(qs('[data-dim="platform"]', root)))).toHaveLength(1);
  });

  it('el Top 5 es lo único clicable y abre la Ficha del juego', async () => {
    await seed(SAMPLE_GAMES);
    const root = mount();
    openStats(root);

    const rows = qsa('.top-row[data-game-id]', root);
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-game-id')).toBe('g1');
    expect(rows[0].textContent).toContain('Hades');

    btn(rows[1]).click();

    expect(store.get().library.gameId).toBe('g2');
    expect(store.get().tab).toBe('biblioteca');
    expect(qs('.ficha', root)).not.toBeNull();
  });

  it('con una biblioteca vacía muestra el estado amable', async () => {
    await seed([]);
    const root = mount();
    openStats(root);

    expect(qs('.empty', root)?.textContent).toContain(
      'Cuando añadas juegos verás aquí tus estadísticas.',
    );
    expect(qs('[data-kpi]', root)).toBeNull();
  });
});
