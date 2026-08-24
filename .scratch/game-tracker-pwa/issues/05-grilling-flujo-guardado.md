# 05 · Grilling: flujo de guardado y carga del .json

Type: grilling
Status: resolved
Blocked by: 02

## Question

¿Cómo es el flujo exacto de guardado y carga del `.json`?

- File System Access API donde exista: concesión de permisos, reconexión entre sesiones; fallback export/import idéntico en móvil y escritorio.
- Autoguardado con debounce vs guardado manual explícito.
- Qué pasa si el archivo cambió fuera de la app (el usuario lo sincroniza manualmente con una app de terceros): detección del cambio externo, merge simple o aviso al usuario.

Skills: `grilling` + `domain-modeling`.

## Answer

Decidido en sesión de grilling (2026-08-23), sobre las capacidades cerradas por el research 02:

1. **Arquitectura**: el `.json` es la única fuente de verdad; IndexedDB es espejo de trabajo atómico (`state.doc` + `meta{lastSavedFileHash, dirty}`). Toda la UI trabaja contra IDB: la app funciona al 100 % aunque no haya archivo conectado.
2. **Primer arranque**: pantalla de bienvenida con dos caminos — *Importar mi game-tracker.json* (valida → sustituye espejo → fija hash base) o *Empezar biblioteca nueva* (nace `dirty`; el primer vuelco/export crea el archivo con el picker).
3. **Vuelco al archivo**: autoguardado con **debounce de 15 s** tras el último cambio cuando hay archivo conectado, más intento extra al ocultar la pestaña (mejor esfuerzo). Botón «Guardar ahora» e indicador «cambios sin volcar» siempre visibles. Sin FSA el vuelco es manual por exportación. Un fallo de escritura **no bloquea la app**: pastilla de error + reintento automático en el próximo cambio o al recuperar foco; el estado sigue `dirty` (IDB no pierde nada).
4. **Reconexión entre sesiones**: modo degradado silencioso con pastilla «Archivo no conectado — Reconectar» (un tap → `requestPermission`). Al reconectar se compara hash: igual → sesión normal (volcando pendientes si los hay); distinto + limpio → recarga limpia del archivo; distinto + `dirty` → conflicto real.
5. **Conflicto real** (archivo cambió fuera + cambios locales sin volcar): sin merge. Tres opciones mostrando la fecha de cada versión tomada del campo `updatedAt` de cada documento (no mtime): usar la del archivo (confirmación fuerte), mantener los locales (sobrescribe) o descargar copia para comparar.
6. **Cambio externo en vivo**: comprobar hash al recuperar foco de la ventana y justo antes de cada vuelco.
7. **Elección deliberada ≠ reconexión**: cualquier archivo elegido explícitamente (bienvenida o Datos → Conectar/Importar) sustituye el espejo tras validar y fija nuevo hash base, sin pasar por lógica de conflicto.
8. **Segunda pestaña**: detección vía Web Locks → entra en **solo lectura con aviso** y ofrece hacerse activa cuando el lock quede libre.
9. **Copias rotativas OPFS (dentro de v1)**: los últimos **3 vuelcos exitosos** se guardan como snapshot; restaurables desde Datos.
10. **Export/import**: documento completo siempre; validación contra esquema antes de tocar nada; nombre sugerido `game-tracker.json`, personalizable como preferencia local del dispositivo (meta en IndexedDB; no viaja dentro del `.json`); botón «Compartir copia» (Web Share L2) donde `navigator.canShare({files})` lo permita. Diálogo único «Datos» agrupa todo: Conectar/Importar, Exportar, Compartir, Restaurar copia.

Glosario: sin cambios (mecánica de persistencia, no vocabulario de dominio).
