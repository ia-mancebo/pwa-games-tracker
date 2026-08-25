import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Opciones PWA (ticket 25, spec §10–11). Exportadas para poder verificarlas
 * desde los tests sin inspeccionar la instancia interna del plugin.
 * @type {Partial<import('vite-plugin-pwa').VitePWAOptions>}
 */
export const pwaOptions = {
  registerType: 'prompt',
  injectRegister: null,
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
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [VitePWA(pwaOptions)],
});
