# 07: Slice de Ficha + lightbox como primitiva

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 4, paso 2 de 2. Pilot del patrón de slices que después se re-escopeará para el resto de vistas (fuera de alcance aquí).

**What to build:** el estado efímero de edición de la Ficha (campo en edición, errores, confirmaciones de borrado, plataforma propia en curso) deja de ser un global de módulo y pasa a un slice top-level del estado de la app, sembrado por el intent de abrir Ficha y **fuera del snapshot de historial** (que solo lleva pestaña, Biblioteca y Novedades): restaurar el historial nunca resucita un formulario abierto ni una confirmación de borrado pendiente. El guard existente de re-render ante juego distinto sigue cubriendo el botón atrás del móvil. Además, el lightbox se extrae como primitiva de UI junto a la hoja (sheet): sin store, con su propia suite migrada. → **ADR-0006**.

**Blocked by:** 06 — Motor de la Ficha: interface de comandos.

**Status:** ready-for-agent

- [ ] El estado de edición de la Ficha vive en un slice top-level sembrado al abrir la Ficha; el global del módulo desaparece.
- [ ] El snapshot de historial no lo lleva: avanzar y volver con el botón del móvil no resucita formularios abiertos ni confirmaciones de borrado.
- [ ] Editar en línea, confirmaciones y errores funcionan igual que hoy (spec §8.5).
- [ ] El lightbox es una primitiva independiente con su suite migrada y en verde.
- [ ] La suite del motor de la Ficha y la DOM siguen en verde.
- [ ] ADR-0006 publicada: slice fuera del snapshot de historial y por qué no dentro del slice de Biblioteca.
