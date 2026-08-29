# Las pestañas del raíl son pestañas raíz: pulsarlas reinicia la pila de historial

Contexto: el push por cambio de pestaña (comportamiento heredado de los tickets 14/17 recogido en ADR-0005) hacía que el botón atrás del sistema recorriera TODA la traza de navegación entre pestañas: Biblioteca → Estantería → Panel → Ficha → Novedades dejaba cinco entradas y el atrás del móvil las desandaba una a una. Decisión: Biblioteca, Novedades y Estadísticas son pestañas raíz; pulsarlas reinicia la pila — la pestaña pulsada pasa a ser la primera entrada y el atrás del sistema sale de la app en vez de volver a otra pestaña. La mecánica vive en un kind nuevo `'reset'` de `src/backnav.js` (rebobinar a la entrada raíz con `history.go(-depth)` tragándose el popstate resultante y re-escribiendo la raíz con la instantánea vía `replaceState`; con depth 0 solo `replaceState`), pero la REGLA «pestaña = raíz» vive en el intent `switchTab` de `src/navigation.js` (ADR-0005 sigue en pie: backnav sigue siendo el módulo mecánico tonto). La navegación interna de cada pestaña no cambia (Panel, Ficha, secciones/detalle de Novedades conservan sus push/back/replace) y `openGameInTab` (Top 5 de estadísticas y duplicado del Alta) conserva su push único con regreso al origen: es un enlace profundo deliberado, no una pulsación de pestaña.

## Considered options

- Mantener el push por cambio de pestaña: rechazado — es el bug: el atrás del sistema recorre toda la traza previa entre pestañas.
- `replace` de la entrada actual sin rebobinar: rechazado porque las entradas previas siguen en la pila y el atrás del sistema las recorre igualmente; solo se re-escribiría la pantalla visible.
- Meter la regla de pestañas raíz en `backnav`: rechazado porque rompe la separación mecánica/reglas de ADR-0005 — el módulo mecánico debe quedar tonto y la regla de pantalla pertenece al intent `switchTab`.

## Consequences

- El atrás del sistema desde una pestaña raíz sale de la app en lugar de volver a otra pestaña; la traza previa (otras pestañas, Panel, Ficha, secciones de Novedades) se descarta al pulsar una pestaña.
- La navegación interna por pestaña no cambia: `openPanel`, `backToShelves`, `openGame`, `closeGame`, `repositionAfterDelete` y las secciones/detalle de Novedades conservan sus push/back/replace; `openGameInTab` conserva su push único.
- `backnav` amplía su patrón de history fake con el kind `'reset'` (rebobinado con `go(-depth)` y un popstate tragado); la suite cubre el reinicio de pila y que el atrás no restaura las pantallas empujadas.
- Las reglas de los tickets 14/17 se conservan: pulsar Biblioteca repone la estantería conservando búsqueda y filtros, y cualquier cambio de pestaña cierra la Ficha.