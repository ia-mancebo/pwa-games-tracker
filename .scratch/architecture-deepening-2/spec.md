# Profundización de arquitectura II — Novedades, Motor de la Ficha, Interface del Enlace y Composition Root

**Status:** ready-for-agent
**Fecha:** 29-08-2026
**Origen:** segunda revisión de arquitectura + sesión de grilling (4 candidatos, 16 decisiones asentadas). La primera pasada (28-08-2026, `../architecture-deepening/`) aterrizó cinco candidatos y dejó ADR-0004–0007; esta no reabre ninguna ADR (0001–0007). Vocabulario de dominio en `CONTEXT.md` — esta pasada añadió **Modo degradado** al glosario. Términos de arquitectura: module, interface, implementation, seam, adapter, deep, shallow, leverage, locality.

---

## Problem Statement

El mantenimiento sigue produciendo clases de bug que el código actual hace inevitables:

- **Novedades** guarda su estado en tres sitios: el slice `novedades` (patcheado a mano ×3 por la vista y repuesto por backnav), **9 globals de módulo** en la vista (`snapshotCache`, `snapshotLoaded`, `refreshing`, `lastStatus`, `hostEl`, `loadSeq`, `sheet`, `paintedRef`, `adding`) y la Instantánea en IDB. La forma del slice se re-encodea ×4 (`?? { section, genre, detail }`), el refresco/repinto solo es testeable por DOM (448 líneas de suite con el cableado de render replicado a mano), `resetNovedadesView` existe solo como seam de test, y app.js dispara el refresco automático fuera de toda regla de transición.
- **El motor de la Ficha** quedó deep, pero su interface sigue dejando reglas en la vista: `todayFrom(new Date())` ×2, `latestPlay(game).id` para la valoración héroe, `STATUSES.includes` como guard (el repositorio valida el Estado solo post-hoc, como `BAD_SHAPE` dentro de `mutate`), el trim/obligatoriedad del título en la vista con el error escrito **directo al DOM** (`setInlineError`, un segundo camino de render fuera del slice), el bloque «restaurar lo tecleado + escribir el error» duplicado ×2 y el patrón `patchFicha` de error ×4. El contrato commit/error solo se puede probar clicando DOM (83 `qs` en su suite).
- **La interface del Enlace de archivo casi iguala a su implementation**: 13 exports y una unión `LinkResult` de 13 estados **compartida por todas las operaciones**, que cinco módulos llamadores mapean a mano (manejando casos imposibles para ellos); `restoreSavedLink` ni siquiera usa `LinkResult` (tipo propio con `needs-gesture`); `scheduleAutosave` y `stopAutosave` no tienen callers en src (exports de test). Un fix de CSS (header sticky) aterrizó 121 líneas en este módulo porque el ciclo de autoguardado vive expuesto junto a la decisión pura.
- **El arranque es conocimiento tribal**: diez pasos con restricciones de orden viven en `main.js`, que ningún test puede ejecutar (no exporta nada, nadie lo importa); dos registros por efecto de import (`sheet.js:210` registra el sheet closer, `conflictDialog.js:144` se suscribe al store al importarse); **17 exports `reset*`** existen solo porque los tests no tienen otra forma de desmontar estado global.

## Solution

Cuatro tandas que convierten módulos shallow en deep modules — mucha conducta detrás de una interface pequeña — sin ningún cambio de comportamiento visible. Orden: **1 → 2 → 3 → 4** (el composition root va al final para tragarse el cableado en su forma definitiva y no tocar el arranque dos veces).

1. **Novedades (tanda 1)**: dos slices (`novedades` de navegación, intacto; `novedadesUi` de sesión, fuera del snapshot de historial), intents de Novedades en `src/navigation.js`, trigger del refresco dentro del intent `switchTab`; los globals quedan como implementation o mueren. → **ADR-0008**.
2. **Motor de la Ficha (tanda 2)**: toda la interface del motor devuelve resultados `{ok:true} | {ok:false, error}`; el motor absorbe «hoy», la Jugada más reciente, la validación de Estado y el contrato del título; la vista queda con UN helper de escritura del slice. Sin ADR (decisión reversible, no contradice ninguna).
3. **Interface del Enlace (tanda 3)**: uniones pequeñas por operación; `restoreSavedLink` conserva su tipo propio; el ciclo de autoguardado sale de la interface. → **ADR-0009**.
4. **Composition root (tanda 4)**: `src/boot.js` con `start(root)` y un teardown único; los módulos dejan de auto-registrarse al importarse; suite de humo del orden de arranque. → **ADR-0010**.

## User Stories

