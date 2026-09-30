# 01: Parser de reloj compartido (prefactor)

**What to build:** la app entiende duraciones escritas por el usuario con una única función compartida en el módulo de formato: texto → segundos o nulo. Formas aceptadas: `H:MM:SS`, `H:MM` (dos componentes = horas:minutos, no minutos:segundos — decisión anotada en la spec), dígitos sin relleno obligatorio (`1:2:3` = 1 h 2 min 3 s), un número suelto = segundos, espacios recortados; rechaza vacío, negativos, decimales y todo lo no numérico. El prompt del Tramo («guardarlo con otra duración») deja su parseo a mano y pasa a usar la función: todo lo que hoy es válido sigue siéndolo (número entero ≥ 0 = segundos) y además acepta formas de reloj. Lee primero la spec: `.scratch/correccion-tiempo-jugado/spec.md`.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] La función pura acepta/rechaza la tabla de la spec, con tests en la costura de formato: acepta `12:34:00`, `0:05:30`, `1:30` (→ 1 h 30 min), `1:2:3`, `90` (→ 90 s) y con espacios; rechaza vacío, `abc`, `-5`, `1.5:00`, `12:34:56:78`.
- [x] El prompt del Tramo usa la función compartida: guardar tal cual (campo vacío) y un entero ≥ 0 se comportan exactamente igual que antes.
- [x] El prompt del Tramo acepta además formas de reloj y su aviso inline describe las formas aceptadas; casos antes inválidos siguen inválidos (sin mutar).
- [x] `npm run typecheck`, `npm run lint` y `npm test` en verde.

## Comentarios

- 2026-10-01: Implementado con TDD en dos ciclos (parser puro → prompt del Tramo). `parseClock(text) → number|null` en `src/lib/format.js`. Decisiones: sin tope de MM/SS (`0:90` = 5400 s, aritmética posicional H*3600+M*60+S); desbordes fuera de entero seguro → null; `:30`/`12:` rechazados (componente vacío). El input del consejo del Tramo pasa a `type="text"` + `inputmode="numeric"` para aceptar formas de reloj; el aviso conserva el substring «entero de segundos» que congelan los tests previos. Suite completa: 694/694.
