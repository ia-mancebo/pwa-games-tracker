# Research: build y service worker para GitHub Pages

- **Ticket:** `.scratch/game-tracker-pwa/issues/10-research-build-github-pages.md`
- **Fecha de consulta de todas las fuentes:** 2026-08-23
- **Contexto de versión:** a agosto de 2026, **Vite estable = serie 8.x** (docs oficiales servidas como v8.2.2) y **vite-plugin-pwa = v1.2.0**. Stack cerrado en ticket 03: Vanilla JS + Vite + vite-plugin-pwa, app de página única estática con vistas client-side. Carátulas en un cache dedicado `covers-v1` escrito por la app con `fetch()` + `cache.put()` (decisión del research 02). Hosting objetivo: proyecto Pages bajo subpath `https://<user>.github.io/<repo>/`.
- **Método:** fuentes primarias (vite.dev, docs y código fuente de vite-plugin-pwa en GitHub, developer.chrome.com/workbox, web.dev, MDN, docs.github.com). Cada afirmación clave lleva URL.

---

## TL;DR

| Tema | Conclusión |
|---|---|
| Base | `base: '/<repo>/'` en `vite.config`; Vite reescribe todas las URLs de assets; vite-plugin-pwa deriva `scope` y `start_url` de esa base automáticamente |
| Service worker | Estrategia `generateSW` (por defecto del plugin) basta: precachea el manifest de build, activa `navigateFallback: 'index.html'` y `cleanupOutdatedCaches` por defecto |
| `registerType` | `'prompt'` (es el default del plugin): aviso «hay nueva versión» + recarga explícita del usuario; evita recargas automáticas que perderían texto a medio escribir |
| Caché `covers-v1` | Una sola entrada `runtimeCaching` con `cacheName: 'covers-v1'`: Workbox lee Y escribe esa misma caché con nombre, así que sirve offline lo que la app sembró con `fetch()`+`cache.put()` |
| Manifest / instalación | `name`, `short_name`, `start_url`, `display: 'standalone'`, iconos **192 y 512 px** (más variantes `maskable`), HTTPS → instalable en Android 11 Chrome actual; criterios vigentes en 2026 |
| Deploy | Workflow de GitHub Actions (fuente «GitHub Actions» en Settings → Pages); `.nojekyll` innecesario en ese flujo (Jekyll no interviene) |
| Límites Pages | Sitio publicado ≤ **1 GB**, banda ancha *soft* **100 GB/mes**, *soft* **10 builds/hora** (no aplica con workflow propio de Actions), timeout de deploy 10 min — holgados para esta app |

---

## 1 · Configuración concreta recomendada

### 1.1 Base path del subpath del repositorio

La guía oficial de Vite para GitHub Pages dice textualmente:

