# La interface del Enlace de archivo declara sus resultados por operación

Contexto: la interface del Enlace de archivo casi igualaba a su implementation — trece exports y una unión `LinkResult` de trece estados compartida por todas las operaciones (`pickAndConnect`, `reconnect`, `saveNow`, `resolveConflict`), que cinco módulos llamadores mapeaban a mano manejando casos imposibles para su operación; `restoreSavedLink` ni siquiera usaba `LinkResult` (tipo propio con `needs-gesture`), y `scheduleAutosave`/`stopAutosave` se exportaban sin tener callers en src. Decisión: cada operación declara su propia unión de resultados — `pickAndConnect`: `connected|imported|cancelled|error`; `reconnect`: `connected|conflict|denied|skipped|cancelled|error|imported`; `saveNow`: `saved|reloaded|skipped|busy|conflict|error`; `resolveConflict`: `resolved|downloaded|none|skipped|busy|error`; `restoreSavedLink` conserva su tipo propio (`none|needs-gesture|connected`); `markConnected` sigue devolviendo `Promise<void>`. Los trece estados de la antigua `LinkResult` se reparten entre las uniones: ninguno desaparece. El ciclo de autoguardado deja de ser interface: `scheduleAutosave` y `stopAutosave` se internalizan como implementation y `startAutosave` queda exportado para el composition root. `decideLink` sigue exportado (costura interna testeable de la prior spec), `setHandleStore` sobrevive como seam real (handle store IDB en producción, fake en tests) y `setConflictHandler`/`resetFilelink` no cambian en esta decisión.

## Considered options

- Mantener la `LinkResult` compartida y solo documentar qué estados devuelve cada operación: rechazado porque el compilador seguiría permitiendo (y los llamadores seguirían necesitando) manejar estados imposibles — la interface seguiría igualando a la implementation.
- Cero retornos (fire-and-forget en todas las operaciones): rechazado porque varios llamadores SÍ deciden UI según el resultado (import fallback, conflicto pendiente, cancelación) — esconderlo obligaría a leer el slice para reconstruir lo que la operación ya sabe.
- Repartir también el tipo propio de `restoreSavedLink` en la unión común: rechazado porque `needs-gesture` no es un resultado del Enlace sino del arranque (pide gesto del usuario) y mezclarlo habría ampliado la unión común en vez de estrecharla.

## Consequences

- Ningún llamador maneja estados imposibles: el mapeo por operación queda garantizado por el tipado (los llamadores ya manejaban solo lo posible; ahora el compilador lo sostiene).
- El churn de CSS/UI del ciclo de autoguardado ya no aterriza en la interface del módulo: `scheduleAutosave`/`stopAutosave` son internos y `startAutosave` es su única puerta.
- Las suites con fake handles (`tests/filelink.test.js`, `tests/filelinkRestore.test.js`, `tests/dataDialog.test.js`) sobreviven con asertos ajustados a las uniones; `tests/filelink.decision.test.js` no cambia.
- El comportamiento visible no cambia: pastilla del archivo, reconexión, vuelco, conflicto a tres opciones y descarga de copia quedan intactos.
