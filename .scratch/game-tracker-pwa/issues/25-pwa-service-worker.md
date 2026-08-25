# 25 Â· PWA: manifest + service worker + actualizaciones

**Status:** resolved
**Blocked by:** 22 Â· CarÃ¡tulas offline (`covers-v1`)

## What to build

La app instalable y 100 % offline:

- **Manifest** generado por el plugin: `name: 'Game Tracker'`, `short_name: 'GameTracker'`, `lang: 'es'`, `display: 'standalone'`, `theme_color`/`background_color` = `#151210` coincidiendo con `<meta name="theme-color">`. Iconos 192/512 px + variantes **maskable** como entradas `purpose: 'maskable'` independientes.
- Checklist del `<head>`: viewport mÃ³vil, tÃ­tulo, descripciÃ³n, favicon, apple-touch-icon; robots.txt en pÃºblico.
- **Service worker `generateSW`**: `registerType: 'prompt'` explÃ­cito; precache del manifest de build con `globPatterns` ampliado (js, css, html, svg, png, ico, webmanifest), lÃ­mite 2 MiB por fichero; `navigateFallback: 'index.html'`; `cleanupOutdatedCaches` sin tocar `covers-v1` ni el store de instantÃ¡neas.
- **Ruta runtime de carÃ¡tulas**: patrÃ³n limitado al host del CDN de imÃ¡genes con destino `image`, misma cachÃ© `covers-v1`, handler StaleWhileRevalidate, `cacheableResponse: {statuses:[0,200]}` â€” Workbox lee y escribe la cachÃ© que siembra la app.
- **Flujo de updates**: aviso persistente Â«Nueva versiÃ³n disponibleÂ» con Recargar (`updateSW()`); `onOfflineReady` â†’ aviso discreto Â«La app ya funciona sin conexiÃ³nÂ»; `onRegisterError` silencioso. Registro con `virtual:pwa-register` en el punto de entrada; `devOptions.enabled` solo para depurar.

## Acceptance criteria

- [ ] Tras la primera visita, la app carga y navega sin conexiÃ³n (precache completo).
- [ ] Las carÃ¡tulas sembradas se sirven offline vÃ­a la ruta runtime desde `covers-v1`.
- [ ] Publicar un build nuevo muestra el aviso persistente; Recargar sirve la versiÃ³n nueva sin perder texto en ediciÃ³n (prompt, no autoUpdate).
- [ ] La limpieza de cachÃ©s antiguas conserva `covers-v1` y la instantÃ¡nea de Novedades.
- [ ] Manifest servido con MIME correcto e iconos maskable presentes (criterios de instalabilidad).