1. As the maintainer, I want el estado de Novedades observable en un sitio, so that los bugs de refresco/repinto concentran en un módulo (locality) en vez de repartirse entre slice, globals e IDB.
2. As the maintainer, I want intents de Novedades testeables sin DOM, fetch ni IDB, so that una transición nueva no exija replicar el cableado de render en la suite.
3. As the maintainer, I want la regla «entrar en Novedades refresca» viviendo con las demás reglas de transición, so that app.js deje de saber de refrescos.
4. As the app's single user, I want el tablón, el drill-down, el género, la Ficha externa, el Modo degradado y el alta offline igual que hoy, so that la refactorización no cambie nada que pueda ver.
5. As the maintainer, I want «hoy», la Jugada más reciente y la validación de Estado dentro del motor, so that la vista deje de re-encodar reglas del motor en cada call site.
6. As the maintainer, I want un solo modo de error en la interface del motor, so that la vista no mantenga dos contratos (throw y resultado) en el mismo módulo.
7. As the maintainer, I want el error del título en el slice, so que exista un solo camino de render (adiós `setInlineError`).
8. As an implementation agent, I want la suite del motor cubriendo los contratos sin DOM, so that un cambio de reglas no exija clicar una Ficha.
9. As the maintainer, I want cada operación del Enlace declarando sus propios resultados, so that ningún llamador vuelva a manejar estados imposibles.
10. As the maintainer, I want el ciclo de autoguardado fuera de la interface del enlace, so que el churn de CSS deje de aterrizar en el módulo del enlace.
11. As the maintainer, I want arrancar la app por una seam (`start`) y desmontarla por otra (`resetBoot`), so que los tests no necesiten 17 `reset*` repartidos.
12. As the maintainer, I want las restricciones de orden del arranque documentadas por tests, so that «el handler de conflicto va antes de cualquier restore» deje ser memoria tribal.
13. As a future contributor, I want cero registros por efecto de import, so que importar un módulo nunca cambie el comportamiento de la app.
14. As a future contributor, I want ADR-0008/0009/0010, so that futuras revisiones no re-sugieran lo rechazado aquí.
15. As an implementation agent, I want tandas independientes salvo la última, so que poder aterrizar y verificar de una en una.

## Implementation Decisions

