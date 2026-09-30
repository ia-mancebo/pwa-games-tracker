# 09: Dashboard — bloque de Tiempo jugado

**What to build:** el Dashboard de estadísticas suma un bloque de tiempo: el total de horas jugadas de la Biblioteca y su reparto por el Estado de cada Jugada (lo jugando frente a lo terminado y lo abandonado). Solo cuenta Tiempo jugado ya consolidado: los Tramos pendientes no mueven las cifras, y las Jugadas sin campo cuentan 0. Es agregación pura con `now` por parámetro, como el resto del módulo de agregaciones, y el bloque se renderiza en la vista de Estadísticas con la misma semántica de conjunto que los demás agregados (sin filtros, es el total de la Biblioteca).

**Blocked by:** 01 (Documento v2).

**Status:** ready-for-agent

- [x] Total de horas jugadas visible en Estadísticas
- [x] Desglose por Estado de cada Jugada (lo jugando / lo terminado / lo abandonado / lo pendiente de jugar)
- [x] Solo tiempo consolidado: Tramos pendientes no suman; Jugadas sin campo cuentan 0
- [x] Agregación pura con `now` por parámetro y misma semántica de conjunto que el resto del módulo
