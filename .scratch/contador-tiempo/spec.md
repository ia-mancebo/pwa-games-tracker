# Contador de tiempo jugado en la Ficha

Status: ready-for-agent

Cerrada el 29-09-2026 tras sesión de grilling (Q1–Q26). Usa el vocabulario de `CONTEXT.md` (términos nuevos ya anotados: Jugada más reciente, Contador, Tramo, Consolidar, Tiempo jugado, Aviso de contador) y respeta el ADR-0011 («Contador en el Doc, documento v2 y tramos pendientes de revisión»). La spec v1 (`.scratch/game-tracker-pwa/spec.md`, §13) excluía «horas jugadas por entrada» de su alcance: esta spec es la funcionalidad que la incorpora.

---

## Problem Statement

El usuario juega sus partidas y luego quiere saber cuánto tiempo les dedicó, pero no tiene forma de medirlo en la app: tendría que usar un cronómetro aparte y apuntar el tiempo a mano en las notas de la Jugada. Los datos del Dashboard de estadísticas ignoran por completo una de las dimensiones más interesantes de su hábito de juego: el tiempo.

## Solution

En la Ficha de un Juego, un botón Iniciar/Pausar pone en marcha un cronómetro (el **Contador**) ligado a la Jugada más reciente. Al pausar, el tiempo contado no se suma automáticamente: produce un **Tramo** que el usuario guarda tal cual, guarda con otra duración, o descarta. Solo los Tramos confirmados se consolidan en el **Tiempo jugado** de la Jugada, que nadie modifica a sus espaldas. Aviso fijo en todas las pantallas muestra el contador en marcha (con Pausar inline) y abre la Ficha de su Juego. Si la app se cierra con el contador en marcha, este sigue contando: al reabrir, el tiempo transcurrido espera como Tramo pendiente de revisión. El Dashboard de estadísticas suma el total de horas y lo reparte por Estado.

---

## User Stories

