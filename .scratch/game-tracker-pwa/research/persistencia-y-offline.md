# Research: persistencia y offline en Android 11 + Chrome recién actualizado, y Chrome de escritorio

- **Ticket:** `.scratch/game-tracker-pwa/issues/02-research-persistencia-offline.md`
- **Fecha de consulta de todas las fuentes:** 2026-08-23
- **Contexto de versión:** a agosto de 2026, Chrome estable está en la serie 15x; cualquier Android 11 con "Chrome recién actualizado" cumple con holgura los mínimos citados abajo (Chrome ≥ 132 para File System Access en Android).
- **Método:** fuentes primarias (MDN, developer.chrome.com, web.dev, blink-dev/chromestatus, especificaciones W3C/WHATWG). Las afirmaciones clave llevan URL. Los datos de fuentes secundarias o reportes de comunidad se marcan explícitamente.

---

## TL;DR

| Capacidad | Chrome escritorio | Chrome Android (Android 11, 2026) |
|---|---|---|
| `showOpenFilePicker()` / `showSaveFilePicker()` | ✅ desde Chrome 86 | ✅ desde Chrome 132 (ene 2025), con asperezas conocidas |
| `showDirectoryPicker()` | ✅ desde Chrome 86 | ✅ existe, con bugs tempranos reportados; verificar en dispositivo |
| Permiso persistente del handle ("Allow on every visit") | ✅ desde Chrome 122 | ✅ mismo modelo Chromium; PWA instalada lo auto-persiste |
| Handles guardables en IndexedDB | ✅ | ✅ |
| `<a download>` export / `<input type="file">` import | ✅ universal | ✅ universal |
| `navigator.share({files})` (Web Share L2) | ⚠️ solo Windows | ✅ |
| Web Share Target (recibir shares) | ✅ si está instalada (89+) | ✅ si está instalada (76+) |
| Cache Storage de respuestas opacas (`no-cors`) | ✅ vía `cache.put()`, coste ~7 MB/opaca en cuota | igual |
| Cuota por origen | hasta ~60 % del disco total | igual (misma base Chromium) |
| `navigator.storage.persist()` | ✅ heurística automática, sin prompt | igual |
| IndexedDB transaccional/atómica | ✅ | ✅ |

**Recomendación central para game-tracker:** el archivo `.json` es la única fuente de verdad; IndexedDB es espejo de trabajo atómico; export/import con FSA (`showOpenFilePicker`/`showSaveFilePicker`) como mejora progresiva sobre el par universal descarga/`<input type="file">`; carátulas cacheadas en Cache Storage vía `fetch` + `cache.put`, pidiendo CORS cuando el CDN lo permita; llamar a `navigator.storage.persist()` tras guardar datos críticos.

---

## 1. File System Access API (FSA)

### 1.1 Disponibilidad hoy

