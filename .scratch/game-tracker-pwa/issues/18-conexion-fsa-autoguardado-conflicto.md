# 18 Â· ConexiÃ³n de archivo (FSA) + autoguardado + conflicto real

**Status:** resolved
**Blocked by:** 13 Â· Bienvenida: Importar / Empezar biblioteca nueva

## What to build

El ciclo completo archivo â†” espejo, diseÃ±ado asumiendo reconexiÃ³n manual en cada sesiÃ³n:

- Pastilla permanente **Â«Archivo no conectado â€” ReconectarÂ»**: reconexiÃ³n en un tap (`requestPermission` sobre el handle guardado en IDB). Feature detection FSA y manejo de `AbortError` siempre.
- Al reconectar se compara hash del archivo con `meta.lastSavedFileHash`: igual â†’ sesiÃ³n normal volcando pendientes; distinto + limpio â†’ recarga limpia; distinto + `dirty` â†’ **conflicto real**.
- **Autoguardado**: debounce 15 s tras el Ãºltimo cambio cuando hay archivo conectado + intento extra al ocultar la pestaÃ±a (mejor esfuerzo). BotÃ³n Â«Guardar ahoraÂ» e indicador Â«cambios sin volcarÂ» siempre visibles.
- Escritura atÃ³mica; solo si terminÃ³ bien se actualiza `meta{hash, dirty:false}` en transacciÃ³n `strict`. Un fallo de escritura no bloquea: pastilla de error + reintento automÃ¡tico al prÃ³ximo cambio o al recuperar foco, estado sigue `dirty`.
- **Conflicto real**: diÃ¡logo a tres opciones (usar versiÃ³n del archivo / mantener locales / descargar copia local), mostrando la `updatedAt` de cada versiÃ³n. JamÃ¡s sobrescribir en silencio. Comprobaciones de hash tambiÃ©n al recuperar foco y justo antes de cada vuelco.
- ElecciÃ³n deliberada â‰  reconexiÃ³n: un archivo elegido explÃ­citamente (bienvenida o Datos) sustituye el espejo tras validar y fija hash base sin lÃ³gica de conflicto.

## Acceptance criteria

- [ ] Reconectar un archivo sin cambios externos retoma la sesiÃ³n normal (volcando pendientes si los hay).
- [ ] Archivo cambiado fuera + estado limpio â†’ recarga limpia sin diÃ¡logos.
- [ ] Archivo cambiado fuera + cambios sin volcar â†’ conflicto con las 3 opciones y fechas visibles; ninguna parte se pierde silenciosamente.
- [ ] Autoguardado vuela ~15 s tras el Ãºltimo cambio; Â«Guardar ahoraÂ» funciona siempre visible.
- [ ] Simular fallo de escritura no bloquea la app ni pierde datos (`dirty` persiste, hay reintento).
