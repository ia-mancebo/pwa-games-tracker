/**
 * Regression test (layout móvil): el header superior (raíl colapsado) no debe
 * ensanchar la página. Replica el DOM real de app.js (shell > rail > logo + nav
 * con 3 botones) y los 3 CSS reales, mide con Edge headless a viewports móviles
 * reales (360×740 y 390×844) y falla (exit 1) si el documento se ensancha, si
 * algún elemento desborda el viewport, si el scroll horizontal de los botones
 * no queda confinado dentro de .nav, o si el sticky móvil está en el elemento
 * equivocado: debe ser .rail (barra superior colapsada) y .view-head debe
 * quedar static.
 *
 * Uso: npm run test:layout:mobile  (o node scripts/check-layout-mobile.mjs)
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

const TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'novedades', label: 'Novedades' },
  { id: 'estadisticas', label: 'Estadísticas' },
];

const rail = `
  <aside class="rail">
    <div class="logo" aria-hidden="true">GT</div>
    <nav class="nav" aria-label="Secciones">
      ${TABS.map(
        (t, i) =>
          `<button type="button" data-tab="${t.id}" aria-current="${i === 0 ? 'true' : 'false'}">${t.label}</button>`
      ).join('')}
    </nav>
    <div class="widgets">
      <div class="bw"><span>Jugando ahora</span><b>0</b></div>
      <div class="bw"><span>Terminados</span><b>0</b></div>
      <div class="bw"><span>Valoración media</span><b>—</b></div>
    </div>
    <button type="button" class="chip rail-datos" data-open-data>Datos</button>
    <span class="note">offline-first · datos locales</span>
  </aside>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body>
  <div class="shell">
    ${rail}
    <div class="content">
      <div class="filebar-slot">
        <div class="filebar">
          <span class="pill st-playing">Guardado automático en este navegador</span>
          <button type="button" class="chip chip-xs bar-datos" data-open-data>Datos</button>
        </div>
      </div>
      <main class="main">
        <header class="view-head"><h1>Biblioteca</h1></header>
      </main>
    </div>
  </div>
</body>
</html>`;

const VIEWPORTS = [
  { width: 360, height: 740, label: '360×740' },
  { width: 390, height: 844, label: '390×844' },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'shell',
  args: ['--no-first-run', '--disable-extensions'],
});

let failures = 0;

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.setContent(html, { waitUntil: 'load' });
    const report = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const vw = window.innerWidth;
      const nav = document.querySelector('.nav');
      const rail = document.querySelector('.rail');
      const viewHead = document.querySelector('.view-head');
      const railStyle = globalThis.getComputedStyle(rail);
      const headStyle = globalThis.getComputedStyle(viewHead);
      const overflowers = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName}.${String(el.className).split(' ')[0] ?? ''} right=${Math.round(rect.right)}`
          );
        }
      });
      return {
        docW,
        vw,
        navClientWidth: nav.clientWidth,
        navScrollWidth: nav.scrollWidth,
        overflowers,
        railPosition: railStyle.position,
        railTop: railStyle.top,
        viewHeadPosition: headStyle.position,
      };
    });
    console.log(`\n=== ${vp.label} ===`);
    console.log(JSON.stringify(report, null, 2));
    const pageOk = report.docW <= report.vw + 1;
    const noOverflowers = report.overflowers.length === 0;
    const navScrolls = report.navScrollWidth > report.navClientWidth;
    const navConfined = !navScrolls || pageOk;
    const railSticky = report.railPosition === 'sticky' && report.railTop === '0px';
    const headStatic = report.viewHeadPosition === 'static';
    if (!pageOk) {
      failures++;
      console.log(`RED: el documento se ensancha (scrollWidth ${report.docW} > viewport ${report.vw})`);
    }
    if (!noOverflowers) {
      failures++;
      console.log(`RED: ${report.overflowers.length} elemento(s) desbordan el viewport`);
    }
    if (!navConfined) {
      failures++;
      console.log('RED: el scroll de .nav no queda confinado dentro del header');
    }
    if (!railSticky) {
      failures++;
      console.log(
        `RED: .rail no es sticky en móvil (position ${report.railPosition}, top ${report.railTop}); debe ser sticky con top 0px`
      );
    }
    if (!headStatic) {
      failures++;
      console.log(
        `RED: .view-head es sticky en móvil (position ${report.viewHeadPosition}); debe ser static`
      );
    }
    if (pageOk && noOverflowers && navConfined && railSticky && headStatic) {
      console.log(
        `GREEN: página ${report.docW}px, sin desbordes, .nav ${navScrolls ? 'scrollea' : 'cabe'} (${report.navScrollWidth}/${report.navClientWidth}px), .rail sticky, .view-head static`
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} fallo(s) de layout móvil`);
  process.exit(1);
}