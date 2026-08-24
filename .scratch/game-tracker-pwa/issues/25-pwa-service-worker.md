# 25 · PWA: manifest + service worker + actualizaciones

**Status:** ready-for-agent
**Blocked by:** 22 · Carátulas offline (`covers-v1`)

## What to build

La app instalable y 100 % offline:

- **Manifest** generado por el plugin: `name: 'Game Tracker'`, `short_name: 'GameTracker'`, `lang: 'es'`, `display: 'standalone'`, `theme_color`/`background_color` = `#151210` coincidiendo con `<meta name="theme-color">`. Iconos 192/512 px + variantes **maskable** como entradas `purpose: 'maskable'` independientes.
- Checklist del `<head>`: viewport móvil, título, descripción, favicon, apple-touch-icon; robots.txt en público.
- **Service worker `generateSW`**: `registerType: 'prompt'` explícito; precache del manifest de build con `globPatterns` ampliado (js, css, html, svg, png, ico, webmanifest), límite 2 MiB por fichero; `navigateFallback: 'index.html'`; `cleanupOutdatedCaches` sin tocar `covers-v1` ni el store de instantáneas.
- **Ruta runtime de carátulas**: patrón limitado al host del CDN de imágenes con destino `image`, misma caché `covers-v1`, handler StaleWhileRevalidate, `cacheableResponse: {statuses:[0,200]}` — Workbox lee y escribe la caché que siembra la app.
- **Flujo de updates**: aviso persistente «Nueva versión disponible» con Recargar (`updateSW()`); `onOfflineReady` → aviso discreto «La app ya funciona sin conexión»; `onRegisterError` silencioso. Registro con `virtual:pwa-register` en el punto de entrada; `devOptions.enabled` solo para depurar.

## Acceptance criteria

- [ ] Tras la primera visita, la app carga y navega sin conexión (precache completo).
- [ ] Las carátulas sembradas se sirven offline vía la ruta runtime desde `covers-v1`.
- [ ] Publicar un build nuevo muestra el aviso persistente; Recargar sirve la versión nueva sin perder texto en edición (prompt, no autoUpdate).
- [ ] La limpieza de cachés antiguas conserva `covers-v1` y la instantánea de Novedades.
- [ ] Manifest servido con MIME correcto e iconos maskable presentes (criterios de instalabilidad).
