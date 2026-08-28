# El conflicto pendiente vive en el slice del enlace de archivo

Contexto: el conflicto real (texto, hash y doc del archivo) pendiente de resolver vivía en un global del módulo del Enlace de archivo, y la UI se registraba como handler por efecto de import — el cableado dependía del orden de imports y «¿hay conflicto pendiente?» no tenía casa observable. Decisión: el conflicto pendiente pasa al slice `file` del estado de la app (`file.conflict`, ADR-0004 del esfuerzo architecture-deepening). Elevar un conflicto escribe el slice completo (estado conectado + conflicto) y avisa al handler registrado en el arranque; el diálogo de conflicto es render puro del estado: abre cuando el campo se fija (también para conflictos en segundo plano: foco, ocultar pestaña, autoguardado) y cierra cuando desaparece. **Regla documentada:** los guards existentes del enlace — omitir el vuelco (salvo forzado) y omitir el chequeo externo mientras hay conflicto pendiente — son lo que mantiene vivo ese campo; ninguna otra ruta escribe el slice durante un conflicto (el diálogo es modal y bloquea las demás vías).

## Considered options

- Slice top-level aparte (`conflict` como clave propia del estado): rechazado porque el conflicto pertenece al enlace — comparte su ciclo de vida (elevar, resolver, reset) y su condición de sesión; un slice aparte habría fragmentado la respuesta a «¿hay conflicto pendiente?» y obligado a mantener dos escrituras en sincronía.
- Mantener el global de módulo y solo cambiar la UI: rechazado porque «¿hay conflicto pendiente?» seguiría sin respuesta observable y el cableado por import seguiría dependiendo del orden.
- Diálogo puramente por suscripción, sin handler: viable (el slice lo permite), pero el registro explícito del handler en el arranque documenta la intención y mantiene un único punto de entrada para la UI.

## Consequences

- El diálogo deja de recibir el doc del archivo por parámetro: lee `file.conflict` del estado y la versión local de `doc.updatedAt`; `openConflict()` es idempotente y no hace nada sin conflicto pendiente.
- La pastilla de archivo ya no registra nada al importarse; el arranque de la app registra el handler una sola vez, antes de cualquier reconexión que pueda elevar conflicto.
- «Descargar copia» no escribe estado: el campo sigue vivo y el diálogo abierto, con la nota, para una resolución posterior (spec §5.5).
- Los tests del enlace pasan a leer el conflicto del estado (`store.get().file.conflict`), nunca de un global.