1. Como usuario, quiero un botón Iniciar en la Ficha de un juego, para cronometrar la partida actual sin salir de la app.
2. Como usuario, quiero seguir el tiempo contado en vivo mientras corro el Contador, para saber cuánto llevo de esta sesión.
3. Como usuario, quiero que el Contador quede ligado a la Jugada más reciente de su Juego, para que el tiempo contado pertenezca a la partida actual.
4. Como usuario, quiero pausar el Contador pulsando el mismo botón, para detener el conteo sin cerrar nada más.
5. Como usuario, quiero que al pausar me pregunte qué hacer con el tiempo contado (guardar tal cual, guardarlo con otra duración o descartarlo), para decidir yo qué entra en mi historial.
6. Como usuario, quiero que la duración que ofrezco al pausar esté prefillada con lo realmente contado, para confirmarlo de un vistazo.
7. Como usuario, quiero poder editar la duración de un Tramo antes de guardarlo, para corregir interrupciones (p. ej. dejé el contador corriendo por descuido).
8. Como usuario, quiero poder poner la duración a cero para descartar un Tramo, para que un tramo ridículo no ensucie mi historial.
9. Como usuario, quiero descartar un Tramo sin dejar rastro, para que lo descartado no aparezca por ningún sitio.
10. Como usuario, quiero que el tiempo ya guardado de la Jugada no cambie nunca sin mi decisión, para confiar en mi historial.
11. Como usuario, quiero que los Tramos que decido más tarde queden señalizados hasta revisarlos, para que no se me olviden.
12. Como usuario, quiero revisar los Tramos pendientes en la tarjeta de su Jugada, porque ahí es donde vive ese tiempo.
13. Como usuario, quiero decidir varios Tramos pendientes uno a uno, para dar a cada uno su propio trato.
14. Como usuario, quiero poder volver a iniciar el Contador aunque tenga Tramos pendientes de esa Jugada, para no tener que tramitar nada antes de sentarme a jugar.
15. Como usuario, quiero que solo pueda haber un Contador en marcha en toda la Biblioteca, para que mi tiempo sea siempre de una sola partida.
16. Como usuario, quiero que al iniciar un Contador en otro juego el anterior se pause solo y su tiempo quede a salvo, para no perder lo contado por despiste.
17. Como usuario, quiero que marcar una Jugada como Terminado o Abandonado pause el Contador y deje su tramo pendiente, para cerrar la partida sin perder el registro.
18. Como usuario, quiero que al añadir una nueva Jugada el Contador de la jugada anterior se pause y su tramo quede pendiente, para cronometrar la partida nueva desde cero.
19. Como usuario, quiero que iniciar el Contador ponga la Jugada en estado Jugando si no lo estaba, para que el estado refleje la realidad sin doble trabajo.
20. Como usuario, quiero poder iniciar el Contador de una Jugada Terminada o Abandonada (reabrir la partida), para cronometrar rejugadas sin crear una Jugada nueva.
21. Como usuario, quiero un aviso fijo visible en todas las pantallas mientras haya un Contador en marcha, para no olvidar que estoy cronometrando.
22. Como usuario, quiero que ese aviso muestre el Juego, el tiempo transcurrido y un botón de Pausar, para controlar el Contador desde cualquier parte.
23. Como usuario, quiero que pulsar el aviso abra la Ficha de su Juego, para volver rápido a donde está mi partida.
24. Como usuario, quiero que el aviso señale cuándo hay Tramos pendientes de revisión, para encontrarlos aunque no esté viendo esa Ficha.
25. Como usuario, quiero que el Contador siga contando aunque cierre la app, para no perder el tiempo de la sesión que sigo jugando fuera del navegador.
26. Como usuario, quiero que al reabrir la app el tiempo transcurrido con ella cerrada me espere como Tramo pendiente prefillado, para decidir si ese tiempo fue realmente juego.
27. Como usuario, quiero ver el Tiempo jugado acumulado de cada Jugada en la Ficha (héroe y tarjetas), para tener el historial completo de horas de un juego.
28. Como usuario, quiero ver el Tiempo jugado en las Jugadas menos recientes como dato (sin botón), para conocer las horas de rejugadas pasadas sin riesgo de mezclarlas.
29. Como usuario, quiero un bloque de tiempo en el Dashboard de estadísticas con el total de horas jugadas, para tener la cifra global de mi biblioteca.
30. Como usuario, quiero que ese bloque reparta las horas por el Estado de cada Jugada, para saber cuánto tiempo puse en lo jugando frente a lo terminado y lo abandonado.
31. Como usuario, quiero que el Dashboard solo cuente el tiempo ya consolidado, para que los números no cambien por Tramos que aún no he decidido.
32. Como usuario, quiero que mis datos (Tiempo jugado, Tramos pendientes, Contador en marcha) vivan dentro de mi archivo personal `.json`, para que viajen con mi biblioteca y sobrevivan a cualquier limpieza del navegador, con autoguardado igual que el resto.
33. Como usuario, quiero que un archivo de una versión anterior siga abriéndose sin problema, para no romper mis copias antiguas al actualizar.
34. Como usuario, quiero un mensaje claro si abro un archivo hecho con una versión más nueva de la app, para saber que me toca actualizar antes de culpar a mis datos.
35. Como usuario, quiero que todo esto funcione sin conexión, porque la app es offline-first y ninguna de mis horas de juego depende de la red.

## Implementation Decisions

**Dominio y esquema (ADR-0011)**

- El documento sube a **v2**. Todos los campos nuevos son **opcionales**: un archivo v1 es válido tal cual y no necesita migración; un archivo con version > actual sigue recibiendo el rechazo forward-only de siempre («versión más nueva, actualiza la app»). La constante de versión actual pasa de 1 a 2.
- Nueva Jugada: campo opcional **Tiempo jugado** (entero de segundos ≥ 0; ausente = 0) y campo opcional **Tramos pendientes**: lista de Tramos {id, segundos}, cada uno un entero ≥ 0. Todo Tramo pendiente marca su titularidad por vivir dentro de su Jugada; no hay colección global de tramos.
- Nuevo campo raíz opcional **Contador en marcha**: ancla con el Juego, la Jugada y el instante de inicio (fecha-hora ISO). No puede haber más de uno por documento; la unicidad de «un solo Contador en la Biblioteca» es invariante de los comandos, no de la forma del archivo.
- Los validadores de forma pasan a admitir los campos nuevos con sus reglas de tipo (enteros ≥ 0); el resto de la política de validación no cambia: campos desconocidos siguen siendo error, así el lector desactualizado ve el mensaje de versión correcto y no uno críptico de campo desconocido.

