# Game Tracker · Especificación v1

Spec cerrada el 24-08-2026. Consolida todas las decisiones del mapa `.scratch/game-tracker-pwa/map.md` (tickets 01–08 y 10, con sus informes de research y prototipo) en un documento único, listo para entregarse a una sesión de implementación. El vocabulario de dominio vive en `CONTEXT.md` (raíz del repo); esta spec lo da por conocido.

---

## 1 · Qué es y qué no es

**Game Tracker** es una PWA 100 % estática, alojada en GitHub Pages, que gestiona la biblioteca personal de videojuegos de un único usuario. Funciona sin conexión (navegación, biblioteca completa y carátulas incluidas), guarda todos los datos personales en **un único archivo `.json` definido por nosotros, versionado dentro del archivo**, que el usuario posee y sincroniza entre dispositivos por sus propios medios con una app de terceros (esa sincronización está fuera del desarrollo).

- **Plataformas objetivo**: Android 11 con Chrome recientemente actualizado, y Chrome de escritorio.
- **Coste**: 0 €. Sin backend propio; sí está permitido un proxy serverless puntual (Cloudflare Worker gratuito) para llamar a APIs públicas.
- **El deploy a GitHub Pages lo ejecuta el usuario manualmente**; no forma parte del desarrollo.
- **Fuera de alcance v1** (ver §13): multiusuario, importaciones desde otras plataformas, funciones sociales, horas jugadas, papelera, Web Share Target.

## 2 · Modelo de dominio

Definiciones completas en `CONTEXT.md`. Resumen operativo para la implementación:

- **Juego**: una obra. Guarda una sola vez los **datos compartidos**: título, carátula, descripción, capturas, géneros, plataformas disponibles y etiquetas propias.
- **Jugada**: una partida de un juego. Guarda **lo vivido**: estado, valoración, plataforma efectiva, fechas y notas. Todo juego tiene **al menos una** jugada; las rejugadas son jugadas adicionales y se ven todas juntas en la Ficha.
- **Estado**: ciclo de vida de una jugada. Cuatro valores, tokens ingleses en los datos, etiquetas españolas en la UI: `backlog`→Quiero jugar, `playing`→Jugando, `finished`→Terminado, `abandoned`→Abandonado.
- **Estado del juego**: el Estado con el que se muestra y **cuenta** un Juego en estantería, panel y dashboard: el de su **jugada más reciente** (por `addedAt`).
- **Valoración**: 1–5 estrellas, sobre una jugada, permitida en cualquier estado. Ausente = sin valorar.
- **Plataforma**, dos facetas: del **juego** (dónde *se puede* jugar, catálogo de la fuente) y de la **jugada** (dónde *se jugó* esta partida). La plataforma efectiva puede ser propia y ajena al catálogo (p. ej. emulador) → `id: null`.
- **Género**: categoría oficial de la fuente de datos (IGDB), nombre congelado en el documento para garantizar offline.
- **Etiqueta propia**: categoría personal del usuario, describe al juego, inline en el documento con autocompletado en UI.

## 3 · Stack y arquitectura

- **Vanilla JS + Vite + vite-plugin-pwa** (v1.2.x; Vite estable serie 8). Sin framework de UI.
- **Página única** (`index.html`); las vistas (Biblioteca, Novedades, Estadísticas) son estado client-side. No hay rutas de URL ni deep-links → no hace falta fallback de 404.
- Service worker generado con la estrategia **`generateSW`** (precache del build + navigateFallback + una ruta de runtimeCaching; §11).
- El proxy Cloudflare Worker (§6) es pieza aparte, desplegada por el usuario, y solo participa en buscador y Novedades. **La biblioteca nunca depende de la API.**
- Objetivo de rendimiento: fluido hasta **5.000 juegos**. Cálculos de filtros/búsqueda en memoria contra el espejo IndexedDB; sin virtualización de listas ni librerías extra.

