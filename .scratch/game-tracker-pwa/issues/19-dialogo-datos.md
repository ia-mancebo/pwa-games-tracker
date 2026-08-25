# 19 Â· DiÃ¡logo Â«DatosÂ»

**Status:** resolved
**Blocked by:** 18 Â· ConexiÃ³n de archivo (FSA) + autoguardado + conflicto real

## What to build

DiÃ¡logo Ãºnico **Â«DatosÂ»** que agrupa toda la gestiÃ³n del documento:

- Conectar / Importar archivo (elecciÃ³n deliberada: sustituye espejo tras validar y fija hash base).
- **Exportar** documento completo siempre, validaciÃ³n previa contra esquema; nombre sugerido `game-tracker.json` personalizable como preferencia local del dispositivo (meta en IDB; no viaja dentro del `.json`). Sin FSA, esta es la vÃ­a manual de vuelco.
- **Compartir copia**: `navigator.share({files})` donde `navigator.canShare({files})` lo permita.
- **Restaurar copia** desde los backups rotativos OPFS: snapshot de los Ãºltimos **3 vuelcos exitosos**, restaurable aquÃ­.
- **Segunda pestaÃ±a**: detecciÃ³n vÃ­a Web Locks â†’ entra en solo lectura con aviso y puede hacerse activa cuando el lock quede libre.
- Tras el primer guardado exitoso de la biblioteca, llamar a `navigator.storage.persist()` (sin prompt en Chromium; no insistir si deniega).

## Acceptance criteria

- [ ] Exportar produce un `.json` que vuelve a importar sin pÃ©rdidas (round-trip idÃ©ntico).
- [ ] Importar un archivo invÃ¡lido muestra error y no toca nada.
- [ ] Â«Compartir copiaÂ» aparece solo donde `canShare({files})`; si no, queda oculto sin romper nada.
- [ ] Existen exactamente 3 snapshots OPFS tras â‰¥3 vuelcos; restaurar una copia sustituye el estado actual.
- [ ] Abrir una segunda pestaÃ±a la deja en solo lectura con aviso; al cerrar la primera, puede hacerse activa.
- [ ] Tras un vuelco exitoso, la persistencia queda solicitada una Ãºnica vez.
