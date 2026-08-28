# Profundización de arquitectura — Enlace de archivo, Alta, Transiciones y Ficha

**Status:** ready-for-agent
**Fecha:** 28-08-2026
**Origen:** revisión de arquitectura + sesión de grilling (6 candidatos, 16 decisiones asentadas). Vocabulario de dominio en `CONTEXT.md` (ya actualizado con *Alta manual* y *Alta desde la Fuente de datos*); decisiones previas en `docs/adr/0001`–`0003` se respetan, no se re-abren.

---

## Problem Statement

El mantenimiento de la app produce clases de bug recurrentes que el código actual hace inevitables:

- La decisión central del Enlace de archivo (hash del archivo contra `lastSavedFileHash`, tres vías: igual / distinto+limpio / distinto+sucio) está copiada cuatro veces dentro del mismo módulo; un fix reciente («pre-chequeo de hash incondicional») aterrizó en una copia y dejó las otras tres.
- El estado de conflicto pendiente vive en un global de módulo cuya UI se registra por efecto de import — el cableado depende del orden de imports y «¿hay conflicto pendiente?» no tiene casa observable.
- La Ficha concentra seis concerns en una sola vista de más de mil líneas: la interface que hay que conocer (~30 atributos `data-*`, 8 exports del repositorio, un global efímero) casi iguala a la implementación, así que sus reglas de dominio (plataforma propia, semántica «undefined borra», mínimo de una jugada) solo son testeables clicando en un DOM.
- Los dos caminos de Alta desde la Fuente de datos construyen el mismo payload dos veces y el moldeado a Juego para render de carátula existe tres veces.
- Las reglas de transición de la Biblioteca (reponer estantería, cerrar Ficha al cambiar de pestaña, qué empuja historial) están re-encodadas en cinco archivos; el flujo «abrir duplicado desde el Alta» es una danza de tres pasos con un cambio de pestaña sin historial, frágil al reordenar.
- Utilidades mínimas (formateo de errores, detección de cancelación, descarga Blob, split por comas) existen en 2–4 copias.

## Solution

Cinco aterrizajes que convierten módulos shallow en deep modules — mucha conducta detrás de una interface pequeña — sin cambiar ningún comportamiento visible:

1. **Enlace de archivo + utilidades comunes**: una función pura de decisión del conflicto, exportada por el módulo; el conflicto pendiente pasa al estado de la app; cableado explícito; deduplicación del handle store y de la lista MIME; utilidades compartidas de errores/descarga/split; borrado de una export muerta.
2. **Pasarela de Alta**: un módulo de mapeo puro en domain que ambos caminos de Alta consumen; flujos y avisos intactos.
3. **Transiciones de la Biblioteca**: un módulo de intents que posee todas las reglas de navegación; el módulo mecánico de backnav queda intacto.
4. **Motor de la Ficha**: interface de comandos con identidad explícita; las reglas de dominio se vuelvan su implementación; el estado efímero de edición pasa a un slice del store fuera del snapshot de historial.
5. *(Re-scoped después)* Estado de vista efímero del resto de vistas como slices del store.

El resultado neto: la costura más ancha (render completo de la app + clics en DOM) deja de ser la única forma de llegar a estas conductas; cada área queda con exactamente una interface explícita por la que testear.

## User Stories

