# 19 · Diálogo «Datos»

**Status:** ready-for-agent
**Blocked by:** 18 · Conexión de archivo (FSA) + autoguardado + conflicto real

## What to build

Diálogo único **«Datos»** que agrupa toda la gestión del documento:

- Conectar / Importar archivo (elección deliberada: sustituye espejo tras validar y fija hash base).
- **Exportar** documento completo siempre, validación previa contra esquema; nombre sugerido `game-tracker.json` personalizable como preferencia local del dispositivo (meta en IDB; no viaja dentro del `.json`). Sin FSA, esta es la vía manual de vuelco.
- **Compartir copia**: `navigator.share({files})` donde `navigator.canShare({files})` lo permita.
- **Restaurar copia** desde los backups rotativos OPFS: snapshot de los últimos **3 vuelcos exitosos**, restaurable aquí.
- **Segunda pestaña**: detección vía Web Locks → entra en solo lectura con aviso y puede hacerse activa cuando el lock quede libre.
- Tras el primer guardado exitoso de la biblioteca, llamar a `navigator.storage.persist()` (sin prompt en Chromium; no insistir si deniega).

## Acceptance criteria

- [ ] Exportar produce un `.json` que vuelve a importar sin pérdidas (round-trip idéntico).
- [ ] Importar un archivo inválido muestra error y no toca nada.
- [ ] «Compartir copia» aparece solo donde `canShare({files})`; si no, queda oculto sin romper nada.
- [ ] Existen exactamente 3 snapshots OPFS tras ≥3 vuelcos; restaurar una copia sustituye el estado actual.
- [ ] Abrir una segunda pestaña la deja en solo lectura con aviso; al cerrar la primera, puede hacerse activa.
- [ ] Tras un vuelco exitoso, la persistencia queda solicitada una única vez.