> If you are deploying to `https://<USERNAME>.github.io/<REPO>/` (e.g. your repository is at `https://github.com/<USERNAME>/<REPO>`), then set `base` to `'/<REPO>/'`.
> — [vite.dev/guide/static-deploy](https://vite.dev/guide/static-deploy) (consultado 2026-08-23)

Detalles relevantes de `base` ([config/shared-options](https://vite.dev/config/shared-options.html#base), [guía de build](https://vite.dev/guide/build.html#public-base-path)):

- Valores válidos: pathname absoluto `/foo/`, URL completa, cadena vacía o `./` (relativo, para deployments embebidos).
- Durante el build, **las URLs de assets importados en JS, las referencias `url()` de CSS y las referencias de los `.html` se reescriben solas** respetando `base`. No hay que tocar nada a mano.
- Para URLs construidas en tiempo de ejecución existe la constante inyectada `import.meta.env.BASE_URL` (se sustituye estáticamente en el build; debe aparecer literal, no como `import.meta.env['BASE_URL']`).
- La alternativa `base: './'` (relativa) funciona, pero complica el registro del service worker y el fallback de navegación; para un destino conocido y fijo como `<user>.github.io/<repo>/` es mejor la base absoluta del subpath.

**Integración con vite-plugin-pwa:** el plugin toma la base de la config de Vite (`base = viteConfig.base`) y la usa para derivar el resto: `scope = options.scope || basePath` y en el manifest por defecto `start_url: basePath` y `scope`. Es decir, con definir `base: '/<repo>/'` una vez, manifest y SW quedan alineados con el subpath sin configuración extra. Fuente: código fuente del plugin [`src/options.ts`](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts) (consultado 2026-08-23).

Nota sobre `import.meta.env.BASE_URL`: si la app necesita construir URLs de runtime (por ejemplo, para registrar rutas absolutas de recursos propios), usarla en lugar de hardcodear `'/<repo>/'`.

### 1.2 `vite.config.ts` de referencia (ilustrativo)

```ts
// REFERENCIA ILUSTRATIVA del research (ticket 10) — el código real llega con la implementación.
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/game-tracker/', // ← subpath del repositorio en https://<user>.github.io/<repo>/
  plugins: [
    VitePWA({
      // 'prompt' es el valor por defecto; se deja explícito porque define el flujo de updates (§2).
      registerType: 'prompt',

      // Ficheros de public/ que también deben entrar en el precache además de js/css/html.
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'robots.txt'],

      manifest: {
        name: 'Game Tracker',
        short_name: 'GameTracker',
        description: 'Biblioteca personal de videojuegos, usable sin conexión',
        lang: 'es',
        // Deben coincidir con <meta name="theme-color"> del index.html (requisito del plugin).
        theme_color: '#1a1714',
        background_color: '#1a1714',
        display: 'standalone', // válido para instalabilidad; display_override no es necesario aquí
        // start_url y scope NO hacen falta declararlos: el plugin los deriva de `base`.
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // El precache por defecto solo incluye js/css/html; ampliar a los tipos usados.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],

        runtimeCaching: [
          {
            // Carátulas: MISMA caché con nombre que llena la app con fetch()+cache.put().
            // Workbox usa cacheName tanto para leer (cacheMatch) como para escribir (cachePut),
            // así que sirve offline exactamente las entradas que sembró la app.
            urlPattern: ({ request, url }) =>
              request.destination === 'image' && url.hostname === '<host-del-cdn-de-caratulas>',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'covers-v1',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              // statuses:[0,200] acepta respuestas opacas (fetch no-cors) además de 200 CORS.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // Para probar SW + manifest en `vite dev`. Con generateSW fuerza type:'classic'.
      devOptions: { enabled: true },
    }),
  ],
})
```

Registro en el punto de entrada (única pieza de código de app que exige el flujo elegido):

```js
// REFERENCIA ILUSTRATIVA — main.js
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    // mostrar aviso persistente "Nueva versión disponible" con botón "Recargar";
    // al pulsarlo → updateSW(): recarga la página sirviendo ya la versión nueva.
  },
  onOfflineReady() {
    // aviso discreto "La app ya funciona sin conexión".
  },
  onRegisterError(error) {
    // fallo silencioso/log; la app sigue funcionando online.
  },
})
```

Notas de configuración que salen del propio plugin/código fuente:

- **Defaults de `generateSW` aplicados por el plugin** ([src/options.ts](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts)): `navigateFallback: 'index.html'` (fallback de navegaciones offline estilo SPA), `cleanupOutdatedCaches: true` (borra precaches obsoletos de versiones anteriores), `dontCacheBustURLsMatching` para los assets con hash de `assets/`.
- **El precache por defecto solo incluye `css/js/html`** (globPatterns de workbox-build); hay que ampliarlo para png/svg/ico/webmanifest. Fuente: [Service Worker Precache](https://vite-pwa-org.netlify.app/guide/service-worker-precache) (consultado 2026-08-23).
- **Límite de tamaño por fichero precacheado: 2 MiB** (`maximumFileSizeToCacheInBytes`); desde v0.20.2 el plugin falla el build si algún asset lo supera en lugar de dejarlo fuera en silencio. Fuente: [FAQ](https://vite-pwa-org.netlify.app/guide/faq) (consultado 2026-08-23).
- Los iconos referenciados en el manifest entran al precache por defecto (`includeManifestIcons: true`). Mismo fuente `src/options.ts`.
- **`generateSW` vs `injectManifest`:** `generateSW` genera el SW completo desde la config (recomendado por defecto); `injectManifest` compila UN service worker propio con el punto de inyección `self.__WB_MANIFEST` y solo tiene sentido si se necesita lógica de SW a medida que las opciones no cubran. Para este caso (precache + fallback + una ruta runtime) `generateSW` sobra. Fuentes: [generateSW](https://vite-pwa-org.netlify.app/workbox/generate-sw), [Which Mode to Use (workbox-build)](https://developer.chrome.com/docs/workbox/modules/workbox-build#which-mode-to-use) (consultados 2026-08-23).
- **Dev:** con `devOptions.enabled: true` el plugin genera SW+manifest en `vite dev` (con `generateSW` fuerza `type: 'classic'`, según `src/options.ts`). Puede interferir con HMR; activarlo solo cuando se depure el ciclo PWA.

### 1.3 Integración con la caché `covers-v1` (research 02)

La decisión del ticket 02 es que la app, al añadir/editar un juego, hace `fetch(url)` y `cache.put(url, response.clone())` dentro de un cache llamado `covers-v1` (sembrado verificable desde la UI). La integración con el SW generado es directa:

- Las estrategias de Workbox usan `options.cacheName` **para ambas operaciones**: `cacheMatch` («matches a request from the cache… using the `cacheName`… defined on the strategy») y `cachePut` («puts a request/response pair in the cache… using the `cacheName`»). Fuente: [workbox-strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies) (consultado 2026-08-23). Por tanto, una ruta `runtimeCaching` con `cacheName: 'covers-v1'` sirve offline exactamente las entradas que la app sembró a mano, y si quiere, también puede rellenarla él mismo tras cada acierto de red (StaleWhileRevalidate).
- `StaleWhileRevalidate`/`NetworkFirst` aceptan por defecto respuestas 200 **y opacas**; declarar además `cacheableResponse.statuses: [0, 200]` lo hace explícito para el caso `no-cors`. Fuentes: [workbox-strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies) y [Workbox — caching resources during runtime](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime) (consultados 2026-08-23).
- **`cleanupOutdatedCaches` no toca `covers-v1`:** la limpieza de caches obsoletas actúa sobre los precaches antiguos generados por Workbox (cachés con patrón de nombre `workbox-precache-*`), no sobre cachés arbitrarias con nombre propio. Fuente: módulo [workbox-precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching) (función `cleanupOutdatedCaches`); el flag se activa por defecto en `generateSW` según `src/options.ts`.
- Coherencia con el riesgo documentado en el research 02: sembrar desde la app (donde el éxito es observable) evita persistir errores; la ruta del SW queda como lector offline, no como recolector ciego.

### 1.4 404 / fallback de navegación

- GitHub Pages no tiene rewrites: una ruta desconocida devuelve 404 (con `404.html` personalizable — [docs: crear página 404 propia](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site), consultado 2026-08-23).
- Esta app **no necesita rutas de URL**: es una página única (`index.html`) cuyas vistas son estado client-side (así lo dejó el prototipo del ticket 03), y el SW generado trae `navigateFallback: 'index.html'` por defecto, que sirve todas las navegaciones desde precache cuando no hay red.
- Si algún día se añadieran rutas reales compartibles, el patrón habitual en Pages sería copiar `index.html` a `404.html` para absorber deep-links; hoy es innecesario y queda fuera de alcance.

---

## 2 · Flujo de actualizaciones del service worker

### 2.1 Qué pasa en cada deploy (independiente del modo)

1. Cada build regenera `sw.js` con el precache manifest; cada entrada lleva revisión = hash MD5 del contenido (los ficheros sin cambiar conservan revisión). Fuente: [Automatic reload — Cleanup Outdated Caches](https://vite-pwa-org.netlify.app/guide/auto-update) (consultado 2026-08-23).
2. Con conectividad, el navegador re-descarga `sw.js`; si cambia el bytes, instala la nueva versión descargando los assets modificados en segundo plano mientras el SW viejo sigue sirviendo la app. Solo descarga todo el precache la primera visita o cuando hay versión nueva. Fuente: [Service Worker Precache](https://vite-pwa-org.netlify.app/guide/service-worker-precache) (consultado 2026-08-23).
3. Al activarse la nueva versión, `cleanupOutdatedCaches` (activo por defecto en `generateSW`) borra el precache viejo. No afecta a `covers-v1` ni a IndexedDB (§1.3).

### 2.2 Elección de `registerType`: `'prompt'` (recomendado) vs `'autoUpdate'`

Comparativa de la doc oficial ([Automatic reload](https://vite-pwa-org.netlify.app/guide/auto-update), [Prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update); consultadas 2026-08-23):

| | `prompt` (**default del plugin**) | `autoUpdate` |
|---|---|---|
| Al detectarse versión nueva | Callback `onNeedRefresh`: la app muestra su propio diálogo; al aceptar, `updateSW()` recarga y sirve la versión nueva | El SW nuevo toma control (`skipWaiting`+`clientsClaim` forzados por el plugin) y **recarga las pestañas abiertas automáticamente** |
| Riesgo | Ninguno automático; depende de que la UI muestre el aviso | «the user can lose data in any browser windows/tabs in which the application is open and is filling in a form» (cita literal de la doc) |
| Requisito de código | Importar `virtual:pwa-register` y cablear `onNeedRefresh`/`onOfflineReady` | Sin virtual module la recarga de pestañas no ocurre; con él, `registerSW({ immediate: true })` |
| Cambiar de uno a otro después | La doc advierte: «Changing the behavior … from `autoUpdate` to `prompt` can be a pain» — decidir antes de producción | ídem |

**Recomendación para game-tracker: `registerType: 'prompt'`** (además es el default, confirmado en [`src/options.ts`](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts): `registerType = 'prompt'`):

- La app edita datos en diálogos/fichas; una recarga automática a mitad de edición podría tirar texto no guardado aunque el documento vivo esté en IndexedDB.
- El uso es esporádico (biblioteca personal): abrir la app con conexión ya dispara el chequeo; el aviso «recargar» aparece puntualmente.
- `onOfflineReady` da el momento natural para avisar «ya puedes usarla sin conexión» tras la primera visita.

Detalle operativo del modo `prompt`: cuando el usuario pulsa «Recargar», llamar a `updateSW()`; el módulo virtual aplica `SKIP_WAITING` al SW en espera y recarga la página, que ya se sirve de la versión nueva (doc Prompt for update, citada arriba).

Extra opcional (no necesario ahora): el plugin ofrece [Periodic SW updates](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates) vía Periodic Background Sync para chequear updates aunque la app esté abierta mucho tiempo sin recargar; para una app de uso breve no aporta.

---

## 3 · Manifest e instalabilidad en Android 11 (Chrome actual, 2026)

### 3.1 Criterios de instalación de Chrome (vigentes)

Según [web.dev — What does it take to be installable?](https://web.dev/articles/install-criteria) (página canónica de criterios, consultada 2026-08-23; última actualización de contenido 2024-09-19, sin cambios de fondo conocidos a agosto 2026), Chrome dispara `beforeinstallprompt` y promociona la instalación cuando:

- La app **no está ya instalada**.
- Heurísticas de engagement: el usuario ha hecho ≥1 tap en la página alguna vez y ha visto la página ≥30 s acumulados (valen sesiones anteriores).
- Servida por **HTTPS** (GitHub Pages siempre es HTTPS).
- Un **web app manifest** que incluya:
  - `short_name` o `name`
  - `icons` — debe incluir un **icono 192px y otro 512px**
  - `start_url`
  - `display` — uno de `fullscreen`, `standalone`, `minimal-ui` o `window-controls-overlay`
  - `prefer_related_applications` ausente o `false`

Todo esto sale gratis con la config del §1.2: `display: 'standalone'` es el default del plugin, y `start_url`/`scope` se derivan de `base`.

### 3.2 Campos recomendados más allá del mínimo

- **Iconos maskable separados**: la doc de vite-plugin-pwa sugiere declarar dos entradas con `purpose: 'any'` (implícito) y `purpose: 'maskable'` en lugar de un único `purpose: 'any maskable'`, porque el combinado obliga a diseñar un icono que funcione en ambos contextos. En Android los maskable alimentan los iconos adaptativos del launcher. Fuente: [PWA Minimal Requirements — Icons/Images](https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements) (consultado 2026-08-23).
- **`theme_color` y `background_color`**: no son criterios de instalación, pero pinta la barra del título de la app instalada y la splash; el plugin exige que el `<meta name="theme-color">` del HTML coincida con `theme_color` del manifest. Fuente: misma página (§ Entry Point y § Web App Manifest).
- **UI de instalación enriquecida (opcional)**: añadir `screenshots` y descripciones al manifest produce el diálogo de instalación rico. Fuente: web.dev install-criteria (tip final) y [Chrome blog — How Chrome helps users install the apps they value](https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value) (consultado 2026-08-23).
- **`display_override`**: secuencia de modos que el navegador evalúa ANTES de `display`; gana el primero soportado; navegadores que no lo conocen lo ignoran y usan `display`. Útil solo si se quisiera `window-controls-overlay` en escritorio; para esta app basta `display: 'standalone'`. Fuentes: [MDN display_override](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override) y [developer.chrome.com — Preparing for the display modes of tomorrow](https://developer.chrome.com/docs/capabilities/display-override) (consultados 2026-08-23).

### 3.3 Novedades 2024–2026 relevantes

- Chrome mantiene además una vía de **instalación manual** («Instalar página como app» / «Añadir a pantalla de inicio → Instalar app») para sitios sin manifest válido, y experimenta con **prompts ML** que anticipan qué páginas el usuario querrá instalar. Implicación: aunque algo fallara de los criterios, el usuario podría instalar igualmente; pero cumpliéndolos se obtiene la experiencia «crafted» con prompt automático. Fuente: [Chrome blog citado](https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value) (consultado 2026-08-23).
- **Servido del manifest:** la spec recomienda (RECOMMENDED, no obligatorio) servir el manifest como `application/manifest+json` ([W3C Web Application Manifest](https://www.w3.org/TR/appmanifest/), consultado 2026-08-23); los navegadores aceptan también `application/json` (Firefox Source Docs — Inspecting web app manifests). Tras el primer deploy conviene verificar con `curl -I https://<user>.github.io/<repo>/manifest.webmanifest`; si GitHub Pages sirviera un MIME raro, renombrar el fichero a `manifest.json` (el plugin permite `manifestFilename`) resuelve sin tocar servidor.

### 3.4 Checklist mínima del plugin (resumen operativo)

Del apartado [PWA Minimal Requirements](https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements) (consultado 2026-08-23): viewport móvil + título + descripción + favicon + `apple-touch-icon` + `<meta name="theme-color">` en el `<head>`; manifest con name/short_name/description/theme_color/icons 192+512; `robots.txt` en `public/`; servidor HTTPS con redirect http→https y manifest con MIME correcto. Todo alcanzable en GitHub Pages tal cual.

---

## 4 · Límites y particularidades de GitHub Pages (confirmados a 2026)

De la página oficial [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) (consultada 2026-08-23):

- Repositorio fuente de Pages: límite **recomendado de 1 GB**.
- Sitio publicado: **como máximo 1 GB**.
- Deploys: **timeout a los 10 minutos**.
- Ancho de banda: límite ***soft* de 100 GB/mes** por sitio.
- Builds: límite ***soft* de 10 por hora**, que **NO aplica si se publica con un workflow propio de GitHub Actions** (nuestro caso recomendado).
- Pueden aplicarse rate limits adicionales (respuestas 429) en abusos.

Para game-tracker (un bundle JS/CSS + ~iconos, unos cientos de KB) todos los límites sobran con enorme margen; el consumo de banda crece solo con visitas nuevas (las recurrentes se sirven del SW/precache).

Particularidades de publicación:

- **Tipos de sitio**: los «project sites» viven en `http(s)://<owner>.github.io/<repositoryname>` — exactamente nuestro subpath; máximo un sitio Pages por repositorio. Fuente: [About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) (consultado 2026-08-23).
- **Publicación recomendada: GitHub Actions** (Settings → Pages → Source: «GitHub Actions»); la doc oficial de Vite incluye un workflow de ejemplo completo (checkout → setup-node → npm ci → npm run build → upload artifact `dist/` → deploy-pages) listo para copiar. Fuentes: [configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) y [vite.dev/guide/static-deploy](https://vite.dev/guide/static-deploy) (consultados 2026-08-23). El deploy lo ejecuta el usuario manualmente (restricción acordada en el mapa).
- **Jekyll**: con fuente «GitHub Actions», Jekyll no interviene en ningún momento (se publica el artefacto tal cual). Si algún día se publicara empujando `dist/` a una rama, hace falta un `.nojekyll` en la raíz de esa rama para saltarse el build Jekyll — desde el sunset del worker legado (jun 2024), el deploy desde rama pasa por Actions salvo que exista `.nojekyll`. Nota histórica: `.nojekyll` existe para evitar que Jekyll ignore ficheros/carpetas que empiezan por `_` (los outputs de Vite no empiezan por `_`, así que tampoco romperían nada). Fuentes: [GitHub Changelog — Pages legacy worker sunset](https://github.blog/changelog/2024-07-08-pages-legacy-worker-sunset/) y [Bypassing Jekyll on GitHub Pages](https://github.blog/news-insights/bypassing-jekyll-on-github-pages/) (consultados 2026-08-23).
- **Dominio propio**: permitiría volver a `base: '/'`, pero implica comprar dominio + DNS; innecesario para el alcance. Si algún día se migrase, basta cambiar `base` (todo lo demás deriva de ella).

Riesgos residuales menores anotados:

- La visibilidad del sitio es pública aunque el repo sea privado (si el plan lo permite) — irrelevante aquí: repo público previsto y sin secretos en el cliente. Fuente: warning en [configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- El manifest se pide **sin credenciales** por diseño de los navegadores; solo relevante si el sitio estuviera detrás de auth (no es el caso). Fuente: [FAQ de vite-plugin-pwa — 401 Unauthorized](https://vite-pwa-org.netlify.app/guide/faq) (consultado 2026-08-23).

---

## Fuentes primarias consultadas (2026-08-23)

1. https://vite.dev/guide/static-deploy — sección GitHub Pages: `base: '/<REPO>/'`, workflow Actions de ejemplo.
2. https://vite.dev/config/shared-options.html#base y https://vite.dev/guide/build.html#public-base-path — valores de `base`, reescritura automática de URLs, `import.meta.env.BASE_URL`, base relativa.
3. https://vite-pwa-org.netlify.app/guide/ — getting started del plugin (versión v1.2.0 en la cabecera de la doc).
4. https://vite-pwa-org.netlify.app/guide/auto-update — comportamiento autoUpdate, advertencias, cleanupOutdatedCaches, revisiones MD5.
5. https://vite-pwa-org.netlify.app/guide/prompt-for-update — comportamiento prompt, callbacks onNeedRefresh/onOfflineReady, updateSW().
6. https://vite-pwa-org.netlify.app/guide/service-worker-precache — precache por defecto js/css/html, globPatterns, cuándo se descarga el precache.
7. https://vite-pwa-org.netlify.app/workbox/generate-sw — runtimeCaching con generateSW (ejemplo fonts, exclude-routes, backgroundSync).
8. https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements — checklist entry point/manifest/iconos/maskable/servidor.
9. https://vite-pwa-org.netlify.app/guide/faq — maximumFileSizeToCacheInBytes 2 MiB + fail del build, useCredentials, tipos virtuales.
10. https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts — código fuente: defaults reales (`registerType='prompt'`, `navigateFallback:'index.html'`, `cleanupOutdatedCaches:true`, scope/start_url derivados de base, devOptions classic).
11. https://developer.chrome.com/docs/workbox/modules/workbox-strategies — estrategias; cacheName usado en lectura y escritura; opacas aceptadas por defecto en SWR/NF.
12. https://developer.chrome.com/docs/workbox/modules/workbox-precaching — alcance de cleanupOutdatedCaches (solo precaches Workbox antiguos).
13. https://developer.chrome.com/docs/workbox/modules/workbox-build#which-mode-to-use y https://vite-pwa-org.netlify.app/workbox/generate-sw — generateSW vs injectManifest.
14. https://web.dev/articles/install-criteria — criterios de instalación de Chrome (manifest mínimo, heurísticas, beforeinstallprompt, richer UI).
15. https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value — instalación manual de cualquier página, prompts ML, Create Shortcut (2024).
16. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override y https://developer.chrome.com/docs/capabilities/display-override — semántica de display_override.
17. https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits — 1 GB sitio, 100 GB/mes soft, 10 builds/h soft (no aplica con Actions), timeout 10 min.
18. https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages — project sites y URL `<owner>.github.io/<repo>`.
19. https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site — fuentes de publicación, Actions recomendado, sitio público aun con repo privado.
20. https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site — 404.html personalizable.
21. https://github.blog/changelog/2024-07-08-pages-legacy-worker-sunset/ — desde jun-2024 todo deploy pasa por Actions; `.nojekyll` para saltarse Jekyll en deploys desde rama.
22. https://github.blog/news-insights/bypassing-jekyll-on-github-pages/ — origen de `.nojekyll` (directorios `_`).
23. https://www.w3.org/TR/appmanifest/ — MIME `application/manifest+json` RECOMENDADO por la spec (no obligatorio).
