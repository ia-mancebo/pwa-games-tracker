/**
 * Regression test (overflow horizontal móvil, app REAL): arranca vite, pasa la
 * puerta de bienvenida por UI real (biblioteca nueva + altas manuales con
 * títulos largos y plataformas propias largas), siembra Novedades con fixtures
 * interceptados (sin red) y recorre cada superficie a 360×740 y 320×568.
 *
 * Falla (exit 1) si en alguna superficie el documento se ensancha
 * (scrollWidth > innerWidth + 1) o hay elementos que desbordan el viewport
 * fuera de contenedores con scroll horizontal legítimo (.nav, .chip-row,
 * .month-strip, .tag-list, .d-gallery, .row, .add-sheet).
 *
 * Uso: npm run test:overflow:mobile  (o node scripts/check-overflow-mobile.mjs)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.GT_OVF_PORT) || 5199;
const BASE = '/pwa-games-tracker/';
const APP_URL = `http://127.0.0.1:${PORT}${BASE}`;
const WORKER_URL = 'https://fixture.local';

const VIEWPORTS = [
  { width: 360, height: 740, label: '360×740' },
  { width: 320, height: 568, label: '320×568' },
];

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** Altas manuales: títulos largos + plataforma propia larga (spec §8.4). */
const GAMES = [
  {
    title: 'The Legend of Zelda: Tears of the Kingdom',
    status: 'playing',
    tags: 'aventura, mundo abierto',
    platforms: 'Nintendo Switch',
    screenshots:
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/a.jpg, https://images.igdb.com/igdb/image/upload/t_screenshot_big/b.jpg, https://images.igdb.com/igdb/image/upload/t_screenshot_big/c.jpg',
    plays: 3,
  },
  {
    title: 'Elden Ring: Shadow of the Erdtree',
    status: 'finished',
    tags: 'rol, difícil',
    platforms: 'Mi emulador de sobremesa portátil',
    screenshots:
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/d.jpg, https://images.igdb.com/igdb/image/upload/t_screenshot_big/e.jpg',
    plays: 1,
  },
  {
    title: "Baldur's Gate 3",
    status: 'backlog',
    tags: 'rol, cooperativo',
    platforms: 'PC (Steam Deck)',
    screenshots: '',
    plays: 1,
  },
];

function fixtureGame(id, title, date, platforms) {
  return {
    igdbId: id,
    title,
    releaseDate: date,
    coverUrl: null,
    description:
      'Descripción larga de prueba para estresar el layout de la ficha externa y del drill-down de novedades.',
    genres: [{ id, name: 'Género de prueba' }],
    platforms: platforms.map((name, i) => ({ id: id * 10 + i, name })),
    screenshots: [],
  };
}

const RECIENTES = [
  'The Legend of Zelda: Tears of the Kingdom',
  'Elden Ring: Shadow of the Erdtree',
  "Baldur's Gate 3: Deluxe Edition",
  'Final Fantasy VII Rebirth',
  'Persona 3 Reload: Episode Aigis',
  'Metroid Prime 4: Beyond',
  'Silent Hill 2 Remake',
  "Dragon's Dogma II",
  'Hades II',
  'Black Myth: Wukong',
  'Stellar Blade',
  'Like a Dragon: Infinite Wealth',
];
const PROXIMOS = [
  'Hollow Knight: Silksong',
  'Grand Theft Auto VI',
  'The Elder Scrolls VI',
  'Monster Hunter Wilds',
  'Death Stranding 2: On The Beach',
  'Ghost of Yotei',
  "Marvel's Wolverine",
  'Fable (2026)',
  'Crimson Desert',
  'The Witcher IV',
  "Assassin's Creed: Shadows",
  'Splinter Cell Remake',
];
const POPULARES = [
  'Cyberpunk 2077: Phantom Liberty',
  'Red Dead Redemption 2',
  'The Witcher 3: Wild Hunt',
  'God of War Ragnarök',
  'Horizon Forbidden West',
  'Elden Ring',
];
const ESPERADOS = [
  'Half-Life 3',
  'The Legend of Zelda: A Link to the Past 2',
  'Portal 3',
  'Silksong: Hollow Knight',
  'Starfield: Shattered Space',
  'Mass Effect 5',
];

const NOVEDADES_FIXTURE = {
  recientes: RECIENTES.map((t, i) => fixtureGame(100 + i, t, '2026-08-01', ['Nintendo Switch', 'PC (Steam Deck)'])),
  proximos: PROXIMOS.map((t, i) => fixtureGame(200 + i, t, '2026-09-15', ['Mi emulador de sobremesa portátil'])),
  populares: POPULARES.map((t, i) => fixtureGame(300 + i, t, '2026-07-20', ['PC (Steam Deck)', 'PlayStation 5'])),
  esperados: ESPERADOS.map((t, i) => fixtureGame(400 + i, t, '2026-10-01', ['Nintendo Switch'])),
  generatedAt: new Date().toISOString(),
};

