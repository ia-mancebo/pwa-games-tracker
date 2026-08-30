/**
 * Regression test (scroll real): la Ficha llega arriba al abrirse y el botón
 * atrás del navegador devuelve a la Estantería con su scroll conservado.
 * jsdom no puede verificar el atrás real: el navegador restaura su propio
 * scroll por entrada de historial (scrollRestoration) y puede pisar el
 * nuestro según el orden de los eventos. Este script conduce Edge headless
 * contra un dev server real: siembra una biblioteca grande por la bienvenida,
 * scrollea la Estantería, abre una Ficha y vuelve con `goBack()` midiendo el
 * scroll en varios instantes.
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
    const tapPos = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const card = /** @type {HTMLElement} */ (document.querySelector('.shelves [data-game-id]'));
          card.addEventListener(
            'click',
            () => resolve(Math.round(window.scrollY)),
            { once: true }
          );
          card.click();
        })
    );
    await page.waitForSelector('.ficha', { timeout: 10000 });
    const atFicha = await page.evaluate(() => window.scrollY);
    if (atFicha !== 0) {
      throw new Error(`RED: la Ficha hereda el scroll (scrollY=${atFicha}, esperado 0)`);
    }

    await page.goBack();
    await page.waitForSelector('.shelves [data-game-id]', { timeout: 10000 });
    const samples = [];
    for (const delay of [0, 100, 300, 600]) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      samples.push(await page.evaluate(() => window.scrollY));
    }
    console.log(
      JSON.stringify({ scrollTarget, tapPos, atFicha, samples }, null, 2)
    );
    if (samples.some((y) => y !== tapPos)) {
      throw new Error(
        `RED: el botón atrás no conserva el scroll de la Estantería (muestras ${samples.join(', ')}; esperado ${tapPos})`
      );
    }
    console.log(
      `GREEN: Ficha arriba (0) y Estantería restaurada a ${tapPos}px tras el atrás`
    );
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