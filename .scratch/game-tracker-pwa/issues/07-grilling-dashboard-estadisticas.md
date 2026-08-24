# 07 · Grilling: dashboard de estadísticas

Type: grilling
Status: resolved
Blocked by: 04

## Question

¿Qué métricas y vistas incluye el dashboard v1? Candidatos sobre los datos del esquema cerrado en el ticket 04:

- Totales por estado (quiero jugar / jugando / terminado / abandonado).
- Distribución por plataforma, género y etiqueta propia.
- Valoración media y mejor valorados.
- Terminados por mes/año usando la fecha de fin.

Priorizar un conjunto pequeño y útil para v1. Skills: `grilling` + `domain-modeling`.

## Answer

Cerrado el 24-08-2026 por grilling con el usuario. El dashboard v1 es una vista de **solo lectura con filtros globales**; todo recomputa con el filtro activo.

### Contenido v1

- **KPIs**: conteo por cada uno de los 4 estados, total de juegos y media ★.
- **Barras de distribución**: plataforma, género y etiqueta propia (mismo componente).
- **Terminados en el tiempo**: barras por mes de los últimos 12 meses (etiqueta corta tipo «ago 25»).
- **Top 5 de juegos mejor valorados**: compacto (portada mini + título + ★); único elemento clicable y abre la ficha del juego.
- Estado vacío amable cuando no hay datos.

### Semántica de recuento

- Totales por estado y distribuciones cuentan **Juegos, una vez cada uno**, según su «Estado del juego» = estado de su jugada más reciente (por `addedAt`). Término añadido al glosario.
- Terminados por mes cuentan **jugadas**: cada jugada terminada con `finishedAt` es un punto.
- Media del KPI: sobre jugadas valoradas, un decimal. Media de un juego para el Top 5: media de sus jugadas valoradas.
- Distribución por plataforma: juegos según `platforms[]` (catálogo); las plataformas propias (`id: null`, emuladores) quedan fuera del gráfico en v1.
- Distribución por género/etiqueta: un juego cuenta en cada género o etiqueta que tenga.

### Filtros

- Tres dimensiones: **plataforma, género y etiqueta propia**, como filas de chips en la cabecera de la pestaña.
- Selección única por dimensión con opción «Todas»; entre dimensiones se acumulan (Y lógico); sin selección = sin filtrar.
- Solo lectura: nada editable desde el dashboard salvo abrir fichas desde el Top 5.
- Multi-selección dentro de una dimensión y filtro por estado: fuera de v1.

Nota dejada al ticket 08: la estantería comparte esta semántica de recuento.
