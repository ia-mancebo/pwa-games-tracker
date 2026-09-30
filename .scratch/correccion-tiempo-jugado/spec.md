# Corrección del Tiempo jugado

Status: ready-for-agent

Cerrada el 30-09-2026 tras sesión de grilling (Q1–Q11). Usa el vocabulario de `CONTEXT.md` (con **Tiempo jugado** ya enmendado con la corrección) y respeta el ADR-0012 («Corrección manual del Tiempo jugado»), que revisa deliberadamente la regla de invarianza del ADR-0011. La spec del Contador (`.scratch/contador-tiempo/spec.md`) puso «editar a mano el Tiempo jugado ya guardado» fuera de alcance: esta spec es la funcionalidad que incorpora ese cambio.

---

## Problem Statement

El usuario se equivoca al guardar tiempo: confirma un Tramo con otra duración por descuido, lo guarda tal cual sin querer, o el prefill del tiempo de pared al reabrir la app no refleja lo realmente jugado. Una vez Consolidado el error, no existe forma de reducir (ni subir) el Tiempo jugado de una Jugada: el valor equivocado queda en su archivo personal para siempre y contamina el Dashboard de estadísticas.

## Solution

En la Ficha, cada Jugada muestra junto a su Tiempo jugado un botón de lápiz visible. Al pulsarlo, el valor pasa a campo editable prefilled con el valor exacto en formato reloj `H:MM:SS`; el usuario escribe el valor correcto (se aceptan formas cortas) y confirma con ✓/Enter, o cancela con ✕/Esc. Entrada inválida muestra aviso inline sin cerrar el campo. La corrección reemplaza el valor guardado —un set, no una resta—: vale lo mismo subir que bajar, incluido dejarlo a cero. Si el Contador corre sobre esa Jugada, la corrección lo auto-pausa y su tiempo queda como Tramo pendiente de revisión; los Tramos pendientes no se consumen, y los Tramos confirmados después se suman sobre la base corregida. Sin segundo diálogo de «¿seguro?»: el propio campo es el paso deliberado.

---

## User Stories

1. Como usuario, quiero un lápiz visible junto al Tiempo jugado de cada Jugada en la Ficha, para saber sin adivinar que puedo corregirlo, también en móvil sin hover.
2. Como usuario, quiero reducir el Tiempo jugado de una Jugada, para arreglar un tiempo guardado de más por error.
3. Como usuario, quiero subir el Tiempo jugado de una Jugada, para añadir tiempo que olvidé registrar.
4. Como usuario, quiero que subir y bajar sean la misma acción (establecer un valor), para no pensar en restas ni en dos controles distintos.
5. Como usuario, quiero poder dejar el Tiempo jugado a cero, para empezar limpio cuando el historial de esa Jugada está entero mal.
6. Como usuario, quiero que el campo abra prefilled con el valor exacto actual en `H:MM:SS`, para ajustar sobre lo que hay sin perder los segundos.
7. Como usuario, quiero teclear formas cortas (`H:MM`, `M:SS`, solo segundos), para corregir rápido sin rellenar ceros.
8. Como usuario, quiero que ✓/Enter aplique la corrección, para confirmarla de forma deliberada.
9. Como usuario, quiero que ✕/Esc cancele sin cambiar nada, para arrepentirme sin consecuencias.
10. Como usuario, quiero un aviso inline si lo escrito no es un tiempo válido, sin que se cierre el campo, para corregir mi tecleo sin reabrir.
11. Como usuario, quiero que la corrección aplique tras confirmar el propio campo, sin doble diálogo, para que arreglar un número no sea engorroso.
12. Como usuario, quiero que si el Contador corre sobre esa Jugada la corrección lo auto-pause y deje su Tramo pendiente, para que ni lo contado en marcha ni lo ya guardado se pierdan.
13. Como usuario, quiero que los Tramos pendientes de esa Jugada queden intactos tras una corrección, para seguir decidiendo sobre ellos después.
14. Como usuario, quiero que los Tramos que confirme después de corregir se sumen sobre el valor corregido, para que la consolidación siga funcionando como siempre.
15. Como usuario, quiero corregir cada Jugada por separado, para arreglar solo la que está mal sin tocar las demás.
16. Como usuario, quiero que corregir una Jugada no toque un Contador en marcha de otra Jugada, para que ese conteo siga su curso.
17. Como usuario, quiero ver el valor corregido en la Ficha en cuanto aplico, para comprobar de un vistazo que quedó como quería.
18. Como usuario, quiero que el Dashboard de estadísticas refleje el valor corregido sin hacer nada, para que mis cifras no queden contaminadas.
19. Como usuario, quiero que la corrección llegue a mi archivo personal por el autoguardado de siempre, para que sobreviva a sesiones y dispositivos.
20. Como usuario, quiero corregir Jugadas en cualquier Estado (Quiero jugar, Jugando, Terminado, Abandonado), para que el error no importe del ciclo de vida.
21. Como usuario, quiero que un archivo sin Tiempo jugado (v1) admita la corrección igualmente, para no necesitar ninguna migración.
22. Como usuario, quiero que la app rechace guardar lo que rompería el archivo (nada de enteros < 0), para que mi `.json` siga siempre válido.
23. Como usuario, quiero que la corrección funcione sin conexión, porque la app es offline-first y mis correcciones no dependen de la red.
24. Como usuario, quiero que el Aviso de contador siga mostrando el tiempo vivo correctamente durante y tras una corrección, para que no haya regresiones en el cronómetro.

