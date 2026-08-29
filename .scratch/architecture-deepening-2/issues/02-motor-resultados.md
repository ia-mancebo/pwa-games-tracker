# 02: La interface del motor de la Ficha devuelve resultados

**Spec:** la de este esfuerzo (architecture-deepening-2). Tanda 2. El motor ya es deep, pero su interface deja reglas en la vista (Â«hoyÂ», la Jugada mÃ¡s reciente, la validaciÃ³n de Estado, el tÃ­tulo) y dos modos de error conviven con el bloque de restauraciÃ³n duplicado Ã—2 y el patrÃ³n `patchFicha` de error Ã—4.

**What to build:** toda la interface de `src/data/ficha.js` devuelve `Promise<Result>` (`{ok:true} | {ok:false, error: LibraryError}`): `commitTitle(gameId, rawText)` absorbe trim/obligatoriedad, `commitSharedField(gameId, name, rawText)` reemplaza a `setSharedField`, `rateHero(gameId, rating)` apunta a la Jugada mÃ¡s reciente dentro del motor, `setStatus(gameId, status, now?)` valida el Estado antes de `mutate`, `addPlay(gameId, now?)` con `now` opcional (por defecto `new Date()`; dos adapters â€” reloj real/reloj de test â€” justifican el seam, sin `setClock` global); `addTag`, `removeTag`, `setPlayDate`, `setPlayPlatform`, `setPlayNotes`, `deletePlay`, `deleteGame` devuelven `Result` con su lÃ³gica intacta. El motor sigue puro (escribe el repositorio, no el store). En la vista: UN helper interno que ejecuta el comando, escribe el error en el slot del slice que corresponda y conserva lo tecleado; `FichaUi` gana `titleError` (slot propio, hermano de `fieldError`/`playError`/`error`); `setInlineError` y su segundo camino de render mueren; los 36 `data-*` y el marcado no cambian. Sin ADR (decisiÃ³n reversible, documentada en la spec).

**Blocked by:** nada.

**Status:** resolved

- [x] NingÃºn comando del motor lanza `LibraryError` al llamador: todos devuelven `Result`; `library.js` no cambia.
- [x] La vista ya no calcula `todayFrom(new Date())`, `latestPlay(game).id` ni `STATUSES.includes`: las reglas viven en el motor (`now` opcional, `rateHero`, validaciÃ³n previa a `mutate`).
- [x] El tÃ­tulo se valida en el motor (`commitTitle`); su error vive en el slice (`ficha.titleError`), no en un parche directo al DOM; `setInlineError` desaparece.
- [x] Un solo helper de commit en la vista: el bloque Â«restaurar lo tecleado + error al sliceÂ» existe una vez, no Ã—2; `patchFicha` de error deja de repetirse Ã—4.
- [x] `ficha.test.js` migrado a `Result` y con casos nuevos (validaciÃ³n de Estado, `rateHero`, Â«hoyÂ» inyectado, trim/obligatoriedad del tÃ­tulo); suite DOM `tests/game.test.js` intacta como guarda.
- [x] El comportamiento visible no cambia (formularios, errores inline, mÃ­nimo de una jugada, herencia de plataforma).

## Comments

Tanda 2 aterrizada en c4b48ab (+ guards de latestPlay en 38645bf). Sin ADR (decisión reversible, documentada en la spec). Suite del motor 27 asertos en Result + guardas DOM intactas.

