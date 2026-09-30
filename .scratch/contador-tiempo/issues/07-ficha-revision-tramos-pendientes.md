# 07: Ficha — revisión de Tramos pendientes y Tiempo jugado histórico

**What to build:** el tiempo de una Jugada se consulta y se decide en su tarjeta: los Tramos pendientes de la Jugada más reciente aparecen en su tarjeta señalizados y se deciden uno a uno, cada uno con su propio trato —guardar con la duración prefillada, guardar con otra duración, o descartar sin rastro; poner la duración a cero descarta—. Las Jugadas menos recientes muestran su Tiempo jugado como dato, sin botón, en formato histórico. Mientras queden pendientes por decidir, la Ficha lo señala hasta revisarlos.

**Blocked by:** 02 (Formato de tiempo compartido), 04 (Motor: consolidar Tramos).

**Status:** ready-for-agent

- [x] Los Tramos pendientes de la Jugada más reciente se ven y deciden uno a uno en su tarjeta
- [x] Duración editable antes de guardar; cero = descartar; descartado sin rastro
- [x] El Tiempo jugado ya guardado se muestra como dato y nunca cambia sin decisión del usuario
- [x] Jugadas menos recientes muestran su Tiempo jugado en formato histórico, sin botón
- [x] La señalización de pendientes desaparece al decidirlos todos
