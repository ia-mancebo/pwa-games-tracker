# 18 · Conexión de archivo (FSA) + autoguardado + conflicto real

**Status:** ready-for-agent
**Blocked by:** 13 · Bienvenida: Importar / Empezar biblioteca nueva

## What to build

El ciclo completo archivo ↔ espejo, diseñado asumiendo reconexión manual en cada sesión:

- Pastilla permanente **«Archivo no conectado — Reconectar»**: reconexión en un tap (`requestPermission` sobre el handle guardado en IDB). Feature detection FSA y manejo de `AbortError` siempre.
- Al reconectar se compara hash del archivo con `meta.lastSavedFileHash`: igual → sesión normal volcando pendientes; distinto + limpio → recarga limpia; distinto + `dirty` → **conflicto real**.
- **Autoguardado**: debounce 15 s tras el último cambio cuando hay archivo conectado + intento extra al ocultar la pestaña (mejor esfuerzo). Botón «Guardar ahora» e indicador «cambios sin volcar» siempre visibles.
- Escritura atómica; solo si terminó bien se actualiza `meta{hash, dirty:false}` en transacción `strict`. Un fallo de escritura no bloquea: pastilla de error + reintento automático al próximo cambio o al recuperar foco, estado sigue `dirty`.
- **Conflicto real**: diálogo a tres opciones (usar versión del archivo / mantener locales / descargar copia local), mostrando la `updatedAt` de cada versión. Jamás sobrescribir en silencio. Comprobaciones de hash también al recuperar foco y justo antes de cada vuelco.
- Elección deliberada ≠ reconexión: un archivo elegido explícitamente (bienvenida o Datos) sustituye el espejo tras validar y fija hash base sin lógica de conflicto.

## Acceptance criteria

- [ ] Reconectar un archivo sin cambios externos retoma la sesión normal (volcando pendientes si los hay).
- [ ] Archivo cambiado fuera + estado limpio → recarga limpia sin diálogos.
- [ ] Archivo cambiado fuera + cambios sin volcar → conflicto con las 3 opciones y fechas visibles; ninguna parte se pierde silenciosamente.
- [ ] Autoguardado vuela ~15 s tras el último cambio; «Guardar ahora» funciona siempre visible.
- [ ] Simular fallo de escritura no bloquea la app ni pierde datos (`dirty` persiste, hay reintento).
