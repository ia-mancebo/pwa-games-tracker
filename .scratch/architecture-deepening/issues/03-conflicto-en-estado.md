# 03: El conflicto pendiente en el estado + cableado explícito

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 1, cierra el Enlace de archivo.

**What to build:** el conflicto pendiente (texto, hash y doc del archivo) deja de ser un global del módulo y pasa al slice de estado del enlace de archivo en la app: «¿hay conflicto pendiente?» tiene una respuesta observable y el diálogo de conflicto se vuelve render puro del estado. Elevar un conflicto escribe el slice completo; la regla documentada es que los guards existentes (no volcar y no chequear externo mientras hay conflicto) son lo que mantiene vivo ese campo. El registro del handler de conflicto se hace explícito en el arranque de la app: la pastilla de archivo deja de registrar nada al importarse. → **ADR-0004**.

**Blocked by:** 02 — La decisión de conflicto del Enlace de archivo como función pura (ambos editan los mismos flujos).

**Status:** ready-for-agent

- [ ] El conflicto pendiente se lee y se borra a través del estado de la app; el global del módulo desaparece.
- [ ] El diálogo de conflicto renderiza desde estado; las tres opciones y las fechas de cada versión funcionan igual (spec §5.5, sin merge, jamás sobrescribir en silencio).
- [ ] La opción «descargar copia» deja el conflicto vivo para una resolución posterior, como hoy.
- [ ] El registro del handler ocurre en el arranque; la pastilla no registra nada al importarse.
- [ ] Los guards (omitir vuelco / omitir chequeo externo con conflicto pendiente) se testean leyendo el estado.
- [ ] Las dos suites del Enlace de archivo sobreviven con ajustes mínimos (el conflicto se lee del estado).
- [ ] ADR-0004 publicada: conflicto en el estado, regla de guards, y la opción rechazada de un slice aparte.
