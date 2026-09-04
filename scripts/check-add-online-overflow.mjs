/**
 * Regression test (overflow de la búsqueda online de la hoja de Alta): las
 * tarjetas de resultados (.add-result) y la previsualización (.add-preview) no
 * deben desbordar su contenedor. Carga el CSS real y el DOM exacto de
 * resultItemHtml/previewHtml (src/views/addSheet.js) con contenido estresante
 * (título larguísimo, subtítulo con año + 6 plataformas largas, géneros largos,
 * descripción larga, galería de capturas), mide con Edge headless a 1280×800
 * (escritorio) y 360×740 (móvil) y falla (exit 1) si una tarjeta o la
 * previsualización desborda horizontalmente su contenedor o el viewport.
 *
 * Uso: npm run test:add-online:overflow  (o node scripts/check-add-online-overflow.mjs)
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

const TITLE = 'The Legend of Zelda: Tears of the Kingdom — Edición Definitiva del Coleccionista';
const PLATFORMS = [
  'Mi emulador de sobremesa portátil',
  'Nintendo Switch 2 - Edición limitada',
  'PlayStation 5 Pro',
  'Xbox Series X|S',
  'PC (Steam Deck)',
  'RetroArch en consola',
];
const GENRES = [
  'Role-playing (RPG)',
  'Action-Adventure',
  'Real Time Strategy (RTS)',
  'Point-and-click',
  'Survival Horror',
  'Hack and slash/Beat em up',
  'Turn-based Strategy (TBS)',
  'Card & Board Game',
];
const DESCRIPTION =
  'Un título tan largo que debería caber siempre, y sin embargo estresa la previsualización: ' +
  'una descripción muy larga con muchas palabras y frases que se extienden durante varias líneas ' +
  'para comprobar que el texto envuelve bien dentro de la tarjeta y jamás desborda el contenedor ' +
  'de resultados de la búsqueda online de la hoja de Alta del gestor de juegos.';
const SCREENSHOTS = Array.from(
  { length: 6 },
  (_, i) => `https://images.igdb.com/igdb/image/upload/t_screenshot_big/s${i}.jpg`
);

const cover = `<span class="cover" style="--c1:hsl(210 46% 40%);--c2:hsl(252 54% 19%)"><b>TL</b></span>`;

const resultsHtml = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body>
  <div class="add-layer">
    <div class="add-backdrop" data-sheet-backdrop></div>
    <section class="add-sheet" role="dialog" aria-modal="true">
      <header class="add-head"><h2>Añadir juego</h2><button type="button" class="chip" data-sheet-close>✕</button></header>
      <div class="sheet-body" data-sheet-body>
        <div class="add-paths">
          <button type="button" class="add-tab on" data-online-tab>Buscar online</button>
          <button type="button" class="add-tab" data-manual-tab>Crear manualmente</button>
        </div>
        <div class="add-online" data-online-pane>
          <input type="text" name="online-query" placeholder="Busca juegos por título…" autocomplete="off" />
          <div class="add-online-results" data-online-results>
            <ul class="add-results-list">
              ${Array.from(
                { length: 5 },
                (_, i) => `<li>
                <button type="button" class="add-result" data-result="${i}">
                  ${cover}
                  <span class="r-meta"
                    ><span class="r-title">${i % 2 === 0 ? TITLE : `Otro título increíblemente largo para la fila número ${i + 1} de los resultados`}</span
                    ><span class="r-sub">2023 · ${PLATFORMS.join(', ')}</span></span
                  >
                </button>
              </li>`
              ).join('')}
            </ul>
          </div>
          <div class="add-feedback" data-add-feedback></div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;

const previewHtml = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body>
  <div class="add-layer">
    <div class="add-backdrop" data-sheet-backdrop></div>
    <section class="add-sheet" role="dialog" aria-modal="true">
      <header class="add-head"><h2>Añadir juego</h2><button type="button" class="chip" data-sheet-close>✕</button></header>
      <div class="sheet-body" data-sheet-body>
        <div class="add-paths">
          <button type="button" class="add-tab on" data-online-tab>Buscar online</button>
          <button type="button" class="add-tab" data-manual-tab>Crear manualmente</button>
        </div>
        <div class="add-online" data-online-pane>
          <input type="text" name="online-query" placeholder="Busca juegos por título…" autocomplete="off" />
          <div class="add-online-results" data-online-results>
            <div class="add-preview">
              ${cover}
              <div class="add-preview-info">
                <h3 class="add-preview-title">${TITLE}</h3>
                <p class="r-sub">2023 · ${PLATFORMS.join(', ')}</p>
                <div class="add-preview-genres">${GENRES.map((g) => `<span class="chip static">${g}</span>`).join('')}</div>
                <p class="add-preview-desc">${DESCRIPTION}</p>
              </div>
              <section class="d-sec" data-sec="gallery">
                <h3>Galería</h3>
                <div class="d-gallery">
                  ${SCREENSHOTS.map(
                    (u) =>
                      `<button type="button" class="d-shot" data-shot="${u}" aria-label="Ampliar captura"><img loading="lazy" src="${u}" alt="" /></button>`
                  ).join('')}
                </div>
              </section>
              <div class="add-preview-actions">
                <button type="button" class="chip" data-preview-back>← Volver a resultados</button>
                <button type="button" class="btn-primary" data-preview-add>Añadir a la biblioteca</button>
              </div>
            </div>
          </div>
          <div class="add-feedback" data-add-feedback></div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;

/** Cuerpo de medición, ejecutado DENTRO de la página. Detecta desborde
 * horizontal interno (scrollWidth > clientWidth) en tarjetas/contenedores y
 * elementos que escapan del viewport fuera de contenedores con scroll legítimo
 * (.d-gallery). */
