# 02: La decisión de conflicto del Enlace de archivo como función pura

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 1. El fix reciente del pre-chequeo de hash aterrizó en una de las cuatro copias de la decisión; este ticket hace que solo exista una.

**What to build:** el módulo del Enlace de archivo exporta una función pura de decisión. Entrada: texto del archivo, su hash y la meta persistida. Salida: uno de tres resultados — *igual*; *recarga* (lleva texto y hash); *conflicto* (lleva lo mismo). No hace I/O ni toca el store. Los cuatro flujos (restaurar enlace, guardar ahora, reconectar, chequeo externo) conservan su lectura, su manejo de errores y su mapeo a resultados del enlace, pero deciden todos a través de ella. La tabla de la decisión se testea sin fake handles. De paso, en el mismo módulo: el handle store por defecto (hoy duplicado en init y reset) se define una vez en una factory, y la lista de aceptación del picker pasa a tener fuente única en el servicio FSA, de la que el input de reserva deriva.

**Blocked by:** 01 — Utilidades compartidas y limpieza (solape de edición en el mismo módulo).

**Status:** ready-for-agent

- [ ] La función de decisión es pura, exportada y sin I/O; los cuatro flujos deciden a través de ella.
- [ ] El manejo de errores propio de cada flujo no cambia (needs-gesture al restaurar, cancelled en reconexión, error silencioso en el chequeo externo).
- [ ] Tabla de tests sin fake handles: hash igual / distinto+espejo limpio / distinto+espejo sucio, más la interacción con los guards (conflicto pendiente, force).
- [ ] El handle store por defecto se define una vez y lo usan init y reset.
- [ ] La lista MIME/accept vive en el servicio FSA y el input de reserva la deriva.
- [ ] Las suites del Enlace de archivo en verde; orden de chequeos, debounce 15 s y escritura atómica intactos (spec §5.3–5.5).
