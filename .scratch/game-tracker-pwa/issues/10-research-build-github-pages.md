# 10 · Research: build y service worker para GitHub Pages

Type: research
Status: resolved

## Question

Con el stack cerrado en el ticket 03 (Vanilla JS + Vite + vite-plugin-pwa), ¿cómo se configura el build de producción para GitHub Pages?

- Base path (subpath del repositorio) y rutas relativas.
- vite-plugin-pwa: estrategia del service worker (precache del manifest de build, `registerType`, actualizaciones y recarga), integración con la caché de carátulas `covers-v1` decidida en el research 02.
- Manifest e instalabilidad en Android 11 con Chrome actualizado (criterios de instalabilidad, iconos, `display`).
- Límites o cambios de GitHub Pages relevantes en 2026 (tamaños, bandwidth, SPA fallback).

Skills: `research`.

## Answer

**Cerrado el 23-08-2026.** Configuración: `base: '/<repo>/'` en Vite (reescribe todas las URLs de assets; vite-plugin-pwa v1.2.0 deriva `scope` y `start_url` de esa base) y deploy con el workflow de GitHub Actions de la guía oficial de Vite (Settings → Pages → Source: GitHub Actions; Jekyll no interviene, `.nojekyll` solo si se publicara desde rama). Service worker con la estrategia por defecto `generateSW` — precachea el manifest del build (`globPatterns` ampliado a png/svg/ico/webmanifest), activa por defecto `navigateFallback: 'index.html'` y `cleanupOutdatedCaches` — con **`registerType: 'prompt'`** (el default del plugin): aviso «nueva versión» vía `virtual:pwa-register` (`onNeedRefresh` → `updateSW()` recarga; `onOfflineReady`) para evitar recargas automáticas que perderían texto en edición. Las carátulas se sirven offline añadiendo una ruta `runtimeCaching` con `cacheName: 'covers-v1'`: Workbox usa ese nombre tanto para leer como para escribir, así que sirve exactamente lo que la app sembró con `fetch()`+`cache.put()` (aceptando opacas con `statuses:[0,200]`), y la limpieza de precache no toca esa caché. Manifest instalable en Android 11 Chrome 2026 con name/short_name, iconos 192+512 px (+ variantes `maskable`), `start_url`, `display: 'standalone'`, HTTPS y heurísticas de engagement — sin novedades que rompan los criterios. Límites Pages confirmados: sitio ≤ 1 GB, banda *soft* 100 GB/mes, builds *soft* 10/hora (no aplica con workflow propio de Actions), timeout 10 min; holgados para esta app.

Detalle completo (config ilustrativa, flujo de updates, checklist de instalación y fuentes): `research/build-github-pages.md`.