**Comandos (motor de la Ficha)**

- El motor de comandos de la Ficha (interface de comandos sobre el repositorio, ADR-0005/0006) suma los comandos: **iniciar Contador** (para un Juego), **pausar Contador**, **confirmar Tramo** (por Jugada y Tramo, con duración opcional a sustituir), **descartar Tramo**. Todos devuelven `Promise<Result>` como el resto del motor y mutan por el cauce usual (`mutate` del repositorio), con lo que el autoguardado del Enlace de archivo y el espejo IndexedDB funcionan sin tocar nada.
- **Iniciar**: si hay un Contador en marcha —de cualquier Juego— lo pausa antes (auto-pausa → Tramo pendiente en su Jugada). Después crea el ancla con `now` como instante de inicio. La Jugada apuntada pasa a Estado «Jugando» si no lo estaba; este arranque reutiliza la semántica existente (volcar a «Jugando» auto-rellena fecha de inicio si faltaba) y reabre partidas Terminadas/Abandonadas. El instante de inicio se escribe en el Doc inmediatamente (es lo que permite contar con la app cerrada); la marcha posterior NO escribe el Doc por segundo — el total vivo es un cálculo.
- **Pausar** (y toda auto-pausa: iniciar otro Contador, setStatus a Terminado/Abandonado, añadir Jugada): calcula el tramo transcurrido con el instante de inicio, lo deja como Tramo pendiente en la Jugada (`id` nuevo, segundos entero) y limpia el ancla. Nadie consolida nada automáticamente: entrar al Tiempo jugado solo pasa por confirmar el Tramo.
- **Reabrir con app cerrada**: al boot (composition root, ADR-0010), si el Doc trae el ancla de un Contador en marcha, se calcula el tiempo de pared transcurrido («ahora − instante de inicio»), se deshace el ancla y se deja el resultado como Tramo pendiente prefillado (revisable como cualquier otro). Sin tope ni corrección: el usuario revisa y decide; ningún límite «de sensatez» muta sus datos.
- **Confirmar Tramo**: añade la duración al Tiempo jugado de la Jugada y quita el Tramo de pendientes. Sin duración pasada, usa la prefillada. Duración 0 equivale a descartar (el tramo desaparece sin sumar nada).
- **Descartar Tramo**: lo elimina de pendientes; no hay rastro de él ni en pendientes ni en el consolidado.

**Pantallas**

- **Ficha** (vista existente): botón Iniciar/Pausar en el héroe y en la tarjeta de la Jugada más reciente. Otras Jugadas muestran su Tiempo jugado como dato. Formato vivo: `H:MM:SS`; formato histórico: redondo (p. ej. «12 h 34 min»), con un módulo de formato compartido para que todas las pantallas digan lo mismo.
- Mientras corre el Contador, la duración mostrada en héroe/tarjeta/aviso = Tiempo jugado existente + tiempo aún no pausado (cálculo vivo). El patrón de reloj vivo es UI efímera del slice de la Ficha (ADR-0006) o un tictac del shell, pero lo persistente —el ancla y los pendientes— vive siempre en el Doc; la interfaz del estado global crece con lo mínimo para el tictac global.
- El consejo de pausa in situ al pausar manualmente es una interacción de la vista: a la hora de la pausa, un prompt con el tramo prefillado ofrece las tres salidas (guardar tal cual / editar y guardar / descartar); cerrar sin decidir deja el Tramo pendiente para revisar después.
- La barra global (**Aviso de contador**) vive en el shell para estar en todas las pantallas. Muestra Juego + tiempo vivo + Pausar inline, señala Tramos pendientes de revisar y al pulsar (fuera del Pausar) abre la Ficha del Juego (navegación existente, con su pila atrás).
- **Dashboard de estadísticas**: el módulo de agregaciones suma un bloque de tiempo: total de horas jugadas de la Biblioteca y desglose por Estado de cada Jugada. Cuenta solo Tiempo jugado consolidado; Jugadas sin campo cuentan 0. Es agregación pura con `now` por parámetro como el resto del módulo.