1. As the maintainer, I want the file-conflict hash decision to exist in one place, so that a fix lands in restore, save-now, reconnect and external-check at once.
2. As the maintainer, I want the pending conflict to be part of the app state, so that «¿hay conflicto pendiente?» has one observable answer instead of a module global.
3. As the maintainer, I want the conflict dialog to render from state, so that its behavior is verifiable without staging a live conflict through the DOM.
4. As the maintainer, I want the conflict handler registered explicitly at startup, so that wiring no longer depends on module import order.
5. As the maintainer, I want the default file-handle store defined once, so that a change to handle persistence applies to both init and reset.
6. As the maintainer, I want one home for the picker accept list, so that the Android-11-compatible MIME list cannot drift between picker paths.
7. As the maintainer, I want error-message formatting in one shared module, so that views stop copying it a fourth time.
8. As the maintainer, I want abort detection shared, so that cancellation behaves identically across the file link, the data dialog and the tab lock.
9. As the maintainer, I want one Blob-download helper, so that local conflict copies and data exports stay consistent.
10. As the maintainer, I want the unused per-doc write export removed, so that the persistence interface states only what callers need.
11. As the maintainer, I want the Alta payload mapping shared by both source-data add paths, so that a shared-data field change is made once.
12. As the maintainer, I want one Game-shaped cast for rendering source-game covers, so that it exists once instead of three times.
13. As the maintainer, I want the duplicate-open flow owned by a navigation intent, so that its ordering cannot rot silently as the add sheet evolves.
14. As the maintainer, I want comma-list parsing shared, so that tag input and screenshot-URL input cannot diverge in trimming.
15. As an implementation agent, I want the Biblioteca transition rules behind one intents interface, so that I can change navigation behavior without touching five view files.
16. As an implementation agent, I want a command interface for the Ficha, so that I can test own-platform, date-erasure and confirm rules without a DOM.
17. As an implementation agent, I want the Ficha's ephemeral edit state outside the history snapshot, so that going back never resurrects an open form or a delete confirmation.
18. As an implementation agent, I want the pure decision function unit-testable without fake file handles, so that conflict tests are cheap and fast.
19. As an implementation agent, I want the lightbox as a self-contained UI primitive, so that zoom behavior is testable independently of the Ficha view.
20. As an implementation agent, I want colocated tests for the Alta mapping like its domain peers, so that I find and run them without searching.
21. As the app's single user, I want this refactor to change nothing I can see, so that my library, autosave, conflicts and offline behavior keep working exactly as pinned.
22. As the app's single user on mobile, I want closing the Ficha to behave identically from the back button and the «← Volver» pill, so that history never desyncs from the screen.
23. As the app's single user, I want opening a duplicate from the add sheet to push history once, so that the back button returns where I came from.
24. As the app's single user offline, I want the Novedades add path to stay 100 % local, so that I can add a wanted game with no network.
25. As a future contributor, I want the three-way hash decision table-tested, so that the conflict contract is documented by tests, not tribal memory.
26. As a future contributor, I want ADRs for conflict-in-store, navigation intents and the Ficha command interface, so that future architecture reviews don't re-suggest the rejected alternatives.
27. As a future contributor, I want «Alta manual» and «Alta desde la Fuente de datos» in the glossary, so that specs and reviews name the two add paths identically.
28. As the maintainer, I want Ficha commands to take explicit game and play identity, so that identity resolution happens once instead of twice (view + repository).
29. As the maintainer, I want tags add/remove to go through the Ficha engine, so that no call site needs to know the undefined-erases write semantics.
30. As the maintainer, I want the add-play command to own platform inheritance, so that «nace Jugando con plataforma heredada» is one rule in one place.

## Implementation Decisions

