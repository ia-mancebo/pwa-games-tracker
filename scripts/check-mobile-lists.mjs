/**
 * Harness temporal de diagnóstico (bug móvil): entrar en las listas (Panel de
 * un Estado y drill-down de Novedades) en emulación móvil REAL (toques
 * táctiles, no clicks sintéticos) y medir, en varios instantes:
 *   - scroll del documento (debe ser 0: la tabla scrollea dentro)
 *   - scroll interno del cardbox (debe ser 0 al entrar)
 *   - overflow horizontal del documento (scrollWidth <= vw)
 *   - overflowers fuera de contenedores con scroll legítimo
 * Uso: node scripts/check-mobile-lists.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.GT_MOBILE_PORT) || 5198;
const BASE = '/pwa-games-tracker/';
const APP_URL = `http://127.0.0.1:${PORT}${BASE}`;

const VIEWPORTS = [
  { width: 360, height: 740, label: '360×740' },
  { width: 320, height: 568, label: '320×568' },
  { width: 700, height: 900, label: '700×900' },
];

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function fixtureDoc() {
  const statuses = ['backlog', 'playing', 'finished', 'abandoned'];
  const games = Array.from({ length: 260 }, (_, i) => {
    const status = statuses[i % statuses.length];
    return {
      id: `g${String(i).padStart(3, '0')}`,
      title: `Juego ${String(i).padStart(3, '0')}`,
      plays: [{ id: `g${i}-p1`, status, addedAt: `2026-0${(i % 9) + 1}-01` }],
    };
  });
  return { schema: 'game-tracker', version: 1, updatedAt: '2026-08-23T10:00:00Z', games };
}

function fixtureSnapshot() {
  const GENRES = [
    'Role-playing (RPG)',
    'Real Time Strategy (RTS)',
    'Turn-based Strategy (TBS)',
    'Point-and-click',
    'Fighting',
    'Shooter',
    'Music/Rhythm',
    'Platformer',
    'Puzzle',
    'Racing',
    'Simulation',
    'Sport',
    'Strategy',
    'Tactical',
    'Quiz/Trivia',
    'Hack and slash/Beat em up',
    'Pinball',
    'Adventure',
    'Indie',
    'Arcade',
    'Visual Novel',
    'Card & Board Game',
    'MOBA',
    'Stealth',
    'Survival Horror',
    'Battle Royale',
    'Action RPG',
    'Souls-like',
    'Roguelike',
    'Metroidvania',
    'Deckbuilding',
    'City Builder',
    'Colony Sim',
    'Management',
    '4X Strategy',
    'Grand Strategy',
    'Fishing & Hunting',
    'Party Game',
    'Sandbox',
    'Open World',
    'Linear',
    'Exploration',
    'Crafting',
    'Base Building',
  ];
  const section = (prefix, count) =>
    Array.from({ length: count }, (_, i) => ({
      id: prefix + i,
      title: `${prefix} ${String(i).padStart(2, '0')}`,
      releaseDate: '2026-08-01',
      genres: [{ id: i % GENRES.length, name: GENRES[i % GENRES.length] }],
      platforms: [{ id: 130, name: 'Nintendo Switch' }],
    }));
  return {
    recientes: section(100, 80),
    proximos: section(200, 80),
    populares: section(300, 80),
    esperados: section(400, 80),
    generatedAt: '2026-08-24T09:30:00.000Z',
    savedAt: new Date().toISOString(),
  };
}

function overflowScanBody(expectedVw) {
  const SCROLL_SEL =
    '.nav, .chip-row, .month-strip, .tag-list, .d-gallery, .row, .add-sheet, .add-results-list';
  const vw = expectedVw;
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
      overflowers.push({
        el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || ''}`,
        right: Math.round(r.right),
        culprit: `${culprit.tagName.toLowerCase()}.${String(culprit.className).split(' ')[0] || ''}`,
        html: culprit.outerHTML.slice(0, 300),
      });
    }
  });
  return {
    vw,
    innerWidth: window.innerWidth,
    docW: document.documentElement.scrollWidth,
    scrollY: Math.round(window.scrollY),
    cardbox: (() => {
      const box = document.querySelector('.cardbox.tight');
      if (!box) return null;
      return {
        scrollTop: box.scrollTop,
        scrollLeft: box.scrollLeft,
        scrollHeight: box.scrollHeight,
        clientHeight: box.clientHeight,
        clientWidth: box.clientWidth,
        scrollWidth: box.scrollWidth,
        overflowX: window.getComputedStyle(box).overflowX,
        overflowY: window.getComputedStyle(box).overflowY,
      };
    })(),
    chipRows: [...document.querySelectorAll('.chip-row')].map((r) => {
      const last = r.lastElementChild;
      const rect = r.getBoundingClientRect();
      return {
        dim: r.getAttribute('data-dim'),
        clientW: r.clientWidth,
        scrollW: r.scrollWidth,
        overflowX: window.getComputedStyle(r).overflowX,
        right: Math.round(rect.right),
        lastRight: last ? Math.round(last.getBoundingClientRect().right) : null,
      };
    }),
    toolbar: [...document.querySelectorAll('.toolbar')].map((r) => {
      const rect = r.getBoundingClientRect();
      return {
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        scrollW: r.scrollWidth,
      };
    }),
    active: document.activeElement
      ? `${document.activeElement.tagName.toLowerCase()}.${String(document.activeElement.className).split(' ')[0] || ''}`
      : null,
    pageOverflows: document.documentElement.scrollWidth > vw + 1,
    overflowers: overflowers.slice(0, 10),
  };
}

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

async function startServer() {
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: 'ignore' }
  );
  const ready = await waitForServer(APP_URL, 20000);
  if (!ready) {
    child.kill();
    throw new Error('vite dev no respondió');
  }
  return child;
}

/** Toque táctil real sobre el centro del selector (no click sintético). */
async function tapSel(page, selector) {
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, selector);
  if (!rect) throw new Error(`[harness] selector no encontrado: ${selector}`);
  await page.touchscreen.tap(rect.x, rect.y);
}