function scanBody(expectedVw) {
  const vw = expectedVw;
  const overflows = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    return {
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      over: el.scrollWidth > el.clientWidth + 1,
      overflowX: cs.overflowX,
      rectRight: Math.round(el.getBoundingClientRect().right),
    };
  };
  const scrollAncestors = new Set();
  document.querySelectorAll('.d-gallery').forEach((el) => {
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
      overflowers.push(
        `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || ''} left=${Math.round(r.left)} right=${Math.round(r.right)}`
      );
    }
  });
  return {
    vw,
    docW: document.documentElement.scrollWidth,
    pageWidens: document.documentElement.scrollWidth > vw + 1,
    sheet: overflows('.add-sheet'),
    list: overflows('.add-results-list'),
    result: overflows('.add-result'),
    rMeta: overflows('.r-meta'),
    preview: overflows('.add-preview'),
    previewInfo: overflows('.add-preview-info'),
    gallery: overflows('.d-gallery'),
    overflowers: overflowers.slice(0, 20),
  };
}

const VIEWPORTS = [
  { width: 1280, height: 800, label: '1280×800 (escritorio)' },
  { width: 360, height: 740, label: '360×740 (móvil)' },
];

const SCENARIOS = [
  { key: 'result', label: 'resultados', html: resultsHtml, checks: ['list', 'result', 'rMeta'] },
  { key: 'preview', label: 'previsualización', html: previewHtml, checks: ['preview', 'previewInfo'] },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'shell',
  args: ['--no-first-run', '--disable-extensions', '--disable-gpu'],
});

let failures = 0;
try {
  for (const vp of VIEWPORTS) {
    for (const scenario of SCENARIOS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.setContent(scenario.html, { waitUntil: 'load' });
      const report = await page.evaluate(scanBody, vp.width);
      console.log(`\n=== ${vp.label} · ${scenario.label} ===`);
      console.log(JSON.stringify(report, null, 2));
      let scenarioFails = 0;
      if (report.pageWidens) {
        scenarioFails++;
        console.log(`RED: la página se ensancha (docW ${report.docW} > vw ${report.vw})`);
      }
      for (const key of scenario.checks) {
        const box = report[key];
        if (box && box.over) {
          scenarioFails++;
          console.log(
            `RED: .${key} desborda su contenedor (scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}, overflowX=${box.overflowX})`
          );
        }
      }
      if (report.overflowers.length > 0) {
        scenarioFails++;
        console.log(`RED: ${report.overflowers.length} elemento(s) desbordan el viewport`);
      }
      const galleryOver = report.gallery && report.gallery.over;
      if (scenarioFails === 0) {
        console.log(
          `GREEN: sin desbordes${galleryOver ? ` (galería ${report.gallery.scrollWidth}/${report.gallery.clientWidth}px scrollea, legítimo)` : ''}`
        );
      }
      failures += scenarioFails;
      await page.close();
    }
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\nRED: ${failures} caso(s) con overflow en la búsqueda online`);
  process.exit(1);
}
console.log('\nGREEN: la búsqueda online no desborda (resultados y previsualización)');
