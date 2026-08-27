/**
 * Regression test (layout): las filas de chips no deben ensanchar la página.
 * Carga el CSS real de la app y el DOM exacto de library/stats (toolbar > filters
 * > chip-row) y novedades drill-down (toolbar > chip-row), mide con Edge headless
 * y falla (exit 1) si el documento se ensancha o ningún chip-row scrollea.
 * Regresión guardada: `.filters` debe poder encoger (min-width: 0) para que
 * `overflow-x: auto` de `.chip-row` se active en vez de desbordar la página.
 *
 * Uso: npm run test:layout  (o node scripts/check-layout.mjs)
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const css = (
  await Promise.all(
    ['tokens.css', 'base.css', 'components.css'].map((f) =>
      readFile(join(root, 'src', 'styles', f), 'utf8')
    )
  )
).join('\n');

const chips = (count, cls = 'chip') =>
  Array.from({ length: count }, (_, i) => `<button type="button" class="${cls}">Género ${i + 1}</button>`).join('');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>${css}</style>
</head>
<body>
  <div class="shell">
    <nav class="rail">raíl</nav>
    <main class="main">
      <h2>Biblioteca</h2>
      <div class="toolbar">
        <input class="search" placeholder="Buscar…" />
        <div class="filters">
          <div class="chip-row" data-dim="genre">${chips(30)}</div>
          <div class="chip-row" data-dim="platform">${chips(10)}</div>
          <div class="chip-row" data-dim="tag">${chips(5)}</div>
        </div>
      </div>
      <h2>Novedades (drill-down)</h2>
      <div class="toolbar">
        <div class="chip-row">${chips(30, 'chip-xs chip')}</div>
      </div>
    </main>
  </div>
</body>
</html>`;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'shell',
  args: ['--no-first-run', '--disable-extensions'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  await page.setContent(html, { waitUntil: 'load' });
  const report = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const vw = window.innerWidth;
    const rows = [...document.querySelectorAll('.chip-row')].map((r) => ({
      label: r.getAttribute('data-dim') ?? '(drill)',
      clientWidth: r.clientWidth,
      scrollWidth: r.scrollWidth,
    }));
    const overflowers = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 || rect.left < -1) {
        overflowers.push(`${el.tagName}.${String(el.className).split(' ')[0] ?? ''} right=${Math.round(rect.right)}`);
      }
    });
    return { docW, vw, rows, overflowers };
  });
  console.log(JSON.stringify(report, null, 2));
  const pageOk = report.docW <= report.vw + 1;
  const scrollEngaged = report.rows.filter((r) => r.scrollWidth > r.clientWidth).length;
  if (!pageOk) {
    throw new Error('RED: el documento se ensancha (scrollWidth > viewport)');
  } else if (scrollEngaged === 0) {
    throw new Error('RED: ningún chip-row necesita scroll (sospechoso)');
  } else {
    console.log(`GREEN: página ${report.docW}px, ${scrollEngaged}/${report.rows.length} filas scrollean`);
  }
} finally {
  await browser.close();
}