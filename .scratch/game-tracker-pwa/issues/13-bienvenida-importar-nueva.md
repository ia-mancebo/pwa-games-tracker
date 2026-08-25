# 13 Â· Bienvenida: Importar / Empezar biblioteca nueva

**Status:** resolved
**Blocked by:** 12 Â· NÃºcleo de datos: esquema v1 + espejo IndexedDB

## What to build

Primer arranque con dos caminos:

1. **Importar mi game-tracker.json**: valida â†’ sustituye el espejo en transacciÃ³n Ãºnica `strict` â†’ fija hash base.
2. **Empezar biblioteca nueva**: nace `dirty`; el primer vuelco/export crearÃ¡ el archivo mÃ¡s adelante.

Para que el slice sea demoable, la vista Biblioteca muestra ya las **baldas por Estado del juego** en solo lectura: placa-etiqueta con nombre, conteo y media â˜…, calculadas segÃºn el Estado del juego (jugada mÃ¡s reciente por `addedAt`). Sin portadas ni panel aÃºn.

Feature detection de File System Access (`'showOpenFilePicker' in self`) y manejo de `AbortError` al cancelar pickers.

## Acceptance criteria

- [ ] Importar un `.json` vÃ¡lido puebla la biblioteca visible con conteos y medias reales por balda.
- [ ] Un archivo invÃ¡lido o de versiÃ³n futura muestra error claro y no toca el estado actual.
- [ ] Â«Empezar biblioteca nuevaÂ» deja la app operativa con `dirty` activo.
- [ ] Cancelar el picker no produce errores ni cambios.