/* ------------------------------------------------------------------ */
/* Servidor                                                           */
/* ------------------------------------------------------------------ */

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function spawnVite(args) {
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));
  return { child, logs };
}

async function startServer() {
  // Intento 1 y 2: vite dev.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const s = spawnVite(['--port', String(PORT), '--strictPort', '--host', '127.0.0.1']);
    const ready = await waitForServer(APP_URL, 20000);
    if (ready) return { ...s, mode: 'dev' };
    s.child.kill();
    console.error(`[harness] vite dev no respondió (intento ${attempt}/2)`);
  }
  // Fallback: build + preview.
  console.error('[harness] dev server falló 2 veces → vite build + preview');
  const build = spawnVite(['build']);
  await new Promise((resolve) => build.child.on('exit', resolve));
  const preview = spawnVite(['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1']);
  const ready = await waitForServer(APP_URL, 20000);
  if (!ready) {
    preview.child.kill();
    throw new Error('vite preview tampoco respondió: PARO (no puedo medir sin servidor)');
  }
  return { ...preview, mode: 'preview' };
}

/* ------------------------------------------------------------------ */
/* Medición                                                           */
/* ------------------------------------------------------------------ */

/** Cuerpo de detección de overflowers, ejecutado DENTRO de la página.
 * `expectedVw` es el ancho de dispositivo emulado (vp.width): en emulación
 * móvil, un contenido más ancho que el viewport puede EXPANDIR innerWidth
 * (shrink-to-fit) y enmascarar el overflow; el ancho de dispositivo es la
 * referencia correcta (en un móvil real innerWidth == device-width). */
function overflowScanBody(expectedVw) {
  const SCROLL_SEL =
    '.nav, .chip-row, .month-strip, .tag-list, .d-gallery, .row, .add-sheet, .add-results-list';
  const vw = expectedVw;
  const innerWidth = window.innerWidth;
  const scrollAncestors = new Set();
  document.querySelectorAll(SCROLL_SEL).forEach((el) => {
    const cs = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowX)) scrollAncestors.add(el);
  });
  const overflowers = [];
  document.querySelectorAll('*').forEach((el) => {
    let p = el.parentElement;
    while (p) {
      if (scrollAncestors.has(p)) return;
      p = p.parentElement;
    }
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      overflowers.push({
        el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || ''}`,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  });
  return {
    vw,
    innerWidth,
    docW: document.documentElement.scrollWidth,
    pageOverflows: document.documentElement.scrollWidth > vw + 1,
    overflowers: overflowers.slice(0, 25),
  };
}

async function measurePage(page, expectedVw) {
  return page.evaluate(overflowScanBody, expectedVw);
}

async function dumpAncestors(page, expectedVw) {
  return page.evaluate((vw) => {
    const SCROLL_SEL =
      '.nav, .chip-row, .month-strip, .tag-list, .d-gallery, .row, .add-sheet, .add-results-list';
    const scrollAncestors = new Set();
    document.querySelectorAll(SCROLL_SEL).forEach((el) => {
      const cs = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowX)) scrollAncestors.add(el);
    });
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      let p = el.parentElement;
      while (p) {
        if (scrollAncestors.has(p)) return;
        p = p.parentElement;
      }
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        let anc = el.parentElement;
        let culprit = el;
        while (anc && anc !== document.body) {
          const ar = anc.getBoundingClientRect();
          if (ar.right > vw + 1 || ar.width > vw) {
            culprit = anc;
            break;
          }
          anc = anc.parentElement;
        }
        out.push({
          el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || ''}`,
          right: Math.round(r.right),
          culprit: `${culprit.tagName.toLowerCase()}.${String(culprit.className).split(' ')[0] || ''}`,
          html: culprit.outerHTML.slice(0, 700),
        });
      }
    });
    return out.slice(0, 10);
  }, expectedVw);
}

/* ------------------------------------------------------------------ */
/* Flujo por viewport                                                 */
/* ------------------------------------------------------------------ */

/**
 * Clic por evaluate: la app re-renderiza agresivamente (cada store.set pinta
 * el shell entero) y el page.click de puppeteer (scroll + click) pierde la
 * carrera contra un nodo que se desmonta a mitad de gesto. El clic sintético
 * del DOM dispara el mismo handler de delegación y es determinista.
 */
async function clickSel(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  if (!ok) throw new Error(`[harness] selector no encontrado: ${selector}`);
}

