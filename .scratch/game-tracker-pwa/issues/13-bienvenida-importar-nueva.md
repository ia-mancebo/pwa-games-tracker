# 13 · Bienvenida: Importar / Empezar biblioteca nueva

**Status:** ready-for-agent
**Blocked by:** 12 · Núcleo de datos: esquema v1 + espejo IndexedDB

## What to build

Primer arranque con dos caminos:

1. **Importar mi game-tracker.json**: valida → sustituye el espejo en transacción única `strict` → fija hash base.
2. **Empezar biblioteca nueva**: nace `dirty`; el primer vuelco/export creará el archivo más adelante.

Para que el slice sea demoable, la vista Biblioteca muestra ya las **baldas por Estado del juego** en solo lectura: placa-etiqueta con nombre, conteo y media ★, calculadas según el Estado del juego (jugada más reciente por `addedAt`). Sin portadas ni panel aún.

Feature detection de File System Access (`'showOpenFilePicker' in self`) y manejo de `AbortError` al cancelar pickers.

## Acceptance criteria

- [ ] Importar un `.json` válido puebla la biblioteca visible con conteos y medias reales por balda.
- [ ] Un archivo inválido o de versión futura muestra error claro y no toca el estado actual.
- [ ] «Empezar biblioteca nueva» deja la app operativa con `dirty` activo.
- [ ] Cancelar el picker no produce errores ni cambios.
