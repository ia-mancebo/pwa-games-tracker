# 09 · Task: redactar spec.md

Type: task
Status: resolved
Blocked by: 03, 04, 05, 06, 07, 08, 10

## Question

Redactar `.scratch/game-tracker-pwa/spec.md`: consolidar todas las decisiones cerradas por los tickets anteriores en una spec completa, en español, lista para entregarse a una sesión de implementación.

Debe cubrir: modelo de dominio, esquema `.json` versionado, arquitectura y stack elegido, estrategia de datos externos, flujo de guardado/carga, offline y caché de carátulas, UX por pestaña (Biblioteca, Novedades, Estadísticas), dirección visual aprobada, PWA (manifest, instalación en Android 11) y requisitos de build para GitHub Pages.

Este ticket produce el destino del mapa: al resolverse, el mapa queda completo.

## Answer

Escrita `.scratch/game-tracker-pwa/spec.md` el 24-08-2026, en español, en 14 secciones: alcance y restricciones; modelo de dominio (Juego/Jugada/Estado del juego); stack (Vanilla JS + Vite + vite-plugin-pwa, página única sin rutas); esquema del `.json` v1 completo con política de versionado; persistencia (archivo como única verdad, espejo IDB atómico, autoguardado 15 s, reconexión por hash, conflicto a 3 opciones, segunda pestaña Web Locks, backups OPFS ×3, export/import); datos externos (proxy Cloudflare Worker + IGDB, secret en el Worker, RAWG plan B); offline (`covers-v1` sembrada por la app + `novedades-v1` instantánea 12/12/6/6 con sello y banner a 7 días); UX por pestaña (Estantería/Panel/Ficha/Alta, Novedades degradado único, dashboard solo lectura con filtros globales); dirección visual aprobada con tokens extraídos del prototipo variante B; PWA e instalabilidad Android 11; service worker `generateSW` + `registerType: 'prompt'` integrado con `covers-v1`; build para GitHub Pages (`base` subpath + Actions); fuera de alcance; referencias.

Con esto el mapa queda completo: no quedan tickets abiertos ni decisiones pendientes antes de implementar. La niebla «migraciones más allá de la v1» se resuelve como decisión de alcance: la política queda fijada en la spec §4.4 y las migraciones concretas futuras son trabajo de otro esfuerzo.
