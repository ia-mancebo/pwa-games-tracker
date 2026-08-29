# 04: Composition root â€” el arranque deja de ser un efecto de import

**Spec:** la de este esfuerzo (architecture-deepening-2). Tanda 4 y Ãºltima: va al final para tragarse el cableado en su forma definitiva (tras encoger la interface del enlace en la tanda 3) y no tocar el arranque dos veces.

**What to build:** `src/boot.js` exporta `start(root)` â€” los diez pasos de hoy en `main.js`: `initLibrary` â†’ `createApp` â†’ registro del conflicto â†’ `initCoverSeeding` â†’ `acquireTabLock`/`onLockReleased` â†’ `initNovedadesRetry` â†’ `restoreSavedLink` + `openReconnectModal` condicional â†’ `startAutosave` â†’ `requestPersistOnce` â†’ `registerSW` â€” y `resetBoot()` (teardown Ãºnico para tests, compone los resets de los mÃ³dulos con estado). `sheet.js` pierde su `registerSheetCloser` al importarse y gana un init explÃ­cito; `conflictDialog.js` pierde su `store.subscribe` al importarse y gana `initConflictDialog()`; el boot los llama en el orden correcto (closer antes de que exista historial que consumirlo; handler de conflicto antes de cualquier restore que pueda elevarlo). `main.js` queda en la llamada a `start`. Mueren los `reset*` que solo existÃ­an para el cableado de test; siguen como seams reales los que suites de mÃ³dulo aisladas necesitan (`resetFilelink`, `resetBackNav`, `resetSheet`, `setHandleStore`). Sin `stop()` ni arranques repetidos. â†’ **ADR-0010**.

**Blocked by:** 01 â€” Novedades como slice + intents, 02 â€” La interface del motor devuelve resultados, 03 â€” Uniones por operaciÃ³n en la interface del Enlace.

**Status:** resolved

- [x] Importar cualquier mÃ³dulo de src no registra nada: los dos efectos de import actuales (`sheet.js:210`, `conflictDialog.js:144`) pasan a inits explÃ­citos llamados por el boot.
- [x] `start(root)` posee los diez pasos con sus try/catch y comentarios; `main.js` queda en la llamada (con los imports de CSS y `registerSW` fuera del `if (root)` como hoy).
- [x] `resetBoot()` desmonta el arranque en un solo seam; las suites dejan de componer resets a mano salvo las de mÃ³dulo aislado.
- [x] Suite de humo pequeÃ±a (5â€“8 asertos de orden con espias y los fakes existentes): conflicto antes de restore, sheet closer antes de `createApp`, `startAutosave` al final.
- [x] Las suites de backnav/navigation no cambian de patrÃ³n; los `reset*` que sobreviven siguen siendo seams de test reales, no cableado.
- [x] El comportamiento visible no cambia (arranque, bienvenida, segunda pestaÃ±a en solo lectura, reconexiÃ³n, autoguardado, SW).
- [x] ADR-0010 publicada: composition root vs mantener main.js tribal vs ciclo de vida completo con `stop()`.

## Comments

Tanda 4 aterrizada en e3cde6e/f0621e0 (+ teardown de conflictDialog en 38645bf). ADR-0010 publicada. Ningún reset* murió en esta tanda: los 9 supervivientes son seams reales usados por suites de módulo aisladas (verificado con grep).