- **Escritorio (Windows/macOS/Linux/ChromeOS):** `window.showOpenFilePicker()`, `showSaveFilePicker()` y `showDirectoryPicker()` están disponibles desde **Chrome 86** (sept 2020). Fuente: [Intent to Ship: File System Access on Android and WebView — "This feature has been supported on the 4 other platforms since M86"](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c) y [developer.chrome.com — The File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) (consultado 2026-08-23).
- **Android (navegador Chrome, no WebView):** la FSA completa (los tres pickers) se habilitó en **Chrome 132, estable en enero de 2025**. Fuentes:
  - [New in Chrome 132 — "The File System Access API is now available on Android and in WebViews"](https://developer.chrome.com/blog/new-in-chrome-132) (consultado 2026-08-23).
  - [web-platform-dx/web-features: file-system-access — Chrome 86 / Chrome Android 132](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access/) (consultado 2026-08-23).
  - caniuse (`showOpenFilePicker`) lista soporte en Chrome para Android: https://caniuse.com/mdn-api_window_showopenfilepicker (consultado 2026-08-23).
  - Nota: MDN sigue marcando los métodos como "Experimental" por su estado en la especificación WICG y porque Firefox/Safari no lo implementan (posiciones negativas/oposición); eso no contradice el soporte estable en Chromium. Ver [web-features: posiciones](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access/) y [MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) (consultados 2026-08-23).

### 1.2 Asperezas conocidas en Android al lanzarse (relevantes para UX)

Del hilo oficial de Intent to Ship (mismo hilo de blink-dev citado arriba, consultado 2026-08-23):

- Los filtros MIME/extensiones de `types` se ignoraban en el picker de Android ([crbug 376097107](https://issues.chromium.org/issues/376097107)).
- `showSaveFilePicker` no añadía la extensión por defecto al nombre sugerido; sí respeta `suggestedName` ([crbug 379140421](https://issues.chromium.org/issues/379140421)).
- Problemas iniciales con guardar-en-carpeta (`showDirectoryPicker({mode:'readwrite'})` + `getFileHandle(name, {create:true})`) porque Android usa content-URIs y depende del file provider ([crbug 376097108](https://issues.chromium.org/issues/376097108), [crbug 376097631](https://issues.chromium.org/issues/376097631)).

Estado 2026: un proyecto de verificación de comunidad (fuente **secundaria**, enero 2026) documenta los tres métodos operativos en Chrome Android 132+, incluida escritura en directorios elegidos: https://github.com/cs-util-com/FileSystemAccessOnAndroid (consultado 2026-08-23). **Acción recomendada:** probar en un dispositivo físico Android 11 real antes de depender de `showDirectoryPicker`; para game-tracker basta un fichero único `.json`, así que el riesgo queda acotado a open/save de un fichero.

### 1.3 Permisos y persistencia entre sesiones

Modelo base (todas las plataformas):

- El picker concede permiso de lectura (o lectura+escritura al crear/guardar) en el momento. Después hay que verificar con `queryPermission()` y re-solicitar con `requestPermission()` (requiere gesto de usuario). Fuente: [developer.chrome.com — Stored file or directory handles and permissions](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#stored-file-or-directory-handles-and-permissions) (consultado 2026-08-23).
- **Sin persistencia por defecto:** "The web app can continue to save changes to the file without prompting until all tabs for its origin are closed. Once a tab is closed, the site loses all access." Fuente: misma página, sección *Permission persistence* (consultado 2026-08-23). MDN lo confirma: un handle recuperado de IndexedDB normalmente resuelve `queryPermission()` como `"prompt"` — [MDN FileSystemHandle.queryPermission](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission) (consultado 2026-08-23).

Persistencia opt-in (**Chrome 122+, enero 2024**):

- Prompt de permisos de tres opciones: *"Allow this time"* / **"Allow on every visit"** / *"Don't allow"*. Elegir "every visit" concede acceso indefinido revocable desde Site Settings.
- Requisitos para activarlo: guardar los `FileSystemHandle` en **IndexedDB** (son serializables vía structured clone) y llamar a `requestPermission()` sobre uno de ellos en la visita siguiente.
- **PWA instalada:** "Installed apps will automatically persist permissions once the user grants access" — sin prompt adicional.
- Fuente: [Persistent permissions for the File System Access API — developer.chrome.com blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) (consultado 2026-08-23). La implementación vive en código compartido de Chromium (`ChromeFileSystemAccessPermissionContext`, usado también por Chrome Android/clank): [chromium source](https://chromium.googlesource.com/chromium/src/+/f01343ee86bdb55cc999f82381f038cdbf20db62/chrome/browser/file_system_access/chrome_file_system_access_permission_context.h) (consultado 2026-08-23). El anuncio original se redactó para escritorio; en Android conviene verificar el flujo del prompt en dispositivo (no encontramos nota de release específica para Android).
- Detalle posterior de robustez: `queryPermission()` pasó a reflejar también el estado persistente (antes solo tras `requestPermission()`): [commit chromium "[FSA] Update queryPermission() to include persistent permission state"](https://chromium.googlesource.com/chromium/src/+/6e5ed24c41d0f1eb7b2bc0310499be10bc6edd1c) (consultado 2026-08-23).

Caveat fuera del objetivo: en **WebView** la FSA sigue deshabilitada por defecto hasta que las apps nativas adopten la API de Android 17/API 37 (2026) — irrelevante para una PWA en Chrome, pero explica documentación confusa: [hilo blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c) (consultado 2026-08-23).

### 1.4 Implicación para game-tracker

- Escritorio: abrir/guardar el `.json` con handles persistentes es viable y cómodo (estilo VS Code web).
- Android: viable desde Chrome 132, pero **el permiso del handle no sobrevive al cierre de todas las pestañas salvo opt-in del usuario o PWA instalada**. Diseñar la UI asumiendo que habrá que reconectar el archivo en cada sesión ("Conectar mi library.json"), con re-conexión en un tap.

---

## 2. Export/import de un .json en móvil (patrones fiables)

Estos patrones funcionan en cualquier navegador, con o sin FSA, y son el fallback obligatorio:

### 2.1 Export por descarga (universal)

- Generar un `Blob` con `JSON.stringify` y disparar la descarga con `<a download="library.json">` + click programático. Es el mecanismo que la propia doc de Chrome propone como aproximación de `showSaveFilePicker`: "can be simulated with a `<a download>` element, albeit this triggers a programmatic download and does not allow overwriting existing files". Fuente: [developer.chrome.com — File System Access, aproximaciones/polyfills](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) (consultado 2026-08-23).
- En Android, el archivo cae en `Download/` y el usuario lo mueve/sincroniza con su app de terceros. Sin permisos ni prompts especiales.

### 2.2 Import con `<input type="file">` (universal)

- `<input type="file" accept=".json,application/json">` → `file.text()` → parse+validar. Equivalente funcional a `showOpenFilePicker` según la misma fuente (sección *It is not possible to completely polyfill…*). Funciona offline; solo requiere el tap del usuario.

### 2.3 Web Share Level 2 — compartir EL archivo hacia otras apps

- `navigator.share({ files: [new File([json], 'library.json', {type:'application/json'})] })`, precedido de `navigator.canShare({files})`. Soportado en **Chrome para Android** ([caniuse data.files](https://caniuse.com/mdn-api_navigator_share_data_files_parameter); [MDN Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share); [spec W3C Web Share](https://w3c.github.io/web-share/); consultados 2026-08-23). En escritorio Chrome solo Windows.
- Utilidad para game-tracker: botón "Compartir copia" → enviarla a Drive/la app de sincronización sin pasar por `Download/`. Complementario, no sustituye al export.

### 2.4 Web Share Target — recibir un share (solo PWA instalada)

- Declarando `share_target` en el manifest con `method: "POST"` + `enctype: "multipart/form-data"` + `params.files`, la app aparece en el share sheet de Android para recibir `.json` compartidos desde la app de archivos o de sincronización.
- Restricción dura: **requiere cumplir los criterios de instalabilidad y estar añadida a la pantalla de inicio**; Chrome 76+ Android, 89+ escritorio. Fuentes: [developer.chrome.com — Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [spec W3C Web Share Target Level 2](https://w3c.github.io/web-share-target/level-2/) (consultados 2026-08-23).
- Valor para game-tracker: flujo inverso cómodo en móvil ("compartir el .json desde el gestor de archivos → game-tracker"). Extra post-MVP; el import por picker ya cubre el caso.

### 2.5 Recomendación de UX

Un diálogo único de "Datos" con dos botones primarios siempre visibles: **Importar** (input file) y **Exportar** (descarga). Detección `'showOpenFilePicker' in self` para añadir, cuando exista, la variante "Conectar archivo" con re-apertura directa y guardado in situ (mejor UX en escritorio y Android moderno). Manejar siempre `AbortError` (usuario cancela el picker). Fuente del patrón de feature detection: [developer.chrome.com — Checking for support](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#:~:text=if%20(%27showOpenFilePicker%27%20in%20self)) (consultado 2026-08-23).

---

## 3. Service Worker + Cache Storage para carátulas cross-origin

### 3.1 Respuestas opacas: qué se puede cachear y cómo

- Las imágenes `<img src>` cross-origin se piden en modo `no-cors` y producen **respuestas opacas** (`type === 'opaque'`, `status === 0`): body ilegible por JS/SW, estado y cabeceras inspeccionables. Fuente: [Workbox/Chrome — Caching resources during runtime, "Opaque responses"](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime) (consultado 2026-08-23).
- **`cache.add()`/`cache.addAll()` rechazan las opacas** (rechazan respuestas fuera del rango 2xx; el status de una opaca es 0). **`cache.put()` sí acepta cualquier pareja request/response**: patrón `const r = await fetch(url, {mode:'no-cors'}); await cache.put(url, r)`. Fuente: [MDN Cache.put — nota expresa](https://developer.mozilla.org/en-US/docs/Web/API/Cache/put): "Cache.add/Cache.addAll do not cache responses with Response.status values that are not in the 200 range, whereas Cache.put lets you store any request/response pair. As a result, Cache.add/Cache.addAll can't be used to store opaque responses, whereas Cache.put can." (consultado 2026-08-23).
- Riesgo: al no poder leerse el status, se pueden persistir errores (un 404 servido como imagen rota) para siempre en cache-first. Workbox no cachea opacas por defecto. Mitigación: sembrar la caché desde la app (donde sabemos que la petición tuvo éxito porque la imagen se mostró) o usar network-first/stale-while-revalidate. Fuente: [Workbox — Workbox may not cache opaque responses](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime#workbox-may-not-cache-opaque-responses) (consultado 2026-08-23).

### 3.2 El atributo `crossorigin` y cuándo conviene

- Con `crossorigin` (o `fetch` en modo `cors`) se fuerza validación CORS: si el CDN responde con `Access-Control-Allow-Origin`, la respuesta deja de ser opaca → status/body legibles, cacheable con `addAll`, sin padding de cuota. Si el CDN NO manda cabeceras CORS, la carga con `crossorigin` falla directamente. Fuente: [Workbox — opt-in explícito a CORS vía atributo crossorigin](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime) (consultado 2026-08-23).
- Estrategia sugerida: probar el proveedor de carátulas con `crossorigin="anonymous"`; si funciona, todo es más simple y barato; si no, caer a `no-cors` + `cache.put` asumiendo el padding.

### 3.3 Coste de cuota: padding ~7 MB por respuesta opaca en Chrome

- "For Chrome, the minimum size that any single cached opaque response contributes to the overall storage usage is approximately 7 megabytes." Cada opaca cuenta como mínimo ~7 MB hacia la cuota (medida anti-fingerprinting) aunque pese unos KB. Fuentes: [developer.chrome.com — Understanding storage quota, "Beware of opaque responses!"](https://developer.chrome.com/docs/workbox/understanding-storage-quota); detalle histórico: [Cloud Four — When 7 KB equals 7 MB](https://cloudfour.com/thinks/when-7-kb-equals-7-mb/) (consultados 2026-08-23).
- Consecuencia práctica: 100–300 carátulas opacas ≈ 0,7–2,1 GB contabilizados. Pequeño frente a la cuota típica (ver 3.4), pero conviene: (a) limitar entradas cacheadas (LRU/expiración tipo `ExpirationPlugin` con `maxEntries`), (b) preferir miniaturas, (c) vigilar con `navigator.storage.estimate()`.
- Alternativa estructural si algún día pesara: guardar bytes de imagen como Blob en IndexedDB (sin padding, tamaño real), lo cual exige obtenerlas con CORS legible — imposible con respuestas opacas (body ilegible). No necesario para el alcance actual.

### 3.4 Cuotas en Android y política de eviction

- **Cuota Chromium:** el navegador puede usar hasta ~80 % del disco total y **un origen hasta ~60 % del disco total** (best-effort y persistente por igual). Consultable con `navigator.storage.estimate()` (`{usage, quota}`). En incógnito se reduce a ~5 %. Fuentes: [web.dev — Storage for the web](https://web.dev/articles/storage-for-the-web), [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) (consultados 2026-08-23).
- **Eviction:** por defecto todo es "best-effort". Bajo presión de almacenamiento, Chromium desaloja por LRU origen a origen (el origen entero de golpe: IDB + Cache API + SW). Solo afecta a orígenes NO persistentes. Datos de Chrome: el desalojo automático es muy raro; lo habitual es borrado manual del usuario. Fuentes: [web.dev — Storage for the web, "How does eviction work?"](https://web.dev/articles/storage-for-the-web#how-does-eviction-work), [web.dev — Persistent storage](https://web.dev/articles/persistent-storage) (consultados 2026-08-23).
- **`navigator.storage.persist()`**: marca el bucket como persistente → Cache API, IDB, localStorage, SW, OPFS… ya no se limpian automáticamente; solo por acción explícita del usuario. En Chromium **no hay prompt**: se concede/deniega automáticamente según señales de importancia del sitio (instalación como PWA, permiso de notificaciones concedido, interacción/frecuencia). Buen momento para pedirlo: al guardar datos críticos, envuelto en gesto, sin insistir si deniega. Comprobar con `navigator.storage.persisted()`. Fuentes: [MDN StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist), [web.dev — Persistent storage](https://web.dev/articles/persistent-storage), [Storage Standard WHATWG](https://storage.spec.whatwg.org/) (consultados 2026-08-23).
- Extra (Chromium 122+): Storage Buckets permite buckets con `{persisted: true, durability}` para priorizar qué se desaloja primero — innecesario hoy para game-tracker. Fuente: [developer.chrome.com — Storage Buckets](https://developer.chrome.com/docs/web-platform/storage-buckets) (consultado 2026-08-23).

### 3.5 Patrón recomendado para carátulas en game-tracker

1. Al añadir/editar un juego con carátula remota, la app hace `fetch(url)` (con CORS si el CDN lo permite) y `cache.put(url, response.clone())` en un cache dedicado (`covers-v1`). Éxito observable = entrada válida.
2. El SW sirve `covers-v1` con stale-while-revalidate (o cache-first solo si las entradas se sembraron verificadas): offline garantizado sin riesgo de persistir errores.
3. `navigator.storage.persist()` tras el primer guardado exitoso de la biblioteca.
4. Límite prudencial de entradas + limpieza de carátulas huérfanas al importar.

---

## 4. IndexedDB como espejo offline-first del .json (archivo = fuente de verdad)

### 4.1 Garantías de la plataforma que sostienen el patrón

- **Atomicidad:** "When committing… The implementation must atomically write any changes to the database made by requests placed against the transaction. That is, either all of the changes must be written, or if an error occurs, such as a disk write error, the implementation must not write any of the changes"; al abortar hay rollback completo (incluye cambios de esquema). Fuente: [W3C Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/) (consultado 2026-08-23). Escribir el documento entero en una transacción es all-or-nothing: no existen estados parciales visibles.
- **Durabilidad:** hint por transacción: `"strict"` (flush verificado a disco antes del evento `complete`) vs `"relaxed"` (escritura al buffer del SO). Desde **Chrome 121 el default cambió a relaxed** (mejoras de 3–30×; suficiente para uso normal). Para operaciones críticas (import inicial, migración de esquema) conviene `strict` explícito. Fuentes: [MDN IDBDatabase.transaction() — durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction#durability), [developer.chrome.com — A change to the default durability mode in IndexedDB](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed), [W3C IndexedDB 3.0 — durability hint](https://www.w3.org/TR/IndexedDB/) (consultados 2026-08-23).
- **Los `FileSystemHandle` son serializables y guardables en IndexedDB** (structured clone), patrón popularizado por VS Code web (`vscode-web-db` → `vscode-filehandles-store`). Fuente: [developer.chrome.com — Persistent permissions for the FSA](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) (consultado 2026-08-23).
- La escritura a fichero vía FSA es segura frente a corrupción: `createWritable()` escribe en un archivo temporal/swap y **el destino no cambia hasta `close()`** (swap atómico al final). Fuente: [MDN FileSystemFileHandle.createWritable()](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable) (consultado 2026-08-23).

### 4.2 El patrón (dónde vive la verdad, cuándo se vuelca)

**Regla de oro: el archivo `.json` sincronizado manualmente es la ÚNICA fuente de verdad a largo plazo.** IndexedDB es caché de trabajo durable, nunca una segunda verdad.

Estado en IDB (dos object stores):

- `state`: clave única `"doc"` → el documento JSON completo tal cual.
- `meta`: `{ schemaVersion, lastSavedFileHash (SHA-256 del contenido), dirty: bool, connectedFileName, updatedAt }`.

Flujo:

1. **Conectar/importar (única puerta de entrada de verdad externa):** leer archivo → parse → validar contra esquema + `schemaVersion` → migrar forward-only si procede → escribir `state.doc` + `meta{lastSavedFileHash = hash(contenido leído), dirty:false}` **en una sola transacción con `durability:'strict'`**.
2. **Uso normal:** toda mutación toca `state.doc` en IDB (transacción normal, `relaxed`) y pone `dirty:true`. La UI trabaja siempre contra IDB → 100 % offline incluso sin archivo conectado (en ese caso nace efectivamente dirty y el export crea el archivo nuevo).
3. **Vuelco al archivo (export/save):** serializar `state.doc` completo → escribir TODO el fichero de una vez (`handle.createWritable()` + write + close, o descarga por blob). Solo si la escritura terminó bien: `meta{lastSavedFileHash = hash(serializado), dirty:false}` en transacción `strict`. Nunca marcar éxito antes de que el fichero esté fuera.
4. **Reconexión / detección de conflictos (crítico con sync manual entre dispositivos):** al reconectar un archivo, calcular su hash y comparar con `meta.lastSavedFileHash`:
   - Igual → sesión normal.
   - Distinto y `dirty:false` → el archivo cambió fuera (otro dispositivo): re-importar limpio (paso 1).
   - Distinto y `dirty:true` → **conflicto real**: UI explícita "el archivo cambió fuera Y aquí hay cambios sin volcar": conservar archivo / conservar local / exportar local como copia para comparar. Jamás sobrescribir silenciosamente ninguna de las dos partes.
5. **Por qué documento-entero-en-un-store y no stores normalizados:** el `.json` versionado es pequeño (biblioteca personal); reemplazarlo atómico en bloque elimina ventanas de inconsistencia entre entidades y hace trivial regenerar espejo↔archivo. La normalización multi-store reintroduciría el problema de consistencia que se quiere evitar.

Resumen anti-corrupción:

- Validar + versionar todo input externo antes de tocar IDB.
- Escrituras relevantes en una sola transacción; `strict` para import/migración/volcado-verificado.
- Hash del último estado volcado para detectar divergencias sin fiarse de mtimes (los mtimes sobreviven mal a apps de sincronización de terceros).
- Backup rotativo opcional (últimos N exports) en OPFS — disponible en Android desde Chrome 109 ([Intent to Ship OPFS on Android](https://groups.google.com/a/chromium.org/g/blink-dev/c/GyxqF8ZDK5Q), [MDN Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system); consultados 2026-08-23).

---

## Fuentes primarias consultadas (2026-08-23)

1. https://developer.chrome.com/blog/new-in-chrome-132 — FSA disponible en Android/WebView desde Chrome 132.
2. https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c — Intent to Ship FSA Android/WebView; bugs iniciales; escritorio desde M86; WebView diferida a Android 17/API 37.
3. https://developer.chrome.com/docs/capabilities/web-apis/file-system-access — doc canónica FSA: pickers, permisos, permission persistence, aproximaciones con `<input>`/`<a download>`, feature detection.
4. https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api — permisos persistentes Chrome 122+, prompt de tres vías, auto-persistencia en PWA instalada, handles en IDB.
5. https://chromium.googlesource.com/chromium/src/+/f01343ee86bdb55cc999f82381f038cdbf20db62/chrome/browser/file_system_access/chrome_file_system_access_permission_context.h — modelo extended/dormant grants, PWA instalada ⇒ kExtended.
6. https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission y …/requestPermission — estados granted/denied/prompt, gesto requerido.
7. https://web-platform-dx.github.io/web-features-explorer/features/file-system-access/ — Chrome 86 desktop / Chrome Android 132; posiciones Firefox/Safari.
8. https://caniuse.com/mdn-api_window_showopenfilepicker y https://caniuse.com/mdn-api_navigator_share_data_files_parameter — tablas de soporte.
9. https://developer.mozilla.org/en-US/docs/Web/API/Cache/put — add/addAll vs put con respuestas opacas.
10. https://developer.chrome.com/docs/workbox/caching-resources-during-runtime — opacas, crossorigin, estrategias seguras.
11. https://developer.chrome.com/docs/workbox/understanding-storage-quota — padding ~7 MB por opaca en Chrome.
12. https://cloudfour.com/thinks/when-7-kb-equals-7-mb/ — caso práctico del padding (secundaria).
13. https://web.dev/articles/storage-for-the-web — cuotas Chromium (80 % navegador / 60 % origen), eviction LRU, estimate().
14. https://web.dev/articles/persistent-storage y https://storage.spec.whatwg.org/ — persist(), persisted(), heurísticas de concesión, garantías del modo persistent.
15. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — criterios de eviction por navegador.
16. https://developer.chrome.com/docs/capabilities/web-apis/web-share-target y https://w3c.github.io/web-share-target/level-2/ — share_target, requisitos de instalación, multipart/form-data.
17. https://www.w3.org/TR/IndexedDB/ — atomicidad/durabilidad normativa de transacciones.
18. https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed — default relaxed desde Chrome 121.
19. https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable — escritura atómica vía swap hasta close().
20. https://groups.google.com/a/chromium.org/g/blink-dev/c/GyxqF8ZDK5Q y https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system — OPFS en Android (Chrome 109+).
