# 12 · Núcleo de datos: esquema v1 + espejo IndexedDB

**Status:** ready-for-agent
**Blocked by:** 11 · Andamio + dirección visual + navegación

## What to build

El corazón del dominio como módulos puros + su espejo en IndexedDB, verificable por tests (sin UI todavía):

- Documento v1 completo (§4): raíz (`schema`/`version`/`updatedAt`/`games`), Juego con datos compartidos y Jugada con lo vivido. Incluye el campo **`notes`** opcional (string) en Jugada, decidido al aprobar este desglose (spec §8.5 lo usa; la tabla §4.3 no lo listaba — aditivo, no bumpea versión).
- Validación de entrada: comprueba `schema`, `version` y tipos antes de tocar nada; política forward-only; versión mayor a la entendida → rechazo explícito («actualiza la app»); convención fechas `YYYY-MM-DD`, campo ausente = desconocido.
- Stores IDB `state` (clave doc → documento completo) y `meta`; toda mutación reemplaza `state.doc` atómicamente; durabilidad `relaxed` por defecto y `strict` explícito para import/migración/vuelco verificado; flag `dirty`.

## Acceptance criteria

- [ ] Crear un documento v1 válido con juego + primera jugada; alta manual viable con solo título.
- [ ] El validador rechaza documentos malformados y versiones futuras sin modificar nada.
- [ ] Guardar/cargar contra IndexedDB sobrevive a una recarga (verificado en test).
- [ ] Mutaciones atómicas: o queda el documento nuevo completo o el anterior.
- [ ] `meta` expone dirty / updatedAt / hash base; durabilidad `strict` disponible y usada donde toca.
