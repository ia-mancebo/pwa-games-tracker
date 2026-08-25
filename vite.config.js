import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Debe coincidir con el nombre del repositorio de GitHub: Pages sirve la app
// en https://<user>.github.io/game-tracker/ y de aquí derivan los assets,
// el scope y el start_url del manifest.
const BASE = '/game-tracker/';

/**
 * El manifest se emite con los src absolutos de los iconos ('/icons/…') tal
 * cual: el plugin PWA no los reescribe con `base`, así que servidos bajo un
 * subpath apuntarían a la raíz del dominio y darían 404 (instalabilidad rota,
 * spec §10). Reescribe el fichero ya escrito en disco; generateSW corre más
 * tarde (closeBundle), por lo que el precache y sus revisiones MD5 quedan
 * calculados sobre el contenido ya corregido.
 * @returns {import('vite').Plugin}
 */
function manifestIconsUnderBase() {
  /** @type {string} */
  let outDir = 'dist';
  return {
    name: 'manifest-icons-under-base',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async writeBundle() {
      const file = resolve(outDir, 'manifest.webmanifest');
      const source = await readFile(file, 'utf8');
      if (!source.includes('"/icons/')) return;
      await writeFile(file, source.replaceAll('"/icons/', `"${BASE}icons/`));
    },
  };
}

/**
 * Opciones PWA (ticket 25, spec §10–11). Exportadas para poder verificarlas
 * desde los tests sin inspeccionar la instancia interna del plugin.
 * @type {Partial<import('vite-plugin-pwa').VitePWAOptions>}
 */
export const pwaOptions = {
  registerType: 'prompt',
  injectRegister: null,
  // Si Pages sirviera manifest.webmanifest con un MIME incorrecto, la solución
  // es añadir aquí `manifestFilename: 'manifest.json'` (spec §10).
  includeAssets: ['favicon-64.png', 'robots.txt'],
  manifest: {
    name: 'Game Tracker',
    short_name: 'GameTracker',
    description:
      'PWA 100% estática para gestionar tu biblioteca personal de videojuegos. Offline-first, un solo archivo .json como fuente de verdad.',
    lang: 'es',
    display: 'standalone',
    theme_color: '#151210',
    background_color: '#151210',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
    maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // Limitado al CDN de imágenes de IGDB; Workbox lee Y escribe la misma
        // caché `covers-v1` que siembra la app (spec §11), por eso NO es una
        // caché nueva y cleanupOutdatedCaches no la borra entre builds.
        urlPattern: new RegExp('^https://images\\.igdb\\.com/.*'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'covers-v1',
          expiration: { maxEntries: 500, maxAgeSeconds: 365 * 24 * 3600 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
  // Solo para depurar el ciclo PWA: interfiere con HMR (spec §11).
  devOptions: { enabled: false },
};

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [[...VitePWA(pwaOptions), manifestIconsUnderBase()]],
});
