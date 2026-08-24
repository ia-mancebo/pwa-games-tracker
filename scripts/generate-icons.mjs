// Generates PWA icons from an inline SVG (no external assets needed).
// Regular icons: rounded-square carbon tile with four "shelf" bars in the
// status colors. Maskable variants: full-bleed background, artwork inside the
// 80% safe zone. Output goes to public/icons/.
import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('public/icons');
const BG = '#151210';
const COLORS = ['#5fc98f', '#e9b04d', '#9a90ec', '#cf6a52'];

/** Four shelf bars, centered box of `size` px inside a `canvas` viewport. */
function shelves(cx, cy, size) {
  const w = size;
  const h = size * 0.14;
  const gap = size * 0.19;
  const y0 = cy - (3 * gap) / 2 - h / 2;
  return COLORS.map(
    (c, i) =>
      `<rect x="${cx - w / 2}" y="${y0 + i * gap}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}"/>`
  ).join('');
}

function regularSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="96" fill="${BG}"/>
  <rect x="17" y="17" width="478" height="478" rx="95" fill="none" stroke="#37312a" stroke-width="2"/>
  ${shelves(256, 256, 232)}
</svg>`;
}

function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  ${shelves(256, 256, 176)}
</svg>`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="12" fill="${BG}"/>
  <rect x="3" y="3" width="58" height="58" rx="11" fill="none" stroke="#37312a"/>
  ${shelves(32, 32, 30)}
</svg>`;
}

await mkdir(OUT, { recursive: true });

const regular = Buffer.from(regularSvg());
const maskable = Buffer.from(maskableSvg());

await sharp(regular).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
await sharp(regular).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
await sharp(maskable).resize(192, 192).png().toFile(path.join(OUT, 'icon-maskable-192.png'));
await sharp(maskable).resize(512, 512).png().toFile(path.join(OUT, 'icon-maskable-512.png'));
await sharp(regular).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));

await sharp(Buffer.from(faviconSvg()))
  .resize(64, 64)
  .png()
  .toFile(path.resolve('public/favicon-64.png'));

console.log('Icons written to public/icons/ and public/favicon-64.png');
