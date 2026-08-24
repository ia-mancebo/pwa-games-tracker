# 17 · Ficha completa

**Status:** ready-for-agent
**Blocked by:** 16 · Alta manual

## What to build

Detalle de un Juego con todas sus Jugadas juntas, consultable y editable:

- Portada, píldora de estado, título, valoración por estrellas clicables (+ «quitar»), descripción, plataformas, géneros, etiquetas propias editables inline, fechas, chips de estado y galería de capturas si existe (capturas siempre online).
- Cada **Jugada editable en línea**: fechas (`startedAt`/`finishedAt`), plataforma efectiva (propia permitida → `id: null`) y **notas** (campo definido en el ticket 12).
- **«Añadir jugada»**: nace Jugando, plataforma heredada de la última jugada, valoración vacía; todo editable al crearla.
- Cambiar de Estado opera sobre la jugada más reciente; nunca borra ni crea jugadas por sí solo.
- Reglas de edición de datos compartidos: título y etiquetas propias siempre editables; géneros, plataformas disponibles, carátula, descripción y capturas **solo lectura** si vienen de IGDB (`igdbId` presente), editables si el alta fue manual.
- **Borrado**: de Juego (cascada con sus jugadas) y de Jugada individual respetando el mínimo de una por juego; ambos con confirmación, sin deshacer y sin papelera.

## Acceptance criteria

- [ ] Editar fechas, plataforma efectiva y notas de una jugada persiste tras recargar.
- [ ] Valorar/quitar valoración funciona desde la Ficha en cualquier estado.
- [ ] «Añadir jugada» crea una Jugando que hereda plataforma; el Estado del juego pasa a Jugando.
- [ ] Cambiar de estado modifica la jugada más reciente sin alterar el número de jugadas.
- [ ] Un juego IGDB no permite editar géneros/plataformas/carátula/descripción/capturas; uno manual sí.
- [ ] Borrar la última jugada está bloqueado; borrar juego elimina todo en cascada con confirmación.