## Implementation Decisions

**Dominio y esquema (ADR-0012)**

- **Sin cambio de esquema**: el Doc sigue en v2. El campo del Tiempo jugado ya es opcional y ya valida entero ≥ 0; la corrección es un comando nuevo, ni versión ni migración. Un archivo v1 la admite igualmente (campo ausente = 0 como base del set).

**Comandos (motor de la Ficha)**

- Comando nuevo **`setPlayTime(gameId, playId, seconds)`** en el motor de la Ficha, siguiendo la familia `setPlay*` existente (`setPlayDate`, `setPlayPlatform`, `setPlayNotes`). Devuelve `Promise<Result>` como todos y muta por el cauce usual del repositorio, así que revalidación del doc, espejo IndexedDB, marca dirty y autoguardado del Enlace de archivo funcionan sin tocar nada.
- **Semántica**: establece el Tiempo jugado de la Jugada al valor dado (set absoluto, no resta). `seconds` debe ser entero ≥ 0; cualquier otra cosa → `Result` de error sin mutación.
- **Auto-pausa**: si el Contador está anclado a ESA Jugada, la corrección reutiliza la misma auto-pausa que ya usan añadir Jugada y Terminar/Abandonar (Tramo pendiente en la Jugada + ancla limpia) antes de aplicar el set. Si el ancla es de otra Jugada (o no hay), no toca el Contador.
- **Tramos pendientes**: los de esa Jugada no se consumen ni se re-prefillan; quedan tal cual. La confirmación posterior de un Tramo suma sobre la base corregida, que es solo un set del campo — el comando de consolidar no cambia.
- **Sin historial ni undo**: el valor anterior desaparece del Doc; la única recuperación es el archivo conectado o el respaldo de instantánea, coherente con el resto de ediciones de la Ficha (título, fechas, notas).

**Pantallas (Ficha)**

- Cada Jugada muestra su Tiempo jugado con un **lápiz visible siempre** (affordance explícita, convención nueva anotada). Al pulsarlo, el valor pasa a campo de texto en línea, prefilled con el valor exacto en el mismo formato de reloj que muestra el Contador.
- **Parser de reloj** junto al módulo de formato compartido: texto → segundos o nulo. Formas aceptadas: `H:MM:SS`, y dígitos sin relleno obligatorio (`1:2:3` = 1 h 2 min 3 s), con espacios recortados. **Dos componentes = `H:MM`** (horas:minutos), no `M:SS`: el caso dominante al corregir es la escala de horas, y leer `1:30` como minuto y medio borraría horas enteras sin undo; para minutos:segundos se teclea el reloj completo (`0:05:30`). Un solo número = segundos. Rechaza vacío, negativos, decimales y todo lo no numérico.
- ✓/Enter aplica (parsea → comando → cierra si ok); ✕/Esc cancela; parseo inválido → aviso inline, el campo sigue abierto con lo tecleado. No hay doble diálogo.
- El reloj vivo del Contador (héroe, tarjeta, Aviso de contador) no cambia: sigue siendo cálculo (Tiempo jugado + tramo en marcha). Tras una corrección con auto-pausa, el Aviso señala el Tramo pendiente como siempre.

