# 01: Documento v2 — Tiempo jugado, Tramos pendientes y Contador en marcha

**What to build:** un archivo personal `.json` de la versión 2 abre sin problemas: sus Jugadas pueden llevar **Tiempo jugado** (entero de segundos ≥ 0; ausente = 0) y **Tramos pendientes** (lista de Tramos `{id, segundos}`, cada uno entero ≥ 0), y la raíz puede llevar el ancla del **Contador en marcha** (Juego, Jugada e instante de inicio fecha-hora ISO), como máximo una por documento. Un archivo v1 sigue abriendo tal cual (campos opcionales, cero migración de datos). Un archivo con versión más nueva sigue recibiendo el rechazo forward-only con el mensaje claro «versión más nueva, actualiza la app» — y ese mensaje gana a cualquier error de campo desconocido: la comprobación de versión precede a la de campos desconocidos en la raíz. Valores mal tipados se rechazan sin tocar nada.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Un doc v2 con Tiempo jugado, Tramos pendientes y ancla de Contador valida y carga
- [x] Un doc v1 sin campos nuevos sigue validando igual que hoy (sin migración)
- [x] Un doc con versión futura se rechaza con el mensaje de versión correcto aunque traiga el campo nuevo de la raíz (versión antes que campos desconocidos)
- [x] Segundos negativos, no enteros, Tramos malformados y ancla malformada se rechazan con razón clara y sin mutar nada
- [x] Los campos desconocidos siguen siendo error como siempre (la política de validación no cambia fuera de lo nuevo)
