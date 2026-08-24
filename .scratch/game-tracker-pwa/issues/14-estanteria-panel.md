# 14 · Estantería + Panel completos

**Status:** ready-for-agent
**Blocked by:** 13 · Bienvenida: Importar / Empezar biblioteca nueva

## What to build

La Biblioteca navegable de verdad:

- **Estantería**: una balda por Estado del juego (un juego aparece donde dicte su jugada más reciente); cada balda con placa-etiqueta (nombre, conteo, media ★) y máximo 6 portadas + tarjeta «+N más». Pulsar la placa o «+N más» abre el Panel; «← Estantería» vuelve.
- **Panel**: lista densa del estado abierto — portada mini, título, etiquetas propias, plataformas, valoración, píldora de estado — paginada en bloques de 100 con «Cargar más».
- Orden por defecto en ambas vistas: recencia descendente (`addedAt` de la jugada más reciente), desempate alfabético.

## Acceptance criteria

- [ ] Un juego con jugadas en varios estados aparece solo en la balda de su jugada más reciente.
- [ ] Máximo 6 portadas por balda + «+N más» con conteo correcto.
- [ ] El panel lista todos los juegos del estado, cargando en bloques de 100.
- [ ] Mismo orden recencia + desempate alfabético en estantería y panel.
