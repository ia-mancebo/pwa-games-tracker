# 16 Â· Alta manual

**Status:** resolved
**Blocked by:** 14 Â· EstanterÃ­a + Panel completos

## What to build

BotÃ³n fijo **Â«âž• AÃ±adir juegoÂ»** en la barra de Biblioteca â†’ hoja con dos caminos:

- **Buscar online** (por defecto): visible pero deshabilitado con motivo hasta que exista proxy configurado (ticket 21).
- **Crear manualmente**: solo tÃ­tulo obligatorio; estado por defecto de la primera jugada Quiero jugar, editable en el formulario.

El aviso de duplicados aplica tambiÃ©n aquÃ­: si ya existe un juego equivalente, ofrecer abrir su Ficha o crear otro igual. Al guardar, el juego aparece al instante en Biblioteca bajo su Estado del juego.

## Acceptance criteria

- [ ] Alta con solo tÃ­tulo crea Juego + primera Jugada y aparece en Quiero jugar (o el estado elegido).
- [ ] El estado inicial es editable antes de guardar.
- [ ] Camino online deshabilitado con motivo explicativo (sin conexiÃ³n / sin servicio configurado).
- [ ] Duplicados: aviso con opciÃ³n de abrir la ficha existente o crear otro igual.
