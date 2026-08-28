# Los intents de navegación poseen las transiciones de la Biblioteca y su acoplamiento al historial

Contexto: las reglas de transición de la Biblioteca — volver a Biblioteca repone la estantería conservando búsqueda y filtros (ticket 14), cualquier cambio de pestaña cierra la Ficha (ticket 17), qué transiciones empujan/consumen/reemplazan entradas de historial — estaban re-encodadas en cinco archivos (el raíl de `app.js`, `views/library.js`, `views/game.js`, `views/stats.js` y `views/addSheet.js`); el flujo «abrir ficha existente» del Alta era una danza de tres pasos (openGame + patch suelto de pestaña sin historial + push) frágil al reordenar. Decisión: un módulo nuevo `src/navigation.js` exporta un intent por transición — `switchTab`, `openPanel`, `backToShelves`, `openGame`, `openGameInTab`, `closeGame`, `repositionAfterDelete` — el único punto que patchea el slice de Biblioteca para navegar y la única costura con el módulo mecánico `backnav`. El duplicado del Alta queda como cerrar hoja + `openGameInTab` (una sola entrada de historial con pestaña + gameId; el atrás del móvil regresa al origen, patrón del Top 5 de estadísticas). `closeGame` navega siempre hacia atrás: sin profundidad, `backnav` degrada a un set sin operación de historial, así «← Volver» y el botón atrás del sistema se comportan idénticos.

## Considered options

- Crecer `backnav` con las reglas de transición: rechazado porque el módulo mecánico debe quedar tonto — mezclar la mecánica del historial con las reglas de pantalla habría acoplado ambos cambios y roto su suite.
- Crecer `app.js`/`createApp` con las transiciones: rechazado porque concentraría las reglas en la costura más ancha de la app (render completo + clics en DOM), la única forma de llegar a estas conductas antes de los intents.
- Mantener las reglas repartidas en las cinco vistas: rechazado porque un cambio de navegación seguiría exigiendo tocar cinco archivos y la danza del duplicado seguiría frágil.

## Consequences

- Las vistas dejan de patchear a mano el slice de Biblioteca para navegar; cada transición tiene un solo hogar testeable sin DOM.
- `backnav` y su suite quedan intactos: la nueva suite de intents cubre las transiciones y la profundidad de historial con el mismo patrón de history fake.
- El comportamiento visible no cambia (spec §8.1–8.5, página única sin rutas de URL); «Abrir ficha existente» del Alta y el Top 5 empujan una sola entrada.
- El estado efímero de la Ficha sigue siendo local de la vista; su traslado al store (sembrado por el intent de abrir Ficha) queda para ADR-0006.