## 4 · Esquema del `.json` v1

### 4.1 Raíz

```jsonc
{
  "schema": "game-tracker",
  "version": 1,
  "updatedAt": "2026-08-23T10:00:00Z",
  "games": [ /* Juego[] */ ]
}
```

- `schema`: identificador del formato; permite rechazar un JSON equivocado antes de parsear nada.
- `version`: entero desde 1. Reglas de versionado (§4.4).
- `updatedAt`: fecha-hora ISO escrita en **cada guardado**; alimenta el diálogo de conflicto (los mtimes sobreviven mal a las apps de sincronización).
- Convenciones: fechas `YYYY-MM-DD`; campo ausente = desconocido; arrays vacíos permitidos pero omitibles.

### 4.2 Juego (datos compartidos)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID propio | sí | clave primaria, generada por la app; identidad desacoplada de la fuente |
| `igdbId` | número | no | referencia IGDB; el alta manual no lo tiene |
| `title` | string | sí | |
| `coverUrl` | URL completa (`t_cover_big`) | no | agnóstica de fuente, lista para cachear |
| `description` | string | no | texto plano; alimenta la Ficha offline |
| `screenshots` | array de URLs (máx. 5) | no | galería solo online (no se cachean) |
| `genres` | `[{id, name}]` de IGDB | no | nombre congelado |
| `platforms` | `[{id, name}]` de IGDB | no | dónde **se puede** jugar |
| `tags` | array de strings | no | etiquetas propias inline |
| `plays` | array de Jugada | sí | mínimo una |

### 4.3 Jugada (lo vivido)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID propio | sí | referenciable desde dashboard y ficha |
| `status` | `backlog \| playing \| finished \| abandoned` | sí | |
| `rating` | entero 1–5 | no | permitida en cualquier estado |
| `platform` | `{id, name}` única | no | dónde se jugó **esta** jugada; `id: null` si es propia (emulador) |
| `addedAt` | fecha | sí | automática al crear la jugada |
| `startedAt` | fecha | no | sugerida al pasar a Jugando; editable/borrable |
| `finishedAt` | fecha | no | sugerida al pasar a Terminado; editable |

### 4.4 Versionado y compatibilidad

- Migraciones **forward-only** al abrir archivos antiguos.
- Si el archivo trae una `version` **mayor** a la entendida → **rechazo explícito** («actualiza la app»); nunca lectura a ciegas ni sobrescritura.
- Cambios puramente aditivos y tolerados **no** bumpan versión.
- Las validaciones de entrada (importar, conectar) comprueban `schema`, `version` y tipos antes de tocar nada.

### 4.5 Duplicados y alta manual

- **Duplicados permitidos** (mismo `igdbId` dos veces): la UI avisa al añadir y ofrece abrir la ficha existente o crear otro igual.
- **Alta manual viable**: solo `title` y su primera jugada son obligatorios.

## 5 · Persistencia: guardado, carga y conflictos

### 5.1 Arquitectura de verdad

- El **archivo `.json` es la única fuente de verdad** a largo plazo. **IndexedDB es espejo de trabajo**, nunca una segunda verdad.
- IDB contiene dos object stores: `state` (clave `"doc"` → documento completo) y `meta` → `{lastSavedFileHash (SHA-256 del último volcado), dirty, connectedFileName, updatedAt}`.
- Documento-entero-en-un-store: toda mutación reemplaza `state.doc` atómicamente; regenerar espejo↔archivo es trivial.
- Durabilidad IndexedDB: `relaxed` (default Chrome 121+) para uso normal; **`strict` explícito** para import, migración y vuelco verificado.
- Todo funciona contra IDB: **la app es 100 % operativa aunque no haya archivo conectado** (en ese caso nace `dirty` y el primer export/vuelco crea el archivo).

### 5.2 Primer arranque

Pantalla de bienvenida con dos caminos:

