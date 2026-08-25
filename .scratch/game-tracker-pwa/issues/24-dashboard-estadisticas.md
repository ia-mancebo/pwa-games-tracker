# 24 Â· Dashboard de estadÃ­sticas

**Status:** resolved
**Blocked by:** 17 Â· Ficha completa

## What to build

Vista **EstadÃ­sticas** solo lectura; todo recomputa con el filtro activo:

- **Filtros globales**: tres filas de chips (plataforma, gÃ©nero, etiqueta propia) en cabecera; selecciÃ³n Ãºnica por dimensiÃ³n con opciÃ³n Â«TodasÂ»; acumulables entre dimensiones.
- **KPIs**: conteo por cada uno de los 4 estados, total de juegos y media â˜… (un decimal, sobre jugadas valoradas).
- **Barras de distribuciÃ³n** (mismo componente para las tres): plataforma usa `platforms[]` del juego â€”catÃ¡logoâ€”, dejando fuera las propias (`id: null`); gÃ©nero y etiqueta cuentan un juego en cada una que tenga.
- **Terminados en el tiempo**: barras por mes de los Ãºltimos 12 (etiqueta corta tipo Â«ago 25Â»), contando jugadas terminadas con `finishedAt`.
- **Top 5 mejor valorados**: compacto (portada mini + tÃ­tulo + â˜…), Ãºnico elemento clicable â†’ abre la Ficha; media del juego = media de sus jugadas valoradas.
- Totales por estado y distribuciones cuentan **Juegos una vez cada uno**, segÃºn su Estado del juego.
- Estado vacÃ­o amable cuando no hay datos.

## Acceptance criteria

- [ ] KPIs cuadran con la biblioteca real: 4 conteos por estado, total, media â˜… a un decimal.
- [ ] Un juego se cuenta exactamente una vez en cada distribuciÃ³n segÃºn su Estado del juego; plataformas `id: null` no aparecen.
- [ ] Â«TerminadosÂ» muestra 12 meses con conteo por `finishedAt` de jugadas.
- [ ] El Top 5 ordena por media de jugadas valoradas y al pulsar abre su Ficha.
- [ ] Los tres filtros acumulan entre dimensiones y recomputan todo al instante; sin datos hay estado vacÃ­o amable.