## Testing Decisions

- Un buen test aquí solo prueba **comportamiento externo observable**: efectos de los comandos sobre el documento (y lo que el store publica) y resultados de las funciones puras de dominio. Nada de pan por implementación interna (helpers privados, detalles de render, nombres de eventos).
- **Costura principal (la casi única)**: motor de comandos de la Ficha contra una biblioteca real simulada en memoria (fake-indexeddb), como todo el ciclo de vida de Jugadas que ya testea el motor. El reloj es inyectable: el flujo «iniciar → cerrar la app → reabrir días después → tramo por tiempo de pared» se prueba sembrando el Doc con el ancla y reinicializando la biblioteca con un `now` posterior, sin navegador. Aquí caen: unicidad del Contador, las cuatro formas de pausa (manual, iniciar otro, Terminar/Abandonar, añadir Jugada), consolidación solo por confirmación, edición de duración, 0 ≡ descartar, descartado sin rastro, acumulación de pendientes e inicio que los ignora, reabrir partida Terminada/Abandonada, y la fecha de inicio auto-rellenada al pasar a Jugando.
- **Costura de dominio (existente)**: validadores de forma del documento v2 — campos nuevos aceptados con sus reglas, v1 sin campos nuevos sigue validando, versión futura sigue rechazándose como siempre; y agregación de tiempo del Dashboard: total y desglose por Estado con solo consolidados y ausentes = 0.
- **Costura de navegador (opcional, mínima)**: para lo que jsdom no alcanza —el aviso visible en todas las pantallas y sobreviviendo a una recarga real— un script de comprobación con Edge headless contra un dev server, al estilo de los scripts `check-*` existentes. Es un añadido voluntario, no parte del mínimo del feature.
- Prior art directo: los tests del motor de la Ficha (son exactamente esta forma de testear, con semillas y comprobaciones sobre el doc resultante), los tests de validación de documento y los tests puros de estadísticas.

## Out of Scope

- Ranking de juegos por tiempo en el Dashboard (sigue siendo el paso 3 del bloque de tiempo; barato de añadir después).
- Editar a mano el Tiempo jugado ya guardado, o retocar/eliminar Tramos ya consolidados: solo se puede decidir sobre Tramos pendientes.
- Rastro de Tramos descartados, tope de sensatez sobre el tiempo contado con la app cerrada, o cualquier «mejor» que doble el tiempo: decisión explícita del grilling (Q14→Q20, ADR-0011).
- Historial de sesiones por fecha (los Tramos consolidados se funden en el total de la Jugada, no se conservan como sesiones separadas).
- Mostrar tiempo fuera de la Ficha y el Dashboard (Estantería, Panel, raíl «Jugando ahora»).
- Cambios en la sincronización del archivo, el Enlace de archivo, el espejo IndexedDB o el service worker: todo pasa por el cauce habitual.

## Further Notes

- Dato de partida: «horas jugadas» estaba en el §13 de la spec v1 como fuera de alcance; esta spec levanta esa valla para esta funcionalidad concreta y deja el resto del §13 intacto.
- Las decisiones de diseño y su justificación viven en el ADR-0011 y en el glosario (`CONTEXT.md`); esta spec no las repite: las usa.
- El grilling dejó una afirmación fija que el motor respeta: durante la marcha el Doc no se escribe por segundo; solo se escribe al pausar (quedando el Tramo pendiente) y al confirmar/descartar un Tramo. El total mostrado en marcha siempre se calcula (Tiempo jugado + tramo en marcha).
- Dos preguntas del grilling sobre consolidación quedaron codificadas así: la **pausa manual pregunta in situ** (con salida sin decidir → queda pendiente), y las **auto-pausas siempre dejan pendiente** para revisar después en la tarjeta de su Jugada. Es la traducción exacta de «cuando sea posible, preguntar al usuario».
