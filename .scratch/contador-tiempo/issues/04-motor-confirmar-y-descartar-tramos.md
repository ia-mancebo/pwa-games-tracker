# 04: Motor — consolidar Tramos (confirmar y descartar)

**What to build:** el usuario decide cada Tramo pendiente desde el motor de la Ficha: confirmar añade la duración al Tiempo jugado de la Jugada y quita el Tramo de pendientes —sin duración pasada usa la prefillada; la pasada la sustituye; duración 0 equivale a descartar—. Descartar lo elimina de pendientes sin rastro, ni en pendientes ni en el consolidado. Consolidar solo pasa por aquí: el Tiempo jugado ya guardado no cambia nunca por otra vía ni a espaldas del usuario.

**Blocked by:** 03 (Motor del Contador: iniciar y pausar).

**Status:** ready-for-agent

- [x] Confirmar sin duración consolida la prefillada y quita el Tramo de pendientes
- [x] Confirmar con otra duración consolida esa duración en su lugar
- [x] Confirmar con duración 0 no suma nada y quita el Tramo (≡ descartar)
- [x] Descartar quita el Tramo sin rastro en pendientes ni en el consolidado
- [x] Varios Tramos pendientes se deciden uno a uno sin afectar al resto
- [x] Confirmar o descartar un Tramo inexistente devuelve error limpio sin tocar nada
