# 02 · Research: persistencia y offline en Android 11 + escritorio

Type: research
Status: resolved
Blocked by:

## Question

¿Qué capacidades reales tiene el entorno objetivo (Android 11 con Chrome recién actualizado, más Chrome de escritorio) para persistencia y uso sin conexión? Verificar con fuentes primarias y estado actual (2026):

1. **File System Access API** (`showOpenFilePicker`, `showSaveFilePicker`): ¿disponible hoy en Chrome para Android? ¿en escritorio? Permisos y reconexión entre sesiones.
2. Alternativa si no hay FSA en Android: patrones fiables de export/import del `.json` en móvil.
3. **Service Worker + Cache Storage**: cachear carátulas de terceros (respuestas opacas/cross-origin), cuotas de almacenamiento en Android, política de eviction, `navigator.storage.persist()`.
4. **IndexedDB** como espejo offline del `.json`: mantener el archivo como fuente de verdad sincronizada manualmente sin corromper datos.

## Answer

**Resumen ejecutivo** (informe completo: `.scratch/game-tracker-pwa/research/persistencia-y-offline.md`, consultado 2026-08-23):

- **FSA sí existe en Android hoy**: los tres pickers (`showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker`) están en Chrome Android desde la 132 (ene 2025); escritorio desde la 86. Con asperezas conocidas al lanzarse (filtros MIME ignorados, extensión por defecto no añadida, bugs de directorios); verificar open/save de fichero único en dispositivo físico.
- **Permisos**: por defecto el permiso muere al cerrar todas las pestañas. Desde Chrome 122 hay opt-in "Allow on every visit" (guardando el handle en IDB + `requestPermission()`), y una PWA instalada auto-persiste permisos. Diseñar asumiendo reconexión manual del archivo en cada sesión.
- **Export/import fiable en móvil sin FSA**: descarga (`<a download>` con Blob) + import (`<input type="file" accept=".json">`) son universales; extras opcionales: `navigator.share({files})` (Android) y Web Share Target (solo PWA instalada, post-MVP).
- **Carátulas offline**: las cross-origin llegan opacas (`status 0`); `cache.add/addAll` las rechazan pero `fetch` + `cache.put()` funciona; coste de cuota ~7 MB/opaca en Chrome (usar CORS/`crossorigin` si el CDN lo permite; limitar entradas). Cuota origen ~60 % del disco; eviction LRU solo best-effort ⇒ llamar a `navigator.storage.persist()` tras guardar datos críticos.
- **Patrón de verdad**: el `.json` es la ÚNICA fuente de verdad; IndexedDB es espejo de trabajo (documento entero en un store, transacción atómica `strict` para import/migración, hash SHA-256 del último volcado en meta, flag `dirty`, y UI de conflicto explícita si el archivo cambió fuera habiendo cambios locales). Nunca sobrescribir en silencio.
