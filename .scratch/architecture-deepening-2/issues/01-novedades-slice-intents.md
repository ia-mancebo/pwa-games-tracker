# 01: Novedades como slice + intents

**Spec:** la de este esfuerzo (architecture-deepening-2). Tanda 1. El estado de Novedades vive hoy en tres sitios (slice de navegaciÃ³n, 9 globals de mÃ³dulo, IDB); este ticket le da una casa observable y una interface de intents, continuando el patrÃ³n pilotado por el slice de la Ficha (ADR-0006).

**What to build:** slice nuevo `novedadesUi` (`{snapshot, loading, refreshing, degraded, adding}`, fuera del snapshot de historial; `novedades` de navegaciÃ³n intacto), intents de Novedades en `src/navigation.js` (`openNovedadesSection` push, `backToNovedadesBoard` back, `toggleNovedadesGenre` y `openNovedadesDetail`/`closeNovedadesDetail` sin historial), trigger del refresco automÃ¡tico dentro del intent `switchTab`, `ensureNovedadesContent` + refresco escribiendo el slice en `src/data/novedades.js`, y la vista pintando puramente del estado: `snapshotCache`, `snapshotLoaded`, `refreshing`, `lastStatus`, `hostEl`, `loadSeq` y la guardia de superficie de `repaint` se borran como clase; `sheet`/`paintedRef` quedan como internos de primitiva. La guarda `adding` pasa al slice; el Â«âž• Quiero jugarloÂ» sigue en la vista con la pasarela de Alta. SemÃ¡ntica de historial congelada al milÃ­metro (incluida la supervivencia de la Ficha externa entre pestaÃ±as). â†’ **ADR-0008**.

**Blocked by:** nada.

**Status:** resolved

- [x] Ninguna escritura de navegaciÃ³n de Novedades es un `store.set` crudo en la vista; pasa por los intents de `src/navigation.js`.
- [x] Abrir secciÃ³n empuja historial; volver lo consume; gÃ©nero y Ficha externa no crean entradas; la Ficha externa sigue abierta al cambiar de pestaÃ±a (comportamiento actual congelado).
- [x] Entrar en Novedades desde otra pestaÃ±a dispara el refresco automÃ¡tico silencioso desde el intent; app.js deja de saber de refrescos.
- [x] El tablÃ³n pinta del slice: sin `snapshotCache`/`snapshotLoaded`/`refreshing`/`lastStatus`/`hostEl`/`loadSeq` como globals; un refresco tardÃ­o no aplasta otra pestaÃ±a sin guardia manual.
- [x] El Modo degradado se renderiza desde `novedadesUi.degraded` (tÃ©rmino ya en `CONTEXT.md`).
- [x] NingÃºn push de historial incluye la InstantÃ¡nea (backnav intacto; snapshots solo `tab`/`library`/`novedades`).
- [x] `resetNovedadesView` desaparece; las suites DOM existentes ajustan su reset escribiendo los slices y quedan como guardas de comportamiento.
- [x] Suite nueva de intents (history fake) + suite del mÃ³dulo de datos (carga/refresco/degradado) sin DOM.
- [x] El comportamiento visible no cambia (tablÃ³n, drill-down, gÃ©nero, Ficha externa, modo degradado, alta local offline).
- [x] ADR-0008 publicada: slices + intents vs globals vs un solo slice extendido.

## Comments

Tanda 1 aterrizada en ce62c0e (+ fixes en 38645bf). ADR-0008 publicada. Nota semántica deliberada: el refresco automático en segundo plano ahora también escribe degraded (spec L50 lo pide literalmente); antes la banda de error del servicio solo aparecía tras refresco manual. El resto de comportamiento visible congelado.