async function editField(page, field, value) {
  await clickSel(page, `[data-edit-field="${field}"]`);
  await page.waitForSelector(`[data-field-form="${field}"]`, { timeout: 5000 });
  await page.$eval(`[data-field-form="${field}"] [data-field-input]`, (el, v) => {
    el.value = v;
  }, value);
  await clickSel(page, `[data-field-form="${field}"] [data-field-save]`);
  // El guardado es asíncrono (IDB): el formulario se cierra al instante pero el
  // re-render con el valor persistido llega después. Esperar a que el DOM lo
  // refleje evita que el siguiente paso toque un nodo ya desmontado.
  if (field === 'screenshots') {
    await page.waitForSelector('[data-sec="gallery"]', { timeout: 5000 });
  } else {
    await page.waitForFunction(
      (f, v) => {
        const sec = document.querySelector(`[data-sec="${f}"]`);
        return sec && !sec.querySelector('[data-field-form]') && sec.textContent.includes(v);
      },
      { timeout: 5000 },
      field,
      value
    );
  }
}

async function runViewport(browser, vp) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const failures = [];
  const measure = async (label) => {
    const r = await measurePage(page, vp.width);
    const ok = !r.pageOverflows && r.overflowers.length === 0;
    console.log(`  ${ok ? 'GREEN' : 'RED'} ${label}: docW=${r.docW} vw=${r.vw} innerWidth=${r.innerWidth} overflowers=${r.overflowers.length}`);
    if (!ok) {
      failures.push(label);
      console.log(JSON.stringify(r, null, 2));
      const dump = await dumpAncestors(page, vp.width);
      console.log(JSON.stringify(dump, null, 2));
    }
    return ok;
  };

  try {
    await page.emulate({
      viewport: { width: vp.width, height: vp.height, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
      userAgent: UA,
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith(WORKER_URL)) {
        // El fetch del cliente es cross-origin: la respuesta interceptada debe
        // llevar CORS o el navegador la rechaza (net::ERR_FAILED).
        const cors = { 'Access-Control-Allow-Origin': '*' };
        const path = new URL(url).pathname;
        if (path === '/api/novedades') {
          req.respond({
            status: 200,
            contentType: 'application/json',
            headers: cors,
            body: JSON.stringify(NOVEDADES_FIXTURE),
          });
        } else if (path === '/api/search') {
          req.respond({
            status: 200,
            contentType: 'application/json',
            headers: cors,
            body: JSON.stringify({ results: [] }),
          });
        } else if (path === '/api/health') {
          req.respond({
            status: 200,
            contentType: 'application/json',
            headers: cors,
            body: JSON.stringify({ ok: true }),
          });
        } else {
          req.respond({ status: 404, contentType: 'application/json', headers: cors, body: '{}' });
        }
        return;
      }
      if (url.startsWith('https://images.igdb.com/')) {
        req.abort();
        return;
      }
      req.continue();
    });

    // Puerta de bienvenida → biblioteca nueva.
    await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-action="new"]', { timeout: 15000 });
    await clickSel(page, '[data-action="new"]');
    await page.waitForSelector('[data-add-game]', { timeout: 10000 });

    // Altas manuales por UI real.
    for (const game of GAMES) {
      await clickSel(page, '[data-add-game]');
      await page.waitForSelector('[data-manual-pane]', { timeout: 5000 });
      await page.$eval('input[name="title"]', (el, v) => {
        el.value = v;
      }, game.title);
      await clickSel(page, `.status-chip[data-status="${game.status}"]`);
      await page.$eval('input[name="tags"]', (el, v) => {
        el.value = v;
      }, game.tags);
      await clickSel(page, '[data-save-add]');
      await page.waitForFunction(() => !document.querySelector('.add-layer'), { timeout: 5000 });
    }

    // Plataformas propias largas + capturas (galería) + jugadas extra vía Ficha.
    for (const game of GAMES) {
      await page.evaluate((title) => {
        const card = [...document.querySelectorAll('.card[data-game-id]')].find(
          (c) => c.getAttribute('title') === title
        );
        if (card) card.click();
      }, game.title);
      await page.waitForSelector('.ficha', { timeout: 5000 });
      if (game.platforms) await editField(page, 'platforms', game.platforms);
      if (game.screenshots) await editField(page, 'screenshots', game.screenshots);
      for (let i = 1; i < game.plays; i++) {
        await clickSel(page, '[data-add-play]');
        await page.waitForFunction(
          (n) => document.querySelectorAll('[data-play-card]').length === n,
          { timeout: 8000 },
          i + 1
        );
      }
      await clickSel(page, '[data-back-ficha]');
      await page.waitForSelector('.shelves', { timeout: 5000 });
    }

    // Conexión al proxy (fixtures) vía diálogo Datos.
    await clickSel(page, '.bar-datos');
    await page.waitForSelector('[data-worker-url]', { timeout: 5000 });
    await page.$eval('[data-worker-url]', (el, v) => {
      el.value = v;
    }, WORKER_URL);
    await clickSel(page, '[data-save-worker]');
    await page.waitForFunction(
      () => document.querySelector('[data-sheet-body]')?.textContent.includes('Conexión guardada'),
      { timeout: 5000 }
    );
    await clickSel(page, '[data-sheet-close]');
    await page.waitForFunction(() => !document.querySelector('.add-layer'), { timeout: 5000 });

    // Novedades: refresco con fixtures → tablón real.
    await clickSel(page, '[data-tab="novedades"]');
    await page.waitForSelector('[data-nov] .shelf, [data-retry], [data-refresh]', { timeout: 15000 });
    const hasShelf = await page.$('[data-nov] .shelf');
    if (!hasShelf) {
      const retry = await page.$('[data-retry]');
      await clickSel(page, retry ? '[data-retry]' : '[data-refresh]');
      await page.waitForSelector('[data-nov] .shelf', { timeout: 15000 });
    }

    // Recorrido de superficies.
    await clickSel(page, '[data-tab="biblioteca"]');
    await page.waitForSelector('.shelves', { timeout: 5000 });
    await measure('Biblioteca estantería');

    await clickSel(page, '[data-open-panel="playing"]');
    await page.waitForSelector('.b-row', { timeout: 5000 });
    await measure('Panel (Jugando)');

    await page.evaluate((title) => {
      const row = [...document.querySelectorAll('.b-row[data-game-id]')].find(
        (r) => r.querySelector('.b-title')?.textContent === title
      );
      if (row) row.click();
    }, GAMES[0].title);
    await page.waitForSelector('.ficha', { timeout: 5000 });
    await measure('Ficha (galería + jugadas)');

    await clickSel(page, '[data-tab="novedades"]');
    await page.waitForSelector('[data-nov] .shelf', { timeout: 10000 });
    await measure('Novedades tablón');

    await clickSel(page, '[data-nsection]');
    await page.waitForSelector('.n-table', { timeout: 5000 });
    await measure('Novedades drill-down');

    await clickSel(page, '[data-ndetail]');
    await page.waitForSelector('.add-layer', { timeout: 5000 });
    await measure('Novedades ficha externa');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.add-layer'), { timeout: 5000 });

    await clickSel(page, '[data-tab="estadisticas"]');
    await page.waitForSelector('.kpi-grid, .stats-empty, .empty', { timeout: 5000 });
    await measure('Estadísticas');

    await clickSel(page, '.bar-datos');
    await page.waitForSelector('[data-sheet-body]', { timeout: 5000 });
    await measure('Datos hoja abierta');

    // Caso mínimo de regresión (deploy): el filebar en estado de error con un
    // mensaje largo desbordaba la página (.pill-btn con white-space:nowrap sin
    // max-width). El working tree ya lo arregla; este check lo fija.
    await page.evaluate(() => {
      const slot = document.querySelector('.filebar-slot');
      if (slot) {
        slot.innerHTML = `<div class="filebar">
          <span class="pill-btn">No se pudo escribir el archivo: permiso denegado para el directorio seleccionado</span>
          <button type="button" class="chip chip-xs" data-retry>Reintentar</button>
          <button type="button" class="chip chip-xs bar-datos" data-open-data>Datos</button>
        </div>`;
      }
    });
    await measure('Filebar error largo');
  } finally {
    await context.close();
  }
  return failures;
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

const server = await startServer();
console.log(`[harness] servidor ${server.mode} en ${APP_URL}`);

// Watchdog global: el bucle nunca debe colgarse (tope duro de la tarea).
const watchdog = setTimeout(() => {
  console.error('\n[harness] TIMEOUT GLOBAL: el bucle se colgó (tope 100 s)');
  try {
    server.child.kill();
  } catch {
    /* ya muerto */
  }
  process.exit(2);
}, 100000);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'shell',
  args: ['--no-first-run', '--disable-extensions', '--disable-gpu'],
});

let totalFailures = 0;
const SURFACE_COUNT = 9;
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.label} ===`);
    const failures = await runViewport(browser, vp);
    totalFailures += failures.length;
    console.log(`  → ${vp.label}: ${SURFACE_COUNT - failures.length}/${SURFACE_COUNT} superficies GREEN`);
  }
} finally {
  clearTimeout(watchdog);
  await browser.close();
  server.child.kill();
}

if (totalFailures > 0) {
  console.error(`\nRED: ${totalFailures} superficie(s) con overflow horizontal en móvil`);
  process.exit(1);
} else {
  console.log('\nGREEN: sin overflow horizontal en móvil (360×740 y 320×568)');
}