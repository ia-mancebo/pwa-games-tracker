# 06: Motor de la Ficha: interface de comandos

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 4, paso 1 de 2. Es el ticket que más lee: la vista de la Ficha y su suite DOM.

**What to build:** las mutaciones de la Ficha detrás de una interface de comandos con identidad explícita (gameId, playId por parámetros): guardar título; guardar campo compartido (los parsers de listas/URLs y la regla «lista vacía → campo ausente» son implementación interna suya); añadir y quitar etiqueta propia; cambiar Estado (opera sobre la jugada más reciente, nunca borra ni crea jugadas); valorar (héroe y por jugada, con «quitar»); añadir jugada (nace Jugando con plataforma heredada de la última); fechas de jugada (cadena vacía borra); plataforma efectiva de jugada (regla propia con id nulo + nombre, selección de lista, borrado); notas; borrar jugada (el mínimo de una lo bloquea vía error del repositorio); borrar juego (la vista encadena el intent de reposición del ticket 05). Los comandos lanzan el error de biblioteca y la vista lo pesca en su estado efímero. La vista conserva su marcado, su render y su cableado `data-*` (ADR-0001 intacta); la interface del repositorio de la Biblioteca no cambia — la semántica «undefined borra» pasa a ser conocida por el motor en vez de por seis call sites.

**Blocked by:** 05 — Intents de las Transiciones de la Biblioteca (usa el intent de reposición y serializa la edición de la vista de la Ficha).

**Status:** ready-for-agent

- [ ] Los comandos existen con identidad explícita; la vista deja de conocer la semántica «undefined borra», la regla de plataforma propia y la herencia de plataforma.
- [ ] Cambiar de Estado opera sobre la jugada más reciente y nunca borra ni crea jugadas (spec §8.5).
- [ ] Añadir jugada nace Jugando con plataforma heredada de la última; fechas, notas, plataforma efectiva (propia con id nulo) y valoración editables en línea.
- [ ] Borrar la última jugada está bloqueado y el error llega a la vista; borrar juego respeta el mínimo de una jugada y encadena la reposición a estantería.
- [ ] Las reglas de edición por origen se respetan: datos de IGDB solo lectura; alta manual editable (spec §8.5).
- [ ] Suite nueva de comandos sin DOM (plataforma propia, borrado por undefined, herencia, Estado sobre la más reciente, errores como error de biblioteca).
- [ ] La suite DOM de la Ficha sigue en verde como guarda de comportamiento.
- [ ] typecheck, lint y suite completa en verde; ADR-0001 sin cambios.