- **Landing order**: Novedades, motor de la Ficha, interface del Enlace, composition root. Tandas 1–3 independientes entre sí; la 4 depende de las tres.
- **Novedades — slices**: `novedades` queda exactamente como está (`{section, genre, detail}`; viaja en los snapshots de backnav, que no cambian). Slice nuevo `novedadesUi` en `src/app.js` (tipado `NovedadesUi`, factory `freshNovedadesUi`, patrón `FichaUi`/ADR-0006): `{ snapshot: Instantánea|null, loading: boolean, refreshing: boolean, degraded: string|null, adding: boolean }` — **fuera del snapshot de historial**: backnav sigue copiando solo `tab`, `library` y `novedades` (así ningún push de historial clona la Instantánea y un restore antiguo no la aplasta). El handle de la hoja y `paintedRef` quedan como internos de primitiva de UI (patrón lightbox), no como estado observable.
- **Novedades — intents** (en `src/navigation.js`, la única casa que patchea slices de navegación): `openNovedadesSection` (push), `backToNovedadesBoard` (back), `toggleNovedadesGenre` (sin historial, como los filtros de Biblioteca), `openNovedadesDetail` (sin historial, como hoy) y `closeNovedadesDetail` (sin historial). El intent `switchTab` gana el trigger del refresco: al entrar en Novedades desde otra pestaña, `void autoRefreshIfNeeded().catch(() => {})` fire-and-forget (la política >12 h y con conexión sigue en `data/novedades.js`). Semántica de historial congelada al milímetro, **incluida la supervivencia de la Ficha externa entre pestañas** (hoy el `reset` no cierra hojas; si algún día es un bug, cambio propio con su spec).
- **Novedades — ciclo de la Instantánea**: `src/data/novedades.js` gana `ensureNovedadesContent` (idempotente, guarda interna del módulo): siembra `novedadesUi.loading`, carga la Instantánea desde IDB, escribe el slice y apaga `loading`. El refresco (`refreshNovedades` / `autoRefreshIfNeeded`) pasa a escribir `refreshing` y `degraded` en el slice. La vista llama `ensureNovedadesContent` desde su render (idempotente, sin guards manuales) y pinta **puramente del estado**; la apertura de la hoja de detalle sigue saliendo de `syncDetail` (guard `paintedRef`) invocado por el render. Como toda escritura pasa por el store, `hostEl`, `loadSeq` y la guardia de superficie de `repaint` **se borran como clase**: un repinto tardío ya no puede aplastar otra pestaña porque el render solo pinta la pestaña viva.
- **Novedades — alta local**: el «➕ Quiero jugarlo» queda como lógica de la vista con la pasarela de Alta (`mapSourceToAddInput` + `addGame`); su guarda de re-entrada pasa al slice (`novedadesUi.adding`). Las dos UX de duplicados siguen deliberadamente distintas (fuera de alcance desde la spec anterior).
- **Novedades — tests**: la suite DOM actual (`tests/novedades.test.js`, `tests/novedadesFicha.test.js`) permanece como guarda de comportamiento, ajustando su reset (adiós `resetNovedadesView`: el estado se repone escribiendo los slices). Suite nueva de intents con el patrón history fake de `navigation.test.js`/`backnav.test.js`: transiciones, profundidad de historial y que la Instantánea no viaja en snapshots. La interacción refresco/repinto se testea a través del slice, sin DOM. → **ADR-0008 al aterrizar** (slices + intents vs globals vs un solo slice extendido).
- **Motor de la Ficha — resultados**: toda la interface de `src/data/ficha.js` pasa a devolver `Promise<Result>` con `Result = { ok: true } | { ok: false, error: LibraryError }` (nadie consume hoy el `Doc` devuelto — verificado). La familia commit gana lógica: `commitTitle(gameId, rawText)` absorbe trim/obligatoriedad (el motor ya re-trimea; la regla deja de vivir en la vista); `commitSharedField(gameId, name, rawText)` reemplaza a `setSharedField` (los parsers ya eran internos); `rateHero(gameId, rating)` apunta a la Jugada más reciente dentro del motor (la vista deja de derivar `latestPlay`); `setStatus(gameId, status, now?)` valida el Estado **antes** de llegar a `mutate` (la regla deja de ser post-hoc `BAD_SHAPE`); `addPlay(gameId, now?)`. `now` es parámetro opcional que por defecto es `new Date()` — dos adapters reales (reloj real / reloj de test) justifican el seam; sin `setClock` global. `addTag`, `removeTag`, `setPlayDate`, `setPlayPlatform`, `setPlayNotes`, `deletePlay`, `deleteGame` devuelven `Result` con su lógica intacta. El motor **sigue puro** (sin store): escribe el repositorio, no el estado de la app.
- **Motor de la Ficha — vista**: `src/views/game.js` queda con UN helper interno que ejecuta un comando y, si falla, escribe el error en el slot del slice que corresponde y conserva lo tecleado (el bloque restaurar ×2 y el patrón `patchFicha` error ×4 colapsan en él). El error del título pasa al slice: `FichaUi` gana `titleError: string|null` (slot propio, hermano de `fieldError`/`playError`/`error`; refina la idea de reusar `field: 'title'` para no mezclar el slot de error con el flag de formulario abierto). `setInlineError` y su segundo camino de render mueren. Los 36 `data-*` y el marcado no cambian: `wire` se adelgaza a traducción DOM→comando.
- **Motor de la Ficha — tests**: la suite colocada (`src/data/ficha.test.js`) migra sus ~10 asertos de `rejects` a `resolves.toMatchObject({ ok: false, error: { code: ... } })`; gana casos nuevos: validación de Estado, `rateHero` sobre la Jugada más reciente, «hoy» inyectado, trim/obligatoriedad del título. La suite DOM (`tests/game.test.js`) permanece como guarda. → Sin ADR: decisión reversible, documentada aquí.
- **Enlace — uniones por operación** (ningún estado desaparece: se reparten; verificado contra el código):

  | Operación | Unión |
  |---|---|
  | `pickAndConnect` | `connected \| imported \| cancelled \| error` |
  | `reconnect` | `connected \| conflict \| denied \| skipped \| cancelled \| error \| imported` |
  | `saveNow` | `saved \| reloaded \| skipped \| busy \| conflict \| error` |
  | `resolveConflict` | `resolved \| downloaded \| none \| skipped \| busy \| error` |
  | `restoreSavedLink` | tipo propio ya existente: `none \| needs-gesture \| connected` |
  | `markConnected` | sin cambios (`Promise<void>`) |

