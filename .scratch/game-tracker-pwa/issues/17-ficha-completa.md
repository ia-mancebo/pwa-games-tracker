# 17 Â· Ficha completa

**Status:** resolved
**Blocked by:** 16 Â· Alta manual

## What to build

Detalle de un Juego con todas sus Jugadas juntas, consultable y editable:

- Portada, pÃ­ldora de estado, tÃ­tulo, valoraciÃ³n por estrellas clicables (+ Â«quitarÂ»), descripciÃ³n, plataformas, gÃ©neros, etiquetas propias editables inline, fechas, chips de estado y galerÃ­a de capturas si existe (capturas siempre online).
- Cada **Jugada editable en lÃ­nea**: fechas (`startedAt`/`finishedAt`), plataforma efectiva (propia permitida â†’ `id: null`) y **notas** (campo definido en el ticket 12).
- **Â«AÃ±adir jugadaÂ»**: nace Jugando, plataforma heredada de la Ãºltima jugada, valoraciÃ³n vacÃ­a; todo editable al crearla.
- Cambiar de Estado opera sobre la jugada mÃ¡s reciente; nunca borra ni crea jugadas por sÃ­ solo.
- Reglas de ediciÃ³n de datos compartidos: tÃ­tulo y etiquetas propias siempre editables; gÃ©neros, plataformas disponibles, carÃ¡tula, descripciÃ³n y capturas **solo lectura** si vienen de IGDB (`igdbId` presente), editables si el alta fue manual.
- **Borrado**: de Juego (cascada con sus jugadas) y de Jugada individual respetando el mÃ­nimo de una por juego; ambos con confirmaciÃ³n, sin deshacer y sin papelera.

## Acceptance criteria

- [ ] Editar fechas, plataforma efectiva y notas de una jugada persiste tras recargar.
- [ ] Valorar/quitar valoraciÃ³n funciona desde la Ficha en cualquier estado.
- [ ] Â«AÃ±adir jugadaÂ» crea una Jugando que hereda plataforma; el Estado del juego pasa a Jugando.
- [ ] Cambiar de estado modifica la jugada mÃ¡s reciente sin alterar el nÃºmero de jugadas.
- [ ] Un juego IGDB no permite editar gÃ©neros/plataformas/carÃ¡tula/descripciÃ³n/capturas; uno manual sÃ­.
- [ ] Borrar la Ãºltima jugada estÃ¡ bloqueado; borrar juego elimina todo en cascada con confirmaciÃ³n.
