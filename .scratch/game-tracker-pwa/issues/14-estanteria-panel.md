# 14 Â· EstanterÃ­a + Panel completos

**Status:** resolved
**Blocked by:** 13 Â· Bienvenida: Importar / Empezar biblioteca nueva

## What to build

La Biblioteca navegable de verdad:

- **EstanterÃ­a**: una balda por Estado del juego (un juego aparece donde dicte su jugada mÃ¡s reciente); cada balda con placa-etiqueta (nombre, conteo, media â˜…) y mÃ¡ximo 6 portadas + tarjeta Â«+N mÃ¡sÂ». Pulsar la placa o Â«+N mÃ¡sÂ» abre el Panel; Â«â† EstanterÃ­aÂ» vuelve.
- **Panel**: lista densa del estado abierto â€” portada mini, tÃ­tulo, etiquetas propias, plataformas, valoraciÃ³n, pÃ­ldora de estado â€” paginada en bloques de 100 con Â«Cargar mÃ¡sÂ».
- Orden por defecto en ambas vistas: recencia descendente (`addedAt` de la jugada mÃ¡s reciente), desempate alfabÃ©tico.

## Acceptance criteria

- [ ] Un juego con jugadas en varios estados aparece solo en la balda de su jugada mÃ¡s reciente.
- [ ] MÃ¡ximo 6 portadas por balda + Â«+N mÃ¡sÂ» con conteo correcto.
- [ ] El panel lista todos los juegos del estado, cargando en bloques de 100.
- [ ] Mismo orden recencia + desempate alfabÃ©tico en estanterÃ­a y panel.
