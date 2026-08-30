/**
 * Regression test (scroll real): la Ficha y el drill-down de Novedades llegan
 * arriba al abrirse y el botón atrás del navegador devuelve a la Estantería y
 * al tablón con su scroll conservado. jsdom no puede verificar el atrás real:
 * el navegador restaura su propio scroll por entrada de historial
 * (scrollRestoration) y puede pisar el nuestro según el orden de los eventos.
 * Este script conduce Edge headless contra un dev server real: siembra una
 * biblioteca grande por la bienvenida y una instantánea de Novedades por IDB,
 * scrollea cada base, abre un hijo (Ficha / sección) y vuelve con `goBack()`
 * midiendo el scroll en varios instantes.
 *
 * Uso: npm run test:scroll  (o node scripts/check-scroll-restore.mjs)
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5199;
const URL = `http://localhost:${PORT}/`;

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;

/**
 * Doc de prueba: suficiente juegos para que la Estantería scrollee de verdad,
 * sin carátulas (placeholders, cero red).
 * @returns {{ schema: string, version: number, updatedAt: string, games: object[] }}
 */
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

/**
 * Instantánea del tablón: suficientes títulos por sección para que el tablón
 * scrollee de verdad; sin carátulas (placeholders, cero red).
 * @returns {Record<string, unknown>}
 */
function fixtureSnapshot() {
  const section = (prefix, count) =>
    Array.from({ length: count }, (_, i) => ({
      id: prefix + i,
      title: `${prefix} ${String(i).padStart(2, '0')}`,
      releaseDate: '2026-08-01',
      genres: [{ id: 8, name: 'Platform' }],
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

/**
 * Scroll que la superficie base tenía EN EL MOMENTO de pulsar el hijo (el
 * foco del clic puede re-anclar la página; el contrato es reponer lo que
 * había justo antes de entrar).
 * @param {import('puppeteer-core').Page} page
 * @param {string} selector
 * @returns {Promise<number>}
 */
async function tapPos(page, selector) {
  return page.evaluate(
    (sel) =>
      new Promise((resolve) => {
        const el = /** @type {HTMLElement} */ (document.querySelector(sel));
        el.addEventListener('click', () => resolve(Math.round(window.scrollY)), { once: true });
        el.click();
      }),
    selector
  );
}

/**
 * Mide el scroll tras `goBack()` en varios instantes y comprueba que el
 * navegador no pisó la restauración de la app.
 * @param {import('puppeteer-core').Page} page
 * @param {string} waitSel
 * @param {number} expected
 * @param {string} label
 */
async function assertBackRestores(page, waitSel, expected, label) {
  await page.goBack();
  await page.waitForSelector(waitSel, { timeout: 10000 });
  const samples = [];
  for (const delay of [0, 100, 300, 600]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    samples.push(await page.evaluate(() => window.scrollY));
  }
  if (samples.some((y) => y !== expected)) {
    throw new Error(
      `RED: el botón atrás no conserva el scroll de ${label} (muestras ${samples.join(', ')}; esperado ${expected})`
    );
  }
  console.log(`  ${label} restaurada a ${expected}px tras el atrás (${samples.join(', ')})`);
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'gt-scroll-'));
  const fixture = join(dir, 'game-tracker.json');
  await writeFile(fixture, JSON.stringify(fixtureDoc()), 'utf8');

  server = spawn(
    process.execPath,
    [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore' }
  );
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'shell',
    args: ['--no-first-run', '--disable-extensions'],
  });
  try {
    const page = await browser.newPage();
    // Sin FSA: la bienvenida pinta el <input type="file">, que puppeteer puede
    // sembrar. En headless el picker nativo no es manejable.
    await page.evaluateOnNewDocument(() => {
      // @ts-expect-error eliminar para forzar la vía input
      delete window.showOpenFilePicker;
    });
    await page.setViewport({ width: 1024, height: 768 });
    await page.goto(URL, { waitUntil: 'load' });

    const input = await page.waitForSelector('input[data-import-input]', { timeout: 15000 });
    await input.uploadFile(fixture);
    await page.waitForSelector('.shelves [data-game-id]', { timeout: 15000 });

    const scrollTarget = 400;
    const started = await page.evaluate((y) => {
      window.scrollTo(0, y);
      return window.scrollY;
    }, scrollTarget);
    if (started !== scrollTarget) {
      throw new Error(`RED: la Estantería no scrollea (scrollY=${started}, objetivo ${scrollTarget})`);
    }

    // El contrato: el atrás repone el scroll que la Estantería tenía EN EL
    // MOMENTO de entrar a la Ficha. El foco del clic puede re-anclar la
    // página, así que se captura la posición real al pulsar la tarjeta.
    const tapPosShelves = await tapPos(page, '.shelves [data-game-id]');
    await page.waitForSelector('.ficha', { timeout: 10000 });
    const atFicha = await page.evaluate(() => window.scrollY);
    if (atFicha !== 0) {
      throw new Error(`RED: la Ficha hereda el scroll (scrollY=${atFicha}, esperado 0)`);
    }
    console.log(`  Ficha arriba (0) al abrirse (estantería en ${tapPosShelves})`);

    await assertBackRestores(page, '.shelves [data-game-id]', tapPosShelves, 'la Estantería');

    // Instantánea de Novedades por IDB (el tablón siempre se pinta desde ahí).
    await page.evaluate(async (snap) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('game-tracker', 3);
        req.addEventListener('success', () => resolve(req.result));
        req.addEventListener('error', () => reject(req.error));
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('novedades', 'readwrite');
        tx.objectStore('novedades').put(snap, 'snapshot');
        tx.addEventListener('complete', resolve);
        tx.addEventListener('error', () => reject(tx.error));
      });
      db.close();
    }, fixtureSnapshot());

    await page.click('[data-tab="novedades"]');
    await page.waitForSelector('[data-nsection="recientes"]', { timeout: 10000 });

    const boardTarget = 200;
    const boardStarted = await page.evaluate((y) => {
      window.scrollTo(0, y);
      return window.scrollY;
    }, boardTarget);
    if (boardStarted !== boardTarget) {
      throw new Error(
        `RED: el tablón no scrollea (scrollY=${boardStarted}, objetivo ${boardTarget})`
      );
    }

    const tapPosBoard = await tapPos(page, '[data-nsection="recientes"]');
    await page.waitForSelector('[data-nback]', { timeout: 10000 });
    const atSection = await page.evaluate(() => window.scrollY);
    if (atSection !== 0) {
      throw new Error(`RED: la sección hereda el scroll (scrollY=${atSection}, esperado 0)`);
    }
    console.log(`  Sección arriba (0) al abrirse (tablón en ${tapPosBoard})`);

    await assertBackRestores(page, '[data-nsection="recientes"]', tapPosBoard, 'el tablón');

    console.log(`GREEN: Ficha y drill-down arriba; Estantería y tablón restaurados tras el atrás`);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => {
    server?.kill();
  });