- **Landing order**: Enlace de archivo + utilidades comunes, después pasarela de Alta, después intents de navegación, después motor de la Ficha. El candidato «slices de estado de vista» queda explícitamente fuera y se re-escopea al final con el patrón ya pilotado.
- **Decisión de conflicto**: el módulo del Enlace de archivo gana una función pura exportada. Entrada: texto del archivo, su hash y la meta persistida. Salida: uno de tres resultados — *igual*; *recarga* (lleva texto y hash del archivo); *conflicto* (lleva lo mismo). Los cuatro callers conservan su lectura, su manejo de errores y su mapeo a resultados del enlace; la función no hace I/O ni toca el store. Es una costura interna del módulo hecha testeable al ser parte de su interface.
- **Conflicto en el estado**: el conflicto pendiente (texto, hash y doc del archivo) pasa al slice de estado del enlace de archivo. Elevar un conflicto escribe el slice completo. Regla documentada: los guards existentes (omitir vuelco y chequeo externo mientras hay conflicto) son lo que mantiene vivo ese campo; ninguna otra ruta escribe el slice durante un conflicto. → **ADR-0004**.
- **Cableado explícito**: el handler de conflicto se registra en el arranque de la app; el módulo de la pastilla de archivo deja de registrarlo al importarse.
- **Handle store**: el literal por defecto (duplicado en init y reset) colapsa a una sola factory usada por ambos.
- **Lista MIME**: una única fuente en el servicio FSA; el input de reserva del enlace de archivo la deriva.
- **Utilidades comunes**: formateo de mensajes de error (4 copias) y detección de AbortError (2 copias + variantes inline) a un módulo lib; descarga de texto Blob (2 copias) a otro; split de listas por comas (2 copias idénticas) a un helper lib. La export de escritura de doc sin callers se borra (deletion test).
- **Pasarela de Alta**: módulo puro en domain con dos funciones: mapear un juego de la Fuente de datos (+ Estado inicial y etiquetas en bruto) al input de alta del repositorio, preservando solo los datos compartidos presentes; y el moldeado a Juego para render de carátula. Lo consumen la ruta de previsualización del formulario de Alta y el «➕ Quiero jugarlo» de Novedades. Los flujos, la previsualización y las dos UX de duplicados quedan intactos (spec §4.5, §8.6).
- **Intents de navegación**: módulo nuevo que posee todas las transiciones de la Biblioteca y su acoplamiento al historial: cambiar de pestaña (dos reglas: volver a Biblioteca repone estantería; cualquier cambio cierra la Ficha), abrir Panel, volver a Estantería, abrir Ficha en la misma pestaña (push de gameId), abrir Ficha cambiando de pestaña (push único con pestaña+gameId, patrón del Top5 de estadísticas), cerrar Ficha (siempre navigate-back, que degrada a set con profundidad 0), y el reposición tras borrar juego (replace a estantería). El módulo de backnav queda mecánico, sin cambios de interface. → **ADR-0005**.
- **Danza del duplicado**: el flujo «abrir ficha existente» del formulario de Alta queda como cerrar hoja + intent de abrir-Ficha-cambiando-de-pestaña; los tres pasos con patch suelto se borran.
- **Motor de la Ficha**: módulo nuevo con interface de comandos — título; campo compartido (los parsers de listas/URLs y la regla «lista vacía → campo ausente» son implementación interna); añadir/quitar etiqueta propia; cambiar Estado (opera sobre la jugada más reciente, §8.5); valorar (héroe y por jugada); añadir jugada (nace Jugando, plataforma heredada de la última); fechas de jugada (cadena vacía borra); plataforma efectiva de jugada (regla propia con id nulo + nombre; selección de lista; borrado); notas; borrar jugada (el mínimo de una lo bloquea vía error del repositorio); borrar juego (la vista encadena el intent de reposición). Identidad explícita por parámetros en todos. Los comandos lanzan el tipo de error de biblioteca; la vista lo pesca y escribe el estado efímero.
- **Relación con el repositorio**: el motor compone la interface existente del repositorio de la Biblioteca; esa interface no cambia (la semántica «undefined borra» sigue siendo el único contrato de escritura, ahora conocido por el motor en vez de por seis call sites).
- **Estado efímero de la Ficha**: slice top-level del store, sembrado por el intent de abrir Ficha, **fuera del snapshot de historial** (que solo lleva pestaña, library y novedades); el guard existente de re-render ante gameId distinto cubre el botón atrás del móvil. → **ADR-0006**.
- **Lightbox**: se extrae como primitiva de UI junto a la hoja (sheet); sin store ni globals ajenos.
- **Nombres**: identificadores y archivos en inglés siguiendo el estilo dominante; los términos del glosario son aceptables como nombre (ficha, alta). «Navegación» no es término del glosario → archivo en inglés.
- **ADRs**: 0004, 0005 y 0006 se escriben al aterrizar cada tanda, no antes. La decisión «función pura vs helper con hooks» no pasa el filtro de ADR (reversible, poco sorprendente) y queda documentada aquí.
- **Verificación por tanda** (AGENTS.md): typecheck, lint y suite completa con el node del entorno.

