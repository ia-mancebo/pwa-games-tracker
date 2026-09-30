# 03: Lápiz y campo inline en la Ficha (vertical completo)

**What to build:** el feature de punta a punta de cara al usuario. Cada Jugada en la Ficha (héroe y tarjetas) muestra junto a su Tiempo jugado un lápiz **siempre visible** (affordance explícita: nada que solo se descubra por hover). Al pulsarlo, el valor pasa a campo de texto en línea, prefilled con el valor exacto en `H:MM:SS`. ✓/Enter aplica: parsea con el parser compartido y llama al comando de corrección; al aplicar, la Ficha muestra el valor corregido al instante (histórico redondo) y el Dashboard de estadísticas lo refleja. ✕/Esc cancela sin cambiar nada. Parseo inválido o `Result` de error → aviso inline sin cerrar el campo ni perder lo tecleado. Con el Contador corriendo sobre esa Jugada, aplicar la corrección lo auto-pausa y el Aviso de contador señala el Tramo pendiente, como siempre. Todo por el cauce del repositorio (nada escribe el doc fuera del comando), con autoguardado; funciona offline. Lee primero la spec: `.scratch/correccion-tiempo-jugado/spec.md`.

**Blocked by:** 01 (Parser de reloj compartido) y 02 (Comando setPlayTime con auto-pausa).

**Status:** resolved

- [x] El lápiz es visible siempre (sin hover) en el héroe y en cada tarjeta de Jugada, con texto accesible tipo «Corregir tiempo jugado».
- [x] Pulsar el lápiz abre el campo prefilled con el valor exacto en `H:MM:SS` (campo ausente → `0:00:00`).
- [x] ✓/Enter con forma válida aplica la corrección vía el comando y cierra el campo; la Ficha refleja el valor corregido al instante y el Dashboard lo suma.
- [x] ✕/Esc cancela sin cambiar nada.
- [x] Entrada inválida (parseo o `Result` de error) muestra aviso inline con las formas aceptadas, sin cerrar el campo ni perder lo tecleado.
- [x] Con el Contador corriendo sobre esa Jugada, aplicar la corrección lo auto-pausa y el Aviso señala el Tramo pendiente.
- [x] Ningún write fuera del cauce del repositorio; la corrección sobrevive al autoguardado del Enlace de archivo.
- [x] `npm run typecheck`, `npm run lint` y `npm test` en verde.

## Comentarios

- 2026-10-01: Implementado (9 tests nuevos en `tests/game.test.js`). Décision principal: como el héroe repite la Jugada más reciente, el editor es ÚNICO y vive en la fila ORIGEN del lápiz pulsado (`ficha.editTime` + `editTimeRow: 'hero'|'card'`); el otro lápiz de la misma Jugada enfoca el editor abierto sin pisar lo tecleado. Lo tecleado vive en el DOM (sin re-render por tecla); `editTimeDraft` repinta solo al abrir y en la restauración tras error. El Dashboard refleja la corrección por derivar del doc (sin código nuevo), coherente con la decisión de la spec de no testear render. Suite completa: 694/694.