- **Enlace — internalización**: `scheduleAutosave` y `stopAutosave` dejan de ser exports (no tienen callers en src); el ciclo de autoguardado (`startAutosave` sigue exportado para el boot) queda como implementation. `decideLink` sigue exportado: es la costura interna hecha testeable (prior spec). `setHandleStore` sobrevive como seam real — dos adapters (handle store IDB en producción, fake en tests) — y `setConflictHandler`/`resetFilelink` no cambian en esta tanda (los traga la tanda 4). Los llamadores (`ui/filebar.js`, `views/dataDialog.js`, `ui/reconnectModal.js`, `ui/conflictDialog.js`) actualizan su mapeo mecánicamente y dejan de manejar casos imposibles. Cero cambio de comportamiento. → **ADR-0009 al aterrizar** (slice `file` como fuente de verdad + uniones por operación vs `LinkResult` compartida vs cero retornos).
- **Composition root**: `src/boot.js` exporta `start(root)` (los diez pasos de `main.js`: `initLibrary` → `createApp` → registro del conflicto → `initCoverSeeding` → `acquireTabLock`/`onLockReleased` → `initNovedadesRetry` → `restoreSavedLink` + `openReconnectModal` condicional → `startAutosave` → `requestPersistOnce` → `registerSW`) y `resetBoot()` (teardown único para tests, compone los resets de los módulos con estado). `sheet.js` pierde su `registerSheetCloser` al importarse y gana un init explícito; `conflictDialog.js` pierde su `store.subscribe` al importarse y gana `initConflictDialog()`; ambos los llama el boot en el orden correcto (closer registrado antes de que exista historial que consumirlo; handler de conflicto antes de cualquier restore que pueda elevarlo). `main.js` queda en la llamada a `start`. Los `reset*` que solo existían para el cableado de test mueren (`resetNovedadesView` ya murió en la tanda 1); los que suites de módulo aisladas necesitan como seams reales (`resetFilelink`, `resetBackNav`, `resetSheet`, `setHandleStore`) siguen exportados. Sin `stop()` ni soporte de arranques repetidos: el coste (SW, IDB, Web Locks, listeners) no paga su benefit.
- **Composition root — tests**: `tests/boot.test.js`, suite de humo pequeña (5–8 asertos de orden con espias y los fakes existentes: conflict-handler/subscription antes de `restoreSavedLink`, sheet closer registrado antes de `createApp`, `startAutosave` al final, `registerSW` fuera del `if (root)` como hoy). → **ADR-0010 al aterrizar** (composition root vs mantener main.js tribal vs ciclo de vida completo).

## Testing Decisions

- **Qué es un buen test aquí**: solo conducta externa a través de la interface del módulo — nada de espiar internos, nada de asertar marcado más allá de texto/atributos visibles para el usuario. Doctrina idéntica a la spec anterior.
- **Novedades**: suite de intents (history fake) para transiciones y profundidad; suite del módulo de datos para `ensureNovedadesContent`/refresco/`degraded` sin DOM; suites DOM actuales quedan como guardas.
- **Motor**: suite colocada migra a `Result` y gana los casos nuevos; suite DOM como guarda.
- **Enlace**: las tres suites con fake handles sobreviven con sus asertos ajustados a las uniones; la suite de decisión (`filelink.decision.test.js`) no cambia.
- **Boot**: suite de humo de orden; nada de tests de render en ella (los ya existen por vista).
- **Verificación por tanda** (AGENTS.md): `npm run typecheck`, `npm run lint`, `npm test` con el node del entorno antes de dar cada tanda por aterrizada.

## Out of Scope

- Unificar las dos UX de duplicados (fuera de alcance desde la spec anterior; siguen deliberadamente distintas).
- El candidato 5 de la revisión (colapsar las delegaciones de una línea `ficha.js` ↔ `library.js` y el vocabulario de escritura): Speculative, no grilled a fondo; solo merece la pena tras aterrizar la tanda 2.
- Los 36 atributos `data-*` de la Ficha y su marcado: la traducción DOM→comando se adelgaza, el contrato de marcado no cambia.
- Rutas de URL / deep-links (spec v1 §3: página única).
- Re-abrir ADR-0001 (Markup), ADR-0002 (Conexión por interface), ADR-0003 (admisión fail-closed), ADR-0004 (conflicto en el slice), ADR-0005 (intents de Biblioteca), ADR-0006 (slice de Ficha), ADR-0007 (pestañas raíz).
- `stop()` completo y arranques repetidos de la app en tests.
- La supervivencia de la Ficha externa de Novedades entre pestañas: congelada (comportamiento actual); si algún día es un bug, cambio propio con su spec.
- Cualquier funcionalidad nueva de cara al usuario.

## Further Notes

- **Modo degradado** ya está en `CONTEXT.md` (añadido en la sesión de grilling); el glosario sigue libre de términos de implementación: `novedadesUi`, `boot`, `commit*` y las uniones no son términos de dominio.
- El orden de tandas no es estético: la tanda 4 cambia quién llama a `startAutosave` y a los registros de conflicto/hoja; encoger antes la interface del enlace (tanda 3) evita que el boot absorba una forma que luego muera.
- El informe HTML de la revisión vive en el directorio temporal del sistema y es efímero; el registro duradero de la evidencia son esta spec y las ADR-0008–0010.
- Evidencia puntual usada en las decisiones (verificada en HEAD `214d176`): backnav copia los slices por referencia en cada push (todo campo nuevo del slice `novedades` viajaría al historial); `setGameStatus` no valida el Estado (la validación real es `validateDoc` post-hoc en `mutate`); nadie consume el `Doc` devuelto por los comandos del motor; `scheduleAutosave`/`stopAutosave` no tienen callers en src.
