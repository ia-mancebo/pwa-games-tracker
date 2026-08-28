# El estado efímero de la Ficha vive en un slice top-level fuera del snapshot de historial

Contexto: el estado de edición de la Ficha — campo compartido en edición, errores inline, confirmaciones de borrado, plataforma propia en curso — vivía en un global del módulo de la vista (`src/views/game.js`) que el render re-siembraba ante un gameId distinto, y el visor de capturas compartía módulo con la vista. Decisión: el estado efímero pasa a un slice top-level `ficha` del estado de la app (tipado `FichaUi`, factory `freshFicha` en `src/app.js`), sembrado por los intents de abrir Ficha (`openGame` y `openGameInTab` de `src/navigation.js`) en la MISMA transición que empuja el historial, y FUERA del snapshot de navegación (que solo lleva tab, library y novedades, `src/backnav.js`): restaurar el historial nunca resucita un formulario abierto ni una confirmación de borrado pendiente. El guard existente de re-render (si `ficha.gameId` no coincide con `library.gameId`, se re-siembra el slice) sigue cubriendo el botón atrás del móvil y los cierres de Ficha. Además, el lightbox se extrae como primitiva de UI (`src/ui/lightbox.js`) sin store, junto a la hoja (`src/ui/sheet.js`).

## Considered options

- Guardar el estado efímero dentro del slice de Biblioteca: rechazado porque viajaría en los snapshots de historial (que solo deben definir pantalla) — el botón atrás del móvil resucitaría formularios y confirmaciones — y porque mezclaría estado de navegación con estado efímero de formularios.
- Mantener el global de módulo y solo mover el lightbox: rechazado porque el estado efímero seguiría sin casa observable y el patrón de slice quedaría sin piloto para el re-scope al resto de vistas (Novedades primero).
- Meter el lightbox en el store: rechazado — es una capa transitoria sin relación con la navegación ni la edición; una primitiva con estado propio de módulo (patrón de la hoja) basta y se testea sin la app.

## Consequences

- Todas las mutaciones efímeras de la Ficha pasan a `store.set({ ficha: … })` y disparan el render de la app; el global `ui` de la vista desaparece.
- Los snapshots de historial no llevan `ficha`: avanzar y volver con el botón del móvil nunca restaura un formulario abierto ni una confirmación de borrado; el guard de re-render de `renderGame` re-siembra el slice al cambiar de juego (mismo comportamiento que antes, ahora observable).
- La suite DOM de la Ficha (`tests/game.test.js`), la del motor (`src/data/ficha.test.js`) y la del lightbox migrada (`tests/lightbox.test.js`) permanecen como guardas de comportamiento; `backnav` y su suite quedan intactos.
- Los formularios ahora leen su estado del slice en cada render: un guardado fallido de campo/título re-renderiza con el error del slice visible y conserva lo tecleado (el repinto restaura el valor del input); antes el error quedaba oculto en el global sin repintar.