1. **Importar mi game-tracker.json**: valida → sustituye espejo (transacción única `strict`) → fija hash base.
2. **Empezar biblioteca nueva**: nace `dirty`; el primer vuelco/export crea el archivo con el picker.

### 5.3 File System Access API y reconexión

- FSA disponible en Chrome Android 132+ y escritorio 86+. Feature detection `'showOpenFilePicker' in self`; manejar siempre `AbortError`.
- El permiso muere al cerrar las pestañas (salvo opt-in «Allow on every visit» o PWA instalada): **diseñar asumiendo reconexión manual del archivo en cada sesión**, en un tap (`requestPermission` sobre el handle guardado en IDB).
- **Reconexión silenciosa entre sesiones**: pastilla «Archivo no conectado — Reconectar». Al reconectar se compara hash del archivo con `meta.lastSavedFileHash`:
  - igual → sesión normal (volcando pendientes si los hay);
  - distinto + limpio → recarga limpia del archivo;
  - distinto + `dirty` → **conflicto real** (§5.5).

### 5.4 Vuelco al archivo

- **Autoguardado con debounce de 15 s** tras el último cambio cuando hay archivo conectado, más intento extra al ocultar la pestaña (mejor esfuerzo).
- Botón «Guardar ahora» e indicador «cambios sin volcar» siempre visibles. Sin FSA, el vuelco es manual por exportación.
- Escritura atómica (`createWritable()` hace swap al `close()`); solo si terminó bien se actualiza `meta{hash, dirty:false}` en transacción `strict`. Nunca marcar éxito antes de que el fichero esté fuera.
- **Un fallo de escritura no bloquea la app**: pastilla de error + reintento automático en el próximo cambio o al recuperar foco; el estado sigue `dirty`.

### 5.5 Conflicto real (archivo cambió fuera + cambios locales sin volcar)

Sin merge. Tres opciones, mostrando la fecha de cada versión tomada del campo `updatedAt` de cada documento:

1. Usar la versión del archivo (confirmación fuerte).
2. Mantener los locales (sobrescribe).
3. Descargar copia local para comparar.

Jamás sobrescribir en silencio ninguna de las partes. Comprobaciones de hash: al recuperar foco de la ventana y justo antes de cada vuelco.

- **Elección deliberada ≠ reconexión**: cualquier archivo elegido explícitamente (bienvenida o Datos → Conectar/Importar) sustituye el espejo tras validar y fija nuevo hash base, sin lógica de conflicto.

### 5.6 Segunda pestaña, backups y export/import

- **Segunda pestaña**: detección vía Web Locks → entra en **solo lectura con aviso** y puede hacerse activa cuando el lock quede libre.
- **Backups rotativos OPFS (dentro de v1)**: snapshot de los últimos **3 vuelcos exitosos**, restaurables desde el diálogo «Datos».
- **Export/import universal**: documento completo siempre, validación previa contra esquema; nombre sugerido `game-tracker.json`, personalizable como preferencia local del dispositivo (meta en IDB; no viaja dentro del `.json`); botón «Compartir copia» (`navigator.share({files})`, Web Share L2) donde `navigator.canShare({files})` lo permita.
- Diálogo único **«Datos»** agrupa todo: Conectar/Importar, Exportar, Compartir, Restaurar copia.
- Tras el primer guardado exitoso de la biblioteca, llamar a `navigator.storage.persist()` (sin prompt en Chromium; no insistir si deniega).

## 6 · Datos externos: proxy Cloudflare Worker + IGDB

IGDB **no soporta CORS por diseño** y exponer el client secret en un cliente estático contradice el flujo client-credentials de Twitch. Por eso:

