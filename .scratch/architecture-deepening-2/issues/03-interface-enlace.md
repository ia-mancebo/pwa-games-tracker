# 03: Uniones por operaciÃ³n en la interface del Enlace de archivo

**Spec:** la de este esfuerzo (architecture-deepening-2). Tanda 3. La interface del enlace casi iguala a su implementation: 13 exports y una uniÃ³n `LinkResult` de 13 estados compartida por todas las operaciones, que cinco mÃ³dulos llamadores mapean a mano manejando casos imposibles.

**What to build:** `src/data/filelink.js` reparte los estados en uniones pequeÃ±as por operaciÃ³n â€” `pickAndConnect`: `connected|imported|cancelled|error`; `reconnect`: `connected|conflict|denied|skipped|cancelled|error|imported`; `saveNow`: `saved|reloaded|skipped|busy|conflict|error`; `resolveConflict`: `resolved|downloaded|none|skipped|busy|error`; `restoreSavedLink` conserva su tipo propio (`none|needs-gesture|connected`); `markConnected` sin cambios. `scheduleAutosave` y `stopAutosave` dejan de ser exports (sin callers en src); el ciclo de autoguardado queda como implementation con `startAutosave` exportado para el boot. `decideLink` sigue exportado (costura interna testeable); `setHandleStore` sobrevive como seam real (adapter IDB en producciÃ³n, fake en tests); `setConflictHandler`/`resetFilelink` no cambian en esta tanda. Los llamadores (`ui/filebar.js`, `views/dataDialog.js`, `ui/reconnectModal.js`, `ui/conflictDialog.js`) actualizan su mapeo mecÃ¡nicamente. Cero cambio de comportamiento. â†’ **ADR-0009**.

**Blocked by:** nada.

**Status:** resolved

- [x] Cada operaciÃ³n del enlace declara su propia uniÃ³n de resultados; ningÃºn llamador maneja estados imposibles para su operaciÃ³n.
- [x] NingÃºn estado de la actual `LinkResult` desaparece: los 13 se reparten entre las uniones (tabla de la spec).
- [x] `scheduleAutosave`/`stopAutosave` ya no son exports; el autoguardado sigue comportÃ¡ndose igual (3 s, foco/visibilidad, recuperaciÃ³n de `saving`).
- [x] `decideLink`, `setHandleStore`, `setConflictHandler` y `resetFilelink` siguen exportados; `restoreSavedLink` conserva `needs-gesture`.
- [x] Las suites con fake handles (`tests/filelink.test.js`, `tests/filelinkRestore.test.js`, `tests/dataDialog.test.js`) sobreviven con sus asertos ajustados a las uniones; `filelink.decision.test.js` no cambia.
- [x] El comportamiento visible no cambia (pastilla del archivo, reconexiÃ³n, vuelco, conflicto a tres opciones, descarga de copia).
- [x] ADR-0009 publicada: uniones por operaciÃ³n vs `LinkResult` compartida vs cero retornos (leer el slice).

## Comments

Tanda 3 aterrizada en 85d5370. ADR-0009 publicada en 8351d6f. Los 13 estados repartidos y probados; los llamadores ya manejaban solo lo posible y ahora el compilador lo sostiene (salvo un cast documentado en resolveConflict, sound).