## Testing Decisions

- **Qué es un buen test aquí**: solo conducta externa a través de la interface del módulo — nada de espiar internos, nada de asertar marcado más allá de texto/atributos visibles para el usuario, y no testear helpers puros por separado cuando la interface los cubre.
- **Función de decisión**: tabla de casos — hash igual / distinto+espejo limpio / distinto+espejo sucio, y la interacción con los guards de conflicto pendiente y de force. Sin fake handles: la función es pura. Prior art: las suites colocadas de domain.
- **Enlace de archivo**: las dos suites existentes (fake handles, handle store inyectado, settle con macrotareas reales) sobreviven; solo cambia de dónde se lee el conflicto pendiente (estado, no global). El mapeo de cada caller a resultados del enlace se sigue probando igual.
- **Pasarela de Alta**: suite colocada como sus pares de domain — campos presentes/ausentes, etiquetas, Estado por defecto, y el moldeado de carátula.
- **Intents de navegación**: suite nueva que recorre las transiciones y su efecto en profundidad de historial usando el patrón de history fake de la suite de backnav (que sigue cubriendo la mecánica intacta).
- **Motor de la Ficha**: suite nueva a través de los comandos — plataforma propia, borrado por undefined, herencia de plataforma al añadir jugada, Estado sobre la jugada más reciente, mínimos y errores como tipo de error de biblioteca. Prior art: la suite colocada del repositorio de la Biblioteca.
- **Suites DOM existentes** (ficha, alta online, novedades ficha, app) permanecen como guardas de comportamiento; ganan cobertura de respaldo, no se reescriben para esta spec.

## Out of Scope

- El candidato «slices de estado de vista» para el resto de vistas (los 9 globals de Novedades, el estado de la hoja de Alta, welcome, el diálogo de datos): se re-escopea tras pilotar el patrón con el slice de la Ficha.
- Unificar las dos UX de duplicados (abrir ficha / crear otro igual en el formulario; «Ya en tu biblioteca» con botón que voltea en Novedades): distintas por spec (§4.5 vs §8.6).
- Cualquier cambio de comportamiento en lo ya fijado: previsualización antes de añadir, debounce 15 s, orden de los chequeos de hash, conflicto a tres opciones con fechas, «elección deliberada ≠ reconexión», reglas de edición inline, mínimo de una jugada, máximo 5 capturas (ya garantizado aguas arriba y por el validador).
- Re-abrir ADR-0001 (Markup), ADR-0002 (Conexión por interface) o ADR-0003 (admisión fail-closed del worker).
- Rutas de URL o deep-links (spec §3: página única, sin rutas).
- Las primitivas de UI de píldoras y chips: pasan el deletion test, se quedan.
- Cualquier funcionalidad nueva de cara al usuario.

## Further Notes

- `CONTEXT.md` ya contiene los dos términos nuevos (*Alta manual*, *Alta desde la Fuente de datos*); esta spec los da por conocidos.
- El informe HTML de la revisión vive en el directorio temporal del sistema y es efímero; el registro duradero de la evidencia son esta spec y las ADR 0004–0006.
- Cuando llegue el re-scope del quinto candidato, empezar por Novedades (la mayor superficie de globals: nueve) y reutilizar el patrón del slice de la Ficha.
- Durabilidad strict/relaxed y escritura atómica del vuelco: sin cambios; la spec §5.1–5.5 manda.
- El glosario queda intencionadamente libre de términos de implementación: los nombres de módulos nuevos (motor de la Ficha, intents, pasarela) no son términos de dominio y no entran en `CONTEXT.md`.