/**
 * Scrollea la página hasta que el selector quede visible dentro del viewport
 * (a ~120px del borde superior), dejando la página SÍ scrolleada.
 */
async function scrollToShow(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, y - 120));
  }, selector);
  await new Promise((r) => setTimeout(r, 150));
}

/** Muestra completa del estado del scroll en un instante. */
async function sample(page, vp, label, delay) {
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  const m = await page.evaluate(overflowScanBody, vp.width);
  const ok =
    m.scrollY === 0 && !m.pageOverflows && m.overflowers.length === 0 && (m.cardbox ? m.cardbox.scrollTop === 0 : true);
  console.log(
    `  ${ok ? 'GREEN' : 'RED'} ${label} t=${delay}ms: scrollY=${m.scrollY} docW=${m.docW} vw=${m.vw} innerWidth=${m.innerWidth} cardbox=${JSON.stringify(m.cardbox)} active=${m.active}`
  );
  if (!ok) {
    console.log(JSON.stringify(m, null, 2));
    if (m.pageOverflows || m.overflowers.length > 0) console.log(JSON.stringify(m.overflowers, null, 2));
  }
  return ok;
}

async function seedSnapshot(page, snap) {
  await page.evaluate(async (data) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('game-tracker', 3);
      req.addEventListener('success', () => resolve(req.result));
      req.addEventListener('error', () => reject(req.error));
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('novedades', 'readwrite');
      tx.objectStore('novedades').put(data, 'snapshot');
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
    db.close();
  }, snap);
}