- Un **Cloudflare Worker (plan free, 100k req/día)** delante de IGDB sirve buscador y Novedades. El secret (`CLIENT_ID`/`CLIENT_SECRET`) vive como variable secreta del Worker y nunca sale al navegador.
- El Worker gestiona el token de Twitch (client credentials, caduca ~60 días): lo pide una vez, lo cachea y lo renueva ante `401`/expiración.
- Rate limit IGDB 4 req/s + 8 concurrentes: sobrado para uso personal con caché (el Worker puede cachear respuestas agregadas de Novedades con TTL de horas; PopScore se actualiza cada 24 h).
- **Setup asumido del usuario** (~30–60 min, documentar en README): app en dev.twitch.tv (con 2FA) → pegar ~50 líneas de Worker en el dashboard de Cloudflare + secrets → pegar la URL `https://<worker>.workers.dev` como constante en la app.
- Queries Apicalypse ya con los nombres nuevos de la migración enum→tablas de IGDB (en curso hasta 31-08…): usar `release_dates`, `popularity_types`/`popularity_primitives`, etc.
- **Buscador** (Alta → Buscar online): `search "…" games` con `where version_parent = null`; campos: nombre, año, géneros, plataformas, `cover.image_id`, descripción.
- **Novedades**: recientes y calendario vía `release_dates` (sort asc/desc alrededor de hoy); populares vía PopScore («IGDB Visits», sort value desc); más esperados vía primitiva «Most Wishlisted Upcoming».
- **Carátulas**: `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg`; usar `cover_big` (264×374). Hotlinking permitido; las imágenes eliminadas/reemplazadas permanecen **30 días** en el CDN → margen de sobra para cachearlas.
- **Plan B documentado**: RAWG directo (CORS sí, key simple revocable, 20k req/mes, backlink obligatorio). Solo si algún día se quisiera eliminar el Worker; la identidad por UUID propios hace el cambio indoloro.

## 7 · Offline y cachés

### 7.1 Carátulas (`covers-v1`)

- Caché dedicada Cache Storage `covers-v1`, compartida entre app y service worker.
- Al añadir/editar un juego con carátula remota, **la app la siembra**: `fetch(url)` + `cache.put(url, response)` (éxito observable = imagen mostrada; evita persistir errores). Las opacas (`no-cors`, status 0) se aceptan; probar `crossorigin="anonymous"` con el CDN y usar CORS si responde (ahorra ~7 MB/opaca de padding de cuota en Chrome).
- El SW sirve `covers-v1` con StaleWhileRevalidate y `cacheableResponse: {statuses:[0,200]}` (§11): offline garantizado de lo sembrado.
- Expiración prudencial: `maxEntries: 500`, edad máxima 1 año. Limpieza de carátulas huérfanas al importar.

### 7.2 Instantánea de Novedades (`novedades-v1`)

- En cada refresco con éxito se guarda una **instantánea atómica** de todo el tablón: composición **12 recientes / 12 próximos / 6 populares / 6 esperados = 36 juegos**, cada uno con los campos necesarios para poblar la ficha y el alta local (título, carátula, géneros, plataformas, descripción, fecha de lanzamiento). Peso ≈ 0,5–1,5 MB.
- Sello único «Actualizado: fecha/hora» permanente y discreto en la cabecera; **banner destacado no bloqueante cuando la instantánea supera 7 días**.
- Las 36 carátulas de la instantánea se cachean además en `covers-v1`. Las galerías de capturas **no** entran en la instantánea (solo online).

### 7.3 Comportamiento degradado

- Refresco de Novedades: automático al abrir la pestaña si la instantánea tiene >12 h y hay conexión; botón manual siempre; reintento automático silencioso al volver la red.
- **Un único modo degradado** (sin conexión o fallo del servicio): tablón servido desde la instantánea con banda fina no bloqueante indicando el motivo («Sin conexión» / «No se pudo contactar con el servicio») + botón Reintentar.
- **Sin caché** (primera vez o datos borrados): estado vacío explicativo — «Novedades necesita conexión la primera vez para descargar el calendario» — con Reintentar.
- Todo el recorrido de Novedades (tira de meses, baldas, drill-down, ficha, «➕ Quiero jugarlo») funciona sobre la instantánea sin conexión.

