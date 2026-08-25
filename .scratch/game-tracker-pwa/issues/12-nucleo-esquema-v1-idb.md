# 12 Â· NÃºcleo de datos: esquema v1 + espejo IndexedDB

**Status:** resolved
**Blocked by:** 11 Â· Andamio + direcciÃ³n visual + navegaciÃ³n

## What to build

El corazÃ³n del dominio como mÃ³dulos puros + su espejo en IndexedDB, verificable por tests (sin UI todavÃ­a):

- Documento v1 completo (Â§4): raÃ­z (`schema`/`version`/`updatedAt`/`games`), Juego con datos compartidos y Jugada con lo vivido. Incluye el campo **`notes`** opcional (string) en Jugada, decidido al aprobar este desglose (spec Â§8.5 lo usa; la tabla Â§4.3 no lo listaba â€” aditivo, no bumpea versiÃ³n).
- ValidaciÃ³n de entrada: comprueba `schema`, `version` y tipos antes de tocar nada; polÃ­tica forward-only; versiÃ³n mayor a la entendida â†’ rechazo explÃ­cito (Â«actualiza la appÂ»); convenciÃ³n fechas `YYYY-MM-DD`, campo ausente = desconocido.
- Stores IDB `state` (clave doc â†’ documento completo) y `meta`; toda mutaciÃ³n reemplaza `state.doc` atÃ³micamente; durabilidad `relaxed` por defecto y `strict` explÃ­cito para import/migraciÃ³n/vuelco verificado; flag `dirty`.

## Acceptance criteria

- [ ] Crear un documento v1 vÃ¡lido con juego + primera jugada; alta manual viable con solo tÃ­tulo.
- [ ] El validador rechaza documentos malformados y versiones futuras sin modificar nada.
- [ ] Guardar/cargar contra IndexedDB sobrevive a una recarga (verificado en test).
- [ ] Mutaciones atÃ³micas: o queda el documento nuevo completo o el anterior.
- [ ] `meta` expone dirty / updatedAt / hash base; durabilidad `strict` disponible y usada donde toca.
