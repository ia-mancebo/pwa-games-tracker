# El arranque vive en un composition root (`src/boot.js`), no en efectos de import

Contexto: el arranque era conocimiento tribal — diez pasos con restricciones de orden vivían en `main.js`, que ningún test podía ejecutar (no exportaba nada); dos módulos se registraban por efecto de import (`sheet.js` registraba el sheet closer, `conflictDialog.js` se suscribía al store al importarse), así que importar un módulo cambiaba el comportamiento de la app; y los tests desmontaban el estado global componiendo `reset*` a mano. Decisión: `src/boot.js` exporta `start(root)` (los diez pasos: `initLibrary` → `createApp` → registro del conflicto → `initCoverSeeding` → `acquireTabLock`/`onLockReleased` → `initNovedadesRetry` → `restoreSavedLink` + `openReconnectModal` condicional → `startAutosave` → `requestPersistOnce` → `registerSW`) y `resetBoot()` (teardown único que compone los resets de los módulos con estado). `sheet.js` gana `initSheet()` (idempotente) y pierde su registro al importarse; `conflictDialog.js` gana `initConflictDialog()` (idempotente) y pierde su suscripción al importarse; el boot los llama en el orden correcto: sheet closer antes de `createApp` (antes de que exista historial que consumirlo) y handler de conflicto antes de cualquier restore que pueda elevarlo. `main.js` queda en los imports de CSS y la llamada a `start`. No hay `stop()` ni soporte de arranques repetidos.

## Considered options

- Mantener `main.js` tribal y solo comentar las restricciones de orden: rechazado porque seguía sin poder ejecutarse en tests y cada nueva pieza de arranque dependía de la memoria de quien lo tocó antes.
- Ciclo de vida completo con `stop()` y arranques repetidos: rechazado — el coste (desmontar SW, IDB, Web Locks, listeners de cada módulo) no paga su beneficio para una app de una sola página y una sola pestaña viva; `resetBoot()` cubre lo que los tests necesitan.
- Registrar los closers/handlers desde cada módulo con un patrón de suscripción diferida (sin composition root): rechazado porque el orden de registros volvería a depender del orden de imports — el problema que esta decisión elimina.

## Consequences

- Importar cualquier módulo de src no registra nada: los dos efectos de import existentes (`sheet.js`, `conflictDialog.js`) son inits explícitos llamados por el boot.
- Las restricciones de orden del arranque están documentadas por tests (`tests/boot.test.js`, suite de humo con espias): conflicto/suscripción antes de `restoreSavedLink`, sheet closer antes de `createApp`, `startAutosave` al final, `registerSW` fuera del `if (root)`.
- `resetBoot()` es el único seam de desmontaje del arranque; los `reset*` que sobreviven son seams reales que suites de módulo aisladas necesitan (`resetFilelink`, `resetBackNav`, `resetSheet`, `setHandleStore`, entre otros), no cableado de test.
- Sin `stop()`: desmontar y re-arrancar la app completa no es un caso soportado ni en producción ni en tests.