**Documentación ya escrita** (hecho, no pendiente de implementación): enmienda de **Tiempo jugado** en `CONTEXT.md`; regla de **affordance explícita** en las convenciones de implementación; **ADR-0012** registrando la reversa de la invarianza de ADR-0011.

## Testing Decisions

- Un buen test solo prueba **comportamiento externo observable**: efectos de los comandos sobre el documento, valores de las funciones puras y `Result` devueltos. Nada de implementación interna (helpers privados, detalles de render).
- **Costura principal**: motor de comandos de la Ficha contra biblioteca real simulada (fake-indexeddb), con semillas y comprobaciones sobre el doc resultante. Prior art directo: los tests del propio motor. Aquí caen: set al alza y a la baja; set a 0; set sobre Jugada sin Tiempo jugado (campo ausente); rechazo de segundos inválidos (negativos, no enteros) sin mutar; auto-pausa al corregir la Jugada anclada (Tramo pendiente creado, ancla limpia, set aplicado); sin auto-pausa cuando el ancla es de otra Jugada; Tramos pendientes intactos tras corregir; confirmación posterior que suma sobre la base corregida; y el doc resultante sigue validando (cauce de `mutate` normal).
- **Costura secundaria (pura)**: el parser de reloj, con tabla de aceptación/rechazo: `12:34:00`, `0:05:30`, `1:30` (→ 1 h 30 min), `1:2:3`, `90` (→ 90 s), con espacios; rechaza vacío, `abc`, `-5`, `1.5:00`, `12:34:56:78`. Prior art: los tests puros del módulo de formato.
- **No se testea el render** de la vista: la costura de comandos cubre el comportamiento y el render es delgado, como el resto de la Ficha.

## Out of Scope

- Undo o historial de correcciones (el valor anterior se pierde del Doc; queda solo en el archivo conectado o el respaldo).
- Corregir Tramos ya consolidados o editar la historia de consolidación: el Doc no guarda procedencia de los Tramos (decisión del ADR-0012).
- Segundo diálogo de confirmación antes de aplicar.
- Corrección fuera de la Ficha (Estantería, Panel, Dashboard): solo allí se consulta y edita por Jugada.
- Ajustes relativos («restar 10 min») o formas de entrada nuevas más allá del parser descrito.
- Cambios en el flujo de decisión de Tramos pendientes (las cuatro salidas siguen igual), en el Contador en marcha, en Novedades, en la sincronización del archivo o en el service worker.

## Further Notes

- Juicio de síntesis no cubierto por el grilling: la ambigüedad de `1:30` (¿`M:SS` o `H:MM`?) se resolvió como **`H:MM`** — dado que no hay undo ni doble diálogo, el error a la baja silencioso (borrar horas enteras) es peor que el alza visible; además el campo abre prefilled en 3 componentes, así que el caso de horas no exige teclear formas cortas. Si el usuario prefiere `M:SS`, es una línea del parser.
- La decisión y su justificación viven en el ADR-0012 y en la enmienda del glosario (`CONTEXT.md`); esta spec no las repite: las usa.
- Del grilling quedó un principio transversal anotado en las convenciones: **affordance explícita** — ninguna acción editable se anuncia solo con hover o por descubrimiento casual (motivo: en móvil no hay hover; el usuario no sabía que el título de la Ficha era editable).
- Coherencia con la spec del Contador: su historia «el Tiempo ya guardado no cambie nunca sin mi decisión» sigue siendo cierta — la corrección es la decisión explícita del usuario, no un cambio a sus espaldas.