async function runViewport(browser, vp) {
  const dir = await mkdtemp(join(tmpdir(), 'gt-mobile-'));
  const fixture = join(dir, 'game-tracker.json');
  await writeFile(fixture, JSON.stringify(fixtureDoc()), 'utf8');

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const failures = [];
  const fail = (label) => failures.push(label);

  try {
    await page.emulate({
      viewport: { width: vp.width, height: vp.height, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
      userAgent: UA,
    });
    await page.evaluateOnNewDocument(() => {
      // @ts-expect-error forzar la vía input file (sin FSA en headless)
      delete window.showOpenFilePicker;
    });

    await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 });
    const input = await page.waitForSelector('input[data-import-input]', { timeout: 15000 });
    await input.uploadFile(fixture);
    await page.waitForSelector('.shelves [data-game-id]', { timeout: 15000 });

    /* ---- Caso A: Panel (Jugando), entrar desde arriba sin scroll previo ---- */
    await tapSel(page, '.shelf .plate[data-open-panel="playing"]');
    await page.waitForSelector('.b-row', { timeout: 10000 });
    let ok = await sample(page, vp, 'Panel desde arriba', 0);
    ok = (await sample(page, vp, 'Panel desde arriba', 300)) && ok;
    ok = (await sample(page, vp, 'Panel desde arriba', 600)) && ok;
    if (!ok) fail('Panel desde arriba');

    /* ---- Caso B: Panel, entrar desde la estantería scrolleada ---- */
    await tapSel(page, '[data-back-shelves]');
    await page.waitForSelector('.shelves', { timeout: 10000 });
    await scrollToShow(page, '.shelf .plate[data-open-panel="playing"]');
    const scrolled = await page.evaluate(() => Math.round(window.scrollY));
    console.log(`  [setup] estantería scrolleada a ${scrolled}px`);
    if (scrolled < 100) throw new Error('[harness] la estantería no scrollea: caso B inválido');
    await tapSel(page, '.shelf .plate[data-open-panel="playing"]');
    await page.waitForSelector('.b-row', { timeout: 10000 });
    ok = await sample(page, vp, 'Panel desde scrolleada', 0);
    ok = (await sample(page, vp, 'Panel desde scrolleada', 300)) && ok;
    ok = (await sample(page, vp, 'Panel desde scrolleada', 600)) && ok;
    if (!ok) fail('Panel desde scrolleada');

    /* ---- Caso C: drill-down de Novedades ---- */
    await tapSel(page, '[data-back-shelves]');
    await page.waitForSelector('.shelves', { timeout: 10000 });
    await seedSnapshot(page, fixtureSnapshot());
    await tapSel(page, '[data-tab="novedades"]');
    await page.waitForSelector('[data-nsection="recientes"]', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await scrollToShow(page, '[data-nsection="recientes"]');
    console.log(`  [setup] tablón scrolleado a ${await page.evaluate(() => Math.round(window.scrollY))}px`);

    await tapSel(page, '[data-nsection="recientes"]');
    await page.waitForSelector('.n-table', { timeout: 10000 });
    ok = await sample(page, vp, 'Drill-down', 0);
    ok = (await sample(page, vp, 'Drill-down', 300)) && ok;
    ok = (await sample(page, vp, 'Drill-down', 600)) && ok;
    if (!ok) fail('Drill-down');
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
  return failures;
}

const server = await startServer();
console.log(`[harness] servidor en ${APP_URL}`);

const watchdog = setTimeout(() => {
  console.error('\n[harness] TIMEOUT GLOBAL: el bucle se colgó (tope 90 s)');
  try {
    server.kill();
  } catch {
    /* ya muerto */
  }
  process.exit(2);
}, 90000);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'shell',
  args: ['--no-first-run', '--disable-extensions', '--disable-gpu'],
});

let totalFailures = 0;
const CASE_COUNT = 3;
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.label} ===`);
    const failures = await runViewport(browser, vp);
    totalFailures += failures.length;
    console.log(`  → ${vp.label}: ${CASE_COUNT - failures.length}/${CASE_COUNT} casos GREEN`);
  }
} finally {
  clearTimeout(watchdog);
  await browser.close();
  server.kill();
}

if (totalFailures > 0) {
  console.error(`\nRED: ${totalFailures} caso(s) con scroll/overflow roto en móvil`);
  process.exit(1);
} else {
  console.log('\nGREEN: listas móviles sin scroll heredado ni overflow');
  process.exit(0);
}