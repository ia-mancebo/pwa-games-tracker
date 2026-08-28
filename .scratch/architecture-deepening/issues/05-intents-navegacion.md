# 05: Intents de las Transiciones de la Biblioteca

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 3. Las reglas de navegación viven hoy re-encodadas en cinco archivos; este ticket les da casa. Toca la hoja de Alta (danza del duplicado), por eso va tras el 04.

**What to build:** una interface de intents que posee todas las transiciones de la Biblioteca y su acoplamiento al historial: cambiar de pestaña (con sus dos reglas: volver a Biblioteca repone la estantería y conserva búsqueda/filtros; cualquier cambio cierra la Ficha y crea pantalla nueva), abrir Panel, volver a Estantería, abrir Ficha en la misma pestaña (push de gameId), abrir Ficha cambiando de pestaña (push único con pestaña+gameId, el patrón del Top5 de estadísticas), cerrar Ficha (siempre navigate-back, que degrada a set sin profundidad), y la reposición a estantería tras borrar un juego (replace). El módulo mecánico de backnav queda intacto. La danza de tres pasos del «abrir ficha existente» del Alta queda como cerrar hoja + intent de abrir-Ficha-cambiando-de-pestaña. → **ADR-0005**.

**Blocked by:** 04 — Pasarela de Alta desde la Fuente de datos (solape de edición en la hoja del Alta).

**Status:** ready-for-agent

- [ ] Ninguna vista patchea a mano el slice de Biblioteca; las transiciones pasan por la interface de intents.
- [ ] Volver a Biblioteca desde otra pestaña repone la estantería conservando búsqueda y filtros; cambiar de pestaña cierra siempre la Ficha (comportamiento fijado por los tickets 14/17 de la spec v1).
- [ ] Abrir la Ficha desde el Top5 de estadísticas y desde un duplicado del Alta empuja una sola entrada de historial (pestaña+gameId); el botón atrás del móvil regresa al origen.
- [ ] Cerrar la Ficha consume historial siempre y degrada correctamente sin historial; idéntico desde «← Volver» y desde el botón atrás.
- [ ] La danza de tres pasos del duplicado desaparece.
- [ ] La suite de backnav no cambia; suite nueva de intents que cubre transiciones y profundidad de historial con el patrón de history fake existente.
- [ ] El comportamiento visible no cambia (spec §8.1–8.5, página única sin rutas).
- [ ] ADR-0005 publicada: intents propios vs crecer backnav o app.
