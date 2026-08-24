# 16 · Alta manual

**Status:** ready-for-agent
**Blocked by:** 14 · Estantería + Panel completos

## What to build

Botón fijo **«➕ Añadir juego»** en la barra de Biblioteca → hoja con dos caminos:

- **Buscar online** (por defecto): visible pero deshabilitado con motivo hasta que exista proxy configurado (ticket 21).
- **Crear manualmente**: solo título obligatorio; estado por defecto de la primera jugada Quiero jugar, editable en el formulario.

El aviso de duplicados aplica también aquí: si ya existe un juego equivalente, ofrecer abrir su Ficha o crear otro igual. Al guardar, el juego aparece al instante en Biblioteca bajo su Estado del juego.

## Acceptance criteria

- [ ] Alta con solo título crea Juego + primera Jugada y aparece en Quiero jugar (o el estado elegido).
- [ ] El estado inicial es editable antes de guardar.
- [ ] Camino online deshabilitado con motivo explicativo (sin conexión / sin servicio configurado).
- [ ] Duplicados: aviso con opción de abrir la ficha existente o crear otro igual.
