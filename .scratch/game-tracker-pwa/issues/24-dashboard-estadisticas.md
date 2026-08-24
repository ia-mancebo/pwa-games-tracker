# 24 · Dashboard de estadísticas

**Status:** ready-for-agent
**Blocked by:** 17 · Ficha completa

## What to build

Vista **Estadísticas** solo lectura; todo recomputa con el filtro activo:

- **Filtros globales**: tres filas de chips (plataforma, género, etiqueta propia) en cabecera; selección única por dimensión con opción «Todas»; acumulables entre dimensiones.
- **KPIs**: conteo por cada uno de los 4 estados, total de juegos y media ★ (un decimal, sobre jugadas valoradas).
- **Barras de distribución** (mismo componente para las tres): plataforma usa `platforms[]` del juego —catálogo—, dejando fuera las propias (`id: null`); género y etiqueta cuentan un juego en cada una que tenga.
- **Terminados en el tiempo**: barras por mes de los últimos 12 (etiqueta corta tipo «ago 25»), contando jugadas terminadas con `finishedAt`.
- **Top 5 mejor valorados**: compacto (portada mini + título + ★), único elemento clicable → abre la Ficha; media del juego = media de sus jugadas valoradas.
- Totales por estado y distribuciones cuentan **Juegos una vez cada uno**, según su Estado del juego.
- Estado vacío amable cuando no hay datos.

## Acceptance criteria

- [ ] KPIs cuadran con la biblioteca real: 4 conteos por estado, total, media ★ a un decimal.
- [ ] Un juego se cuenta exactamente una vez en cada distribución según su Estado del juego; plataformas `id: null` no aparecen.
- [ ] «Terminados» muestra 12 meses con conteo por `finishedAt` de jugadas.
- [ ] El Top 5 ordena por media de jugadas valoradas y al pulsar abre su Ficha.
- [ ] Los tres filtros acumulan entre dimensiones y recomputan todo al instante; sin datos hay estado vacío amable.