## 8 · UX por pestaña

### 8.1 Biblioteca: Estantería

- Una **balda por Estado del juego** (según «Estado del juego»: un juego aparece donde dicte su jugada más reciente). Cada balda lleva **placa-etiqueta** (nombre, conteo, media ★) y muestra **máximo 6 portadas**; tarjeta «+N más» al final.
- Pulsar la placa o «+N más» abre el **Panel** de ese estado. «← Estantería» vuelve.

### 8.2 Biblioteca: Panel

- Lista densa: portada mini, título, etiquetas propias, plataformas, valoración, píldora de estado. Paginación en **bloques de 100** con «Cargar más».

### 8.3 Búsqueda y filtros (estantería y panel)

- Barra común en ambas vistas: búsqueda + tres filas de chips (género, plataforma, etiqueta propia) bajo ella. Filas con scroll horizontal; la de etiquetas no aparece si no hay ninguna creada.
- **Búsqueda**: coincide con título, etiquetas propias, géneros y plataformas; insensible a mayúsculas y tildes; debounce 150 ms. En estantería filtra dentro de cada fila y **oculta las estanterías sin resultados**; en panel filtra dentro del estado abierto.
- **Filtros**: selección única por dimensión (tocar el chip activo lo quita), **acumulables entre dimensiones** (Y lógico). Los chips de estado **cambian** de lista (radio, no acumulan).
- **Orden por defecto**: recencia descendente (`addedAt` de la jugada más reciente), desempate alfabético. Igual en estantería y panel. Sin conmutador de orden en v1.

### 8.4 Alta

- Botón fijo **«➕ Añadir juego»** en la barra de Biblioteca → hoja con dos caminos:
  - **Buscar online** (por defecto): contra el proxy IGDB, debounce 300 ms; resultados con carátula y año; al elegir uno se precargan los datos compartidos y se crea la primera jugada.
  - **Crear manualmente**: solo título obligatorio.
- Sin conexión, el camino online aparece deshabilitado con motivo, empujando al manual. Estado por defecto de la primera jugada: **Quiero jugar** (editable en el formulario). El aviso de duplicados aplica en ambos caminos.

### 8.5 Ficha

- Portada, píldora de estado, título, valoración por estrellas clicables (+ «quitar»), descripción, plataformas, géneros, etiquetas propias, fechas, chips de estado y galería de capturas si existe.
- Cada **jugada editable en línea**: fechas (`startedAt`/`finishedAt`), plataforma efectiva y notas.
- **«Añadir jugada»**: nace **Jugando**, plataforma **heredada de la última jugada**, valoración vacía; todo editable al crearla.
- Datos compartidos: título y etiquetas propias **siempre editables**; géneros, plataformas disponibles, carátula, descripción y capturas **solo lectura si vienen de IGDB** (`igdbId` presente) y editables si el alta fue manual.
- Cambiar de estado opera sobre la jugada más reciente; nunca borra ni crea jugadas por sí solo.
- **Borrado**: de **juego** (en cascada con sus jugadas) y de **jugada individual** (respetando el mínimo de una por juego); ambos con confirmación, **sin deshacer** y sin papelera. Red de seguridad: los backups rotativos OPFS (§5.6).

### 8.6 Novedades

- Layout: tira de meses con scroll horizontal + baldas de tarjetas con badge de fecha. Secciones: recién salidos, próximamente, populares, esperados (composición 12/12/6/6, §7.2). Las placas de sección despliegan su lista (portadas, filtro por género).
- Ficha de detalle desde Novedades añade fecha/interés y el botón **«➕ Quiero jugarlo»**: crea la entrada local como «Quiero jugar» conservando descripción y galería (operación 100 % local).

### 8.7 Dashboard de estadísticas

Vista **solo lectura**; todo recomputa con el filtro activo.

