/**
 * Regression test (aviso real, ticket 10): lo que jsdom no alcanza del Aviso
 * del Contador (comportamiento del ticket 08). Este script conduce Edge
 * headless contra un dev server real:
 * siembra una biblioteca por la bienvenida, arranca el Contador desde la Ficha
 * y verifica el reloj vivo del aviso (H:MM:SS que avanza), su presencia en las
 * tres pestañas, el Pausar inline (el reloj se va, queda el Tramo pendiente) y
 * la supervivencia a una recarga real: el boot (resumeCounter) convierte el
 * tiempo de pared en Tramo pendiente y el aviso pasa a modo solo pendientes.
 *
 * Uso: npm run test:aviso  (o node scripts/check-navegador-aviso.mjs)
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5203;
const URL = `http://localhost:${PORT}/`;
const CLOCK_RE = /^\d+:\d{2}:\d{2}$/;

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;

/**
 * Doc de prueba v2: pocos juegos (la superficie no scrollea), con
 * `playedSeconds` opcional en alguna jugada para ejercitar el tiempo
 * consolidado; sin carátulas (placeholders, cero red).
 * @returns {{ schema: string, version: number, updatedAt: string, games: object[] }}
 */
function fixtureDoc() {
  const statuses = ['backlog', 'playing', 'finished', 'abandoned'];
  const games = Array.from({ length: 4 }, (_, i) => ({
    id: `g${i}`,
    title: `Juego ${String(i).padStart(3, '0')}`,
    plays: [
      {
        id: `g${i}-p1`,
        status: statuses[i % statuses.length],
        addedAt: '2026-09-01',
        ...(i % 2 === 0 ? { playedSeconds: 1800 + i * 600 } : {}),
      },
    ],
  }));
  return { schema: 'game-tracker', version: 2, updatedAt: '2026-09-30T10:00:00Z', games };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Segundos de un reloj H:MM:SS.
 * @param {string} text
 * @returns {number}
 */
function clockSeconds(text) {
  const [h, m, s] = text.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Texto del reloj vivo del Aviso.
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<string>}
 */
function readLive(page) {
  return page.$eval('[data-aviso-live]', (el) => (el.textContent ?? '').trim());
}

/**
 * Comprueba que el reloj vivo avanza: dos muestras separadas ~1200 ms y la
 * segunda debe ser mayor. El tictac global se reinicia con cada suscripción
 * (re-render intermedio), así que se tolera un par de muestras extra antes de
 * declarar RED.
 * @param {import('puppeteer-core').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function assertLiveGrows(page, label) {
  const first = await readLive(page);
  if (!CLOCK_RE.test(first)) {
    throw new Error(`RED: el reloj del aviso no es H:MM:SS en ${label} ("${first}")`);
  }
  let best = clockSeconds(first);
  let last = first;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1200);
    last = await readLive(page);
    const value = clockSeconds(last);
    if (value > best) {
      console.log(`  ${label}: reloj vivo ${first} -> ${last}`);
      return;
    }
    best = Math.max(best, value);
  }
  throw new Error(`RED: el reloj del aviso no avanza en ${label} ("${first}" -> "${last}")`);
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'gt-aviso-'));
  const fixture = join(dir, 'game-tracker.json');
  await writeFile(fixture, JSON.stringify(fixtureDoc()), 'utf8');

  server = spawn(
    process.execPath,
    [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore' }
  );
  await sleep(3000);

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

    // (a) Ficha del primer juego + Iniciar: el aviso nace con reloj vivo.
    await page.click('.shelves [data-game-id]');
    await page.waitForSelector('.ficha', { timeout: 10000 });
    await page.click('[data-counter-toggle]');
    await page.waitForSelector('[data-aviso-live]', { timeout: 15000 });
    await assertLiveGrows(page, 'Aviso en la Ficha');

    // (b) El aviso es chrome: sigue vivo en las tres pestañas.
    await page.click('[data-tab="novedades"]');
    await page.waitForSelector('[data-aviso-live]', { timeout: 10000 });
    await assertLiveGrows(page, 'Aviso en Novedades');
    await page.click('[data-tab="estadisticas"]');
    await page.waitForSelector('[data-aviso-live]', { timeout: 10000 });
    await assertLiveGrows(page, 'Aviso en Estadísticas');
    await page.click('[data-tab="biblioteca"]');
    await page.waitForSelector('[data-aviso-live]', { timeout: 10000 });
    await assertLiveGrows(page, 'Aviso al volver a Biblioteca');

    // (c) Pausar inline: el reloj se va y queda el Tramo pendiente.
    await page.click('[data-aviso-pause]');
    await page.waitForSelector('[data-aviso-pendientes]', { timeout: 10000 });
    if (await page.$('[data-aviso-live]')) {
      throw new Error('RED: el reloj del aviso sigue vivo tras Pausar inline');
    }
    console.log('  Pausar inline: reloj fuera, tramo pendiente señalado');

    // Limpieza: el cuerpo del aviso abre la Ficha del juego con el tramo y se
    // descarta allí; sin pendientes ni Contador el aviso sale del DOM.
    await page.click('[data-aviso-open]');
    await page.waitForSelector('.ficha', { timeout: 10000 });
    await page.waitForSelector('[data-seg-discard]', { timeout: 10000 });
    await page.click('[data-seg-discard]');
    await page.waitForSelector('[data-aviso-open]', { hidden: true, timeout: 10000 });
    console.log('  Tramo descartado: el aviso desaparece');

    // (d) RELOAD real: el boot convierte el ancla en Tramo pendiente (tiempo
    // de pared) y el aviso pasa a modo solo pendientes, sin reloj.
    await page.click('[data-counter-toggle]');
    await page.waitForSelector('[data-aviso-live]', { timeout: 15000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.shelves [data-game-id]', { timeout: 20000 });
    await page.waitForSelector('[data-aviso-pendientes]', { timeout: 15000 });
    if (await page.$('[data-aviso-live]')) {
      throw new Error('RED: tras la recarga el reloj sigue vivo en vez de quedar como Tramo pendiente');
    }
    const pending = await page.$eval('[data-aviso-pendientes]', (el) =>
      el.getAttribute('data-aviso-pendientes')
    );
    if (pending !== '1') {
      throw new Error(`RED: tras la recarga el aviso no señala exactamente 1 Tramo pendiente ("${pending}")`);
    }
    console.log('  Recarga real: tiempo de pared como 1 Tramo pendiente, sin reloj vivo');

    console.log(
      'GREEN: aviso vivo (H:MM:SS creciente) en la Ficha y las tres pestañas, Pausar inline con Tramo pendiente y superviviente a la recarga (solo pendientes)'
    );
  } finally {
    // `browser.close()` se queda colgado si Edge no responde a su cierre (p. ej.
    // tras un rato con la app viva): se mata el proceso, se acota el cierre y se
    // desconecta para limpiar los timers del protocolo y que Node salga solo.
    browser.process()?.kill();
    await Promise.race([browser.close(), sleep(5000)]);
    await browser.disconnect();
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
