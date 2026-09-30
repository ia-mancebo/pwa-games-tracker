# 02: Comando setPlayTime con auto-pausa

**What to build:** el motor de la Ficha gana el comando **`setPlayTime(gameId, playId, seconds)`** (familia `setPlay*`), que establece el Tiempo jugado de una Jugada al valor dado: un set absoluto, no una resta (vale alza, baja y cero). Recibe `now` por parámetro, como el resto de comandos con tiempo. Reglas: `seconds` debe ser entero ≥ 0 (si no, `Result` de error sin mutar); si el Contador está anclado a ESA Jugada lo auto-pausa primero —Tramo pendiente con lo contado + ancla limpia— igual que las demás auto-pausas (añadir Jugada, Terminar/Abandonar); si el ancla es de otra Jugada o no hay, no lo toca. Los Tramos pendientes de la Jugada quedan intactos y la consolidación posterior suma sobre la base corregida (el comando de confirmar Tramo no cambia). Muta por el cauce usual del repositorio: revalidación del doc, espejo, dirty y autoguardado del Enlace de archivo. Lee primero la spec: `.scratch/correccion-tiempo-jugado/spec.md`.

**Blocked by:** None (can start immediately, en paralelo con 01).

**Status:** resolved

- [x] Tests del motor: set al alza y a la baja; set a 0; set sobre una Jugada sin Tiempo jugado (campo ausente, base 0).
- [x] Tests: segundos inválidos (negativos, no enteros) → `Result` de error y doc sin mutar.
- [x] Tests: corregir la Jugada anclada auto-pausa (Tramo pendiente con lo contado, ancla limpia, set aplicado); corregir otra Jugada no toca el Contador.
- [x] Tests: Tramos pendientes intactos tras corregir; confirmar un Tramo después suma sobre la base corregida.
- [x] El comando nunca lanza: devuelve `Promise<Result>` como el resto del motor, y el doc resultante pasa la validación completa.
- [x] `npm run typecheck`, `npm run lint` y `npm test` en verde.

## Comentarios

- 2026-10-01: Implementado con TDD (10 tests nuevos en `src/data/ficha.test.js`). Repositorio (`src/data/library.js::setPlayTime`) revalida forma dentro de `mutate`, auto-pausa vía `pauseAnchor` solo cuando el ancla coincide con gameId+playId, set absoluto (`> 0` asigna, `0` borra el campo — convención «ausente = desconocido», igual que `confirmSegment` con duración 0). Motor (`src/data/ficha.js::setPlayTime`) valida temprano y devuelve `Promise<Result>`. `NaN` → BAD_SHAPE (no es entero). NOT_FOUND no toca el Contador.