- **Filtros globales**: tres dimensiones (plataforma, género, etiqueta propia) como filas de chips en la cabecera; selección única por dimensión con opción «Todas»; acumulables entre dimensiones. Multi-selección dentro de una dimensión y filtro por estado: fuera de v1.
- **KPIs**: conteo por cada uno de los 4 estados, total de juegos y media ★ (un decimal, sobre jugadas valoradas).
- **Barras de distribución** (mismo componente): plataforma, género y etiqueta propia.
- **Terminados en el tiempo**: barras por mes de los últimos 12 (etiqueta corta tipo «ago 25»).
- **Top 5 mejor valorados**: compacto (portada mini + título + ★); único elemento clicable, abre la Ficha.
- **Semántica de recuento**:
  - Totales por estado y distribuciones cuentan **Juegos, una vez cada uno**, según su «Estado del juego».
  - Distribución por plataforma usa `platforms[]` del juego (catálogo); las plataformas propias (`id: null`) quedan fuera del gráfico en v1.
  - Distribución por género/etiqueta: un juego cuenta en cada género/etiqueta que tenga.
  - Terminados por mes cuentan **jugadas** terminadas con `finishedAt`.
  - Media de un juego para el Top 5: media de sus jugadas valoradas.
- Estado vacío amable cuando no hay datos.

## 9 · Dirección visual aprobada

Decisión HITL sobre el prototipo `.scratch/game-tracker-pwa/prototype/shell.html` (**variante B, «Mezcla A+B»** — fuente primaria de esta sección; consultarla antes de maquetar). Cromatura y tipografía de B, estantería de A:

- **Tema carbón cálido oscuro**, denso tipo panel; las caráturas llevan el color. Tokens del prototipo:

| Token | Valor | Uso |
|---|---|---|
| `--bg0` | `#151210` | fondo base (y `theme_color`) |
| `--bg1` | `#1c1815` | superficies elevadas |
| `--bg2` | `#272119` | superficies activas/selección |
| `--line` / `--line-soft` | `#37312a` / `#282320` | bordes |
| `--ink` / `--muted` / `--faint` | `#ece5d8` / `#a29684` / `#6e6355` | texto |
| Quiero jugar | `#e9b04d` (ámbar) | acento semántico de estado |
| Jugando | `#5fc98f` (verde) | ídem |
| Terminado | `#9a90ec` (violeta) | ídem |
| Abandonado | `#cf6a52` (rust) | ídem |

- **Tipografía**: Space Grotesk (UI/display) + IBM Plex Mono (datos, números, contadores).
- **Estructura**: raíl lateral fijo (236 px) con navegación y widgets; colapsa a barra superior en móvil (<900 px). Listas densas con cabeceras mono en mayúsculas espaciadas; KPIs número grande + etiqueta.
- **Componentes característicos**: píldoras de estado (color + fondo al 13 % + borde interior al 45 %), chips pill, placas de balda con borde izquierdo grueso del color del estado, estrellas ★, barras de distribución finas.
- **Móvil sin desbordes**: grid con `minmax(0, 1fr)`; scroll horizontal **solo** dentro de baldas, tira de meses y galería; chips `nowrap` con `flex-shrink: 0`; buscador a ancho completo; cero desbordes de página.
- `:focus-visible` visible; animaciones discretas (fade corto); respetar `prefers-reduced-motion`.

## 10 · PWA e instalabilidad

- Manifest generado por vite-plugin-pwa a partir de `base`: `name: 'Game Tracker'`, `short_name: 'GameTracker'`, `description`, `lang: 'es'`, `display: 'standalone'`, `start_url`/`scope` derivados automáticamente.
- Iconos **192 y 512 px** + variantes **maskable** separadas (entradas `purpose: 'maskable'` independientes de las normales). `theme_color`/`background_color` = carbón base (`#151210`), coincidiendo con `<meta name="theme-color">` (requisito del plugin).
- Checklist del `<head>`: viewport móvil, título, descripción, favicon, apple-touch-icon, robots.txt en `public/`.
- Instalable en Android 11 con Chrome actual (criterios vigentes 2026: HTTPS ✓ Pages, manifest completo, heurísticas de engagement). Tras el primer deploy, verificar el MIME del manifest; si Pages sirviera algo raro, renombrar a `manifest.json` vía `manifestFilename`.

## 11 · Service worker y actualizaciones

- **`generateSW`** con `registerType: 'prompt'` (default del plugin, dejarlo explícito):
  - Precachea el manifest del build; ampliar `globPatterns` a `js,css,html,svg,png,ico,webmanifest`. Límite 2 MiB por fichero precacheado (el build falla si se supera).
  - `navigateFallback: 'index.html'` y `cleanupOutdatedCaches: true` vienen por defecto; la limpieza **no toca** `covers-v1` ni `novedades-v1`.
  - **Runtime caching de carátulas**: una ruta con `cacheName: 'covers-v1'` (Workbox lee Y escribe esa misma caché) + `handler: 'StaleWhileRevalidate'` + `cacheableResponse: {statuses:[0,200]}`, patrón limitado al host del CDN de imágenes con destino `image`.
- Flujo de updates: `onNeedRefresh` → aviso persistente «Nueva versión disponible» con botón Recargar → `updateSW()` recarga sirviendo la versión nueva. Se elige `prompt` y no `autoUpdate` para evitar recargas automáticas que perderían texto en edición. `onOfflineReady` → aviso discreto «La app ya funciona sin conexión». `onRegisterError` → fallo silencioso.
- Registro con `virtual:pwa-register` en el punto de entrada. `devOptions.enabled` solo para depurar el ciclo PWA (interfiere con HMR).

## 12 · Build y despliegue (GitHub Pages)

- `base: '/<repo>/'` en Vite (reescribe assets, CSS y HTML; deriva `scope`/`start_url`). Para URLs construidas en runtime usar `import.meta.env.BASE_URL` (literal, no indexado).
- Deploy con **workflow de GitHub Actions** (Settings → Pages → Source: GitHub Actions; guía oficial de Vite como plantilla). Con esa fuente Jekyll no interviene (`.nojekyll` innecesario). El usuario ejecuta el deploy manualmente.
- Límites Pages confirmados 2026 (holgados): sitio ≤ 1 GB, banda soft 100 GB/mes, timeout deploy 10 min, límite de builds no aplicable con Actions propio.
- Sin secretos en el cliente: el repo puede ser público; el secret de IGDB vive solo en el Worker.

## 13 · Fuera de alcance v1

Multiusuario y autenticación; importación desde Steam u otras bibliotecas; funciones sociales; backend persistente propio (el proxy puntual sí está permitido); horas jugadas por entrada; papelera/deshacer; conmutador de orden; multi-selección dentro de una dimensión de filtro y filtro por estado en el dashboard; Web Share Target (recibir shares, post-MVP); dominio propio; galerías de capturas offline; distribución por plataformas propias (`id: null`) en el dashboard; virtualización de listas. El sync con la app de terceros y el deploy son acciones manuales del usuario.

Las **migraciones concretas entre versiones del esquema posteriores a la v1** no forman parte de este esfuerzo: la política (forward-only, rechazo explícito de versiones futuras, aditivo no bumpea) queda fijada en §4.4, y cada cambio futuro de esquema definirá su migración en su momento.

## 14 · Referencias

- Mapa y decisiones: `.scratch/game-tracker-pwa/map.md`; tickets cerrados en `issues/01–10`.
- Research: `research/acceso-a-datos.md`, `research/persistencia-y-offline.md`, `research/build-github-pages.md` (con citas primarias y configuración ilustrativa de `vite.config.ts` y registro del SW).
- Prototipo visual: `prototype/shell.html` (variante B).
- Glosario: `CONTEXT.md`.
