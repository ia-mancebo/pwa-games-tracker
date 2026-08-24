# Research · Estrategia de acceso a datos de juegos (buscador + Novedades)

Ticket: `.scratch/game-tracker-pwa/issues/01-research-acceso-datos.md`
Fecha de consulta de todas las fuentes: **23 de agosto de 2026**.
Contexto fijo: PWA 100 % estática en GitHub Pages, sin backend propio (un proxy serverless puntual sí está permitido según `map.md`), biblioteca local en un único `.json` propio, cero coste preferente, el usuario no le importa crear credenciales OAuth de Twitch.

---

## 1. IGDB (fuente primaria: api-docs.igdb.com)

### 1.1 Flujo OAuth de Twitch (client credentials)

Verificado en la documentación oficial:

- El registro exige: cuenta gratuita de Twitch, **2FA activada**, y registrar la aplicación en el portal de desarrolladores de Twitch con Client Type `Confidential` para poder generar un *Client Secret*. El campo "OAuth Redirect URL" no se usa en IGDB (ponen `localhost`). Fuente: <https://api-docs.igdb.com/> → "Account Creation".
- El flujo es un `POST` a `https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials`, que devuelve `{access_token, expires_in, token_type: "bearer"}`. En los ejemplos oficiales `expires_in` vale ~5.587.808 s (IGDB) y ~5.011.271 s (Twitch), es decir **~60 días**; no hay refresh token para app tokens: se vuelve a pedir el token cuando expira o ante un `401`. Fuentes: <https://api-docs.igdb.com/> → "Authentication"; <https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/> → "Client credentials grant flow".
- Las llamadas a IGDB van con cabeceras `Client-ID: <id>` y `Authorization: Bearer <token>` sobre `https://api.igdb.com/v4/<endpoint>`, cuerpo tipo Apicalypse (`fields …; search …; where …`). Fuente: <https://api-docs.igdb.com/> → "Requests".
- La API es **gratuita para uso no comercial** bajo el Twitch Developer Service Agreement. Fuente: <https://api-docs.igdb.com/> → "Account Creation".

### 1.2 ¿Soporta CORS `api.igdb.com`?

**No.** Texto literal de la documentación oficial:

> "If you are trying to make these requests via the Browser you will run into CORS errors as the API does not allow requests directly from browsers." (<https://api-docs.igdb.com/> → "Requests", nota)

Y en la sección específica:

> "We do not offer the configuration of these headers as a service, so any browser-based javascript and mobile javascript frameworks will not be able to communicate directly with the IGDB API." (<https://api-docs.igdb.com/> → "CORS Proxy" → "CORS")

Su workaround oficial es montar un proxy (proponen una plantilla AWS API Gateway que además rota los tokens automáticamente). Conclusión: **el acceso directo desde navegador a IGDB está descartado por diseño**, no es un bug transitorio.

### 1.3 Implicaciones de exponer el client secret en un cliente estático

Aunque CORS lo impidiera técnicamente, poner el secret en el bundle sería incorrecto por tres motivos:

1. Contradice la finalidad documentada del flujo: Twitch describe client credentials como el flujo "para peticiones server-to-server… si tu app usa un servidor, puede guardar el secret de forma segura y hacer llamadas server-to-server" (<https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/>). Un cliente estático no cumple ninguna de las tres condiciones.
2. Cualquiera que descargue la página obtendría el `client_id` + `secret` y podría emitir app tokens legítimos con tu identidad: consumir tu cuota de 4 req/s hasta dejarte sin servicio (429), o usar la API violando los términos bajo tu aplicación (riesgo de revocación).
3. No hay forma de rotar el secret sin redistribuir la web estática.

En un proxy, en cambio, el secret vive como variable secreta del Worker y nunca sale al navegador.

### 1.4 Rate limits actuales

Documentación oficial vigente (consultada 23-08-2026):

> "There is a rate limit of **4 requests per second**. If you go over this limit you will receive a response with status code `429 Too Many Requests`. You are able to have up to **8 open requests** at any moment in time." (<https://api-docs.igdb.com/> → "Rate Limits")

Para uso personal de esta PWA (búsquedas puntuales + refresco diario de Novedades) el límite es holgado si se cachéa. No hay cuota mensual documentada.

### 1.5 CDN de imágenes (carátulas)

- Formato de URL construida: `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg`. La API devuelve por defecto la variante `t_thumb`; el cliente debe construir la URL con el campo `image_id` y el tamaño deseado. Fuente: <https://api-docs.igdb.com/> → "Reference" → "Images".
- Tamaños documentados relevantes: `cover_small` 90×128, `cover_big` **264×374** (adecuado para listas/detalle), `t_thumb` 90×90, más variantes retina añadiendo `_2x` (p. ej. `cover_big_2x`). Fuente: misma sección.
- Retención: "**Images that are removed or replaced from IGDB.com exist for 30 days before they are removed**. Keep that in mind when designing cache logic." — dato clave para la estrategia offline ya acordada (cachear los bytes en Cache Storage, no solo la URL). Fuente: misma sección.
- Hotlinking: **no existe ninguna política documentada que lo prohíba**; el esquema de URLs está publicado precisamente para que los consumidores de la API referencien las imágenes directamente desde sus apps. Las cabeceras de caché del CDN no están documentadas oficialmente; dado que un `image_id` concreto nunca cambia de contenido (las sustituciones crean otro id y el viejo persiste 30 días), tratar cada URL como inmutable en la caché del navegador es un comportamiento seguro.

### 1.6 Datos disponibles para Novedades

IGDB cubre las cuatro necesidades de Novedades con endpoints oficiales:

- **Recientes y calendario de próximos lanzamientos**: endpoint `release_dates` con filtros/sort por fecha; los propios docs traen los ejemplos "Coming soon games" (`where date > X; sort date asc;`) y "Recently released games" (`where date < X; sort date desc;`). Fuente: <https://api-docs.igdb.com/> → "Examples".
- **Más populares y más esperados**: IGDB PopScore vía `popularity_types` + `popularity_primitives`, actualizado **cada 24 horas**, con primitivas que incluyen "IGDB Visits", "IGDB Want to Play/Playing/Played", "Steam 24hr Peak Players", "**Most Wishlisted Upcoming**" (≈ más esperados) y "Twitch Hours Watched". Ejemplo oficial: top 10 por visitas con `sort value desc; where popularity_type = 1;`. Fuente: <https://api-docs.igdb.com/> → "PopScore".
- Búsqueda por nombre para el buscador: `search "…" games` (con `where version_parent = null` para excluir ediciones). Fuente: <https://api-docs.igdb.com/> → "Examples".

### 1.7 Snapshot masivo en build-time: NO viable gratis

Los data dumps CSV diarios de todos los endpoints son **exclusivos para Data Partners** comerciales ("Please note that data dumps are exclusively available to our Data Partners"). Fuente: <https://api-docs.igdb.com/> → "Partnership" → "Data Dumps".

### 1.8 Estado del servicio en 2026

La API v4 sigue operativa y documentada activamente. Ojo: hay una **migración de campos enum→tablas en curso** (nuevos endpoints como `release_date_regions`, `game_status`, `external_game_sources`…; ventana anunciada del 18 de febrero al 31 de agosto, con eliminación posterior de los nombres antiguos; la página no muestra el año explícitamente). Para código nuevo conviene usar directamente los nombres nuevos. Fuente: <https://api-docs.igdb.com/> → "Migration Enums to Tables".

---

## 2. Alternativas con acceso directo desde navegador

### 2.1 RAWG (fuente primaria: rawg.io/apidocs)

| Aspecto | Dato verificado | Fuente |
|---|---|---|
| Auth | API key simple en query param (`GET https://api.rawg.io/api/games?key=KEY`) — sin OAuth | <https://rawg.io/apidocs> |
| Cuota gratuita real | **20.000 requests/mes**, solo proyectos personales/no comerciales | <https://rawg.io/apidocs> → "Pricing" |
| Atribución | **Backlink obligatorio** a RAWG desde toda página donde se muestren sus datos ("add an active hyperlink from every page where the data of RAWG is used") | <https://rawg.io/apidocs> → "Terms of Service" |
| Datos | 500.000+ juegos; géneros, plataformas, fechas, Metacritic, ESRB, playtime, tiendas, 2,1 M screenshots; búsqueda fuzzy/exacta (`search_precise` / `search_exact`) | <https://rawg.io/apidocs>; <https://rawg.readme.io/reference/overview> |
| Novedades | Ordenación/filtrado por `-added` (popularidad de listas de usuarios), `-rating`, `-metacritic` y rangos `dates=` → sirve para recientes, populares, mejor valorados y "most anticipated" (`dates=futuro&ordering=-added`) | <https://rawg.io/apidocs> → "Example usecases" |
| Carátulas | `background_image` incluido en respuestas de lista (CDN `media.rawg.io`) | <https://rawg.readme.io/reference/overview> |

**CORS**: RAWG sí permite el consumo directo desde navegador en las respuestas normales — envía `Access-Control-Allow-Origin` comodín (la evidencia inversa es un hilo donde el error solo aparece porque el desarrollador enviaba `withCredentials=true`, incompatible con wildcard: <https://stackoverflow.com/questions/76787267/>), y su uso didáctico estándar es llamarlo desde React/Vite en cliente. Matiz importante: cuando la API devuelve error (cuota agotada, key inválida) la respuesta puede llegar **sin** cabeceras CORS, lo que en consola se disfraza de "CORS error" y despista (reportes en <https://github.com/mosh-hamedani/game-hub/issues/2> y <https://forum.codewithmosh.com/t/cannot-fetch-the-games-from-rawgs-api-has-been-blocked-by-cors-policy/19349>). La key queda expuesta en el bundle, pero es revocable y de bajo valor — riesgo aceptable en un proyecto personal.

**Estado 2026**: el servicio está activo a fecha de consulta (página de apidocs viva; actividad de usuarios en rawg.io horas antes; © 2026 en el pie). Monitores de terceros reportan incidencias intermitentes en jul–ago 2026 (<https://isitdownchecker.com/check/rawg.io>), fuente de baja fiabilidad métrica — se toma como señal débil de que la estabilidad no es perfecta, no como hecho. Históricamente monetizaron la API en 2021 cerrando el acceso sin key (<https://medium.com/rawg/dont-lose-your-access-to-rawg-api-df46eca95090>): existe precedente de cambios unilaterales de acceso.

### 2.2 Otras alternativas

No se ha verificado en fuentes primarias ninguna otra opción gratuita comparable que combine (acceso directo desde navegador + géneros/plataformas/fechas/popularidad/carátulas + vigencia 2026). La Steam Web API oficial cubre metadata de apps de Steam pero no un catálogo multiplataforma con popularidad global; quedó fuera del alcance de este ticket verificarla a fondo.

### 2.3 Comparativa rápida IGDB vs RAWG

| Criterio | IGDB (+ proxy) | RAWG (directo) |
|---|---|---|
| Acceso desde navegador | ❌ requiere proxy | ✅ directo |
| Secreto expuesto en cliente | Ninguno (proxy guarda secret) | API key visible (revocable, bajo riesgo) |
| Coste | 0 € (Worker free + API free) | 0 € |
| Cuota | 4 req/s, sin tope mensual documentado | 20.000 req/mes |
| Calidad metadatos | Excelente (fuente de Twitch), géneros/plataformas/fechas ricas | Buena, algo menos rica; popularidad = "añadidos a listas" |
| Popularidad/esperados | PopScore 24 h: visitas, wishlists, "Most Wishlisted Upcoming" | `ordering=-added` + `dates` |
| Requisito de atribución | No documentado para la API | Backlink obligatorio en pantalla |
| Infraestructura extra | Sí (un Worker, ~30–60 min de setup) | Ninguna |

---

## 3. Proxy serverless gratuito: Cloudflare Workers

Fuentes oficiales consultadas el 23-08-2026:

- **Límites del plan Free** (<https://developers.cloudflare.com/workers/platform/limits/>, doc actualizada 28-07-2026): **100.000 requests/día** (reset a medianoche UTC; error 1027 al superarlos), CPU 10 ms por invocación (suficiente: un proxy hace `fetch` passthrough, la espera de red no consume CPU), 50 subrequests/request, 128 MB memoria, 100 Workers por cuenta.
- **Precios** (<https://developers.cloudflare.com/workers/platform/pricing/>): el plan Free es el plan por defecto de cualquier cuenta; incluye también Workers KV (lecturas 100 k/día) por si se quiere caché server-side del token o de respuestas de Novedades.
- **Setup sin CLI** (<https://developers.cloudflare.com/workers/get-started/dashboard/>): crear cuenta → dashboard → Workers & Pages → Create application → deploy desde plantilla o repo Git conectado; el Worker queda publicado en un subdominio `workers.dev`. Los secrets (`CLIENT_ID`, `CLIENT_SECRET`) se definen como variables de entorno del Worker.

**Esfuerzo asumible por el usuario** (ya declaró que le importa crear credenciales OAuth):

1. Crear app en dev.twitch.tv (con 2FA previa en Twitch) → copiar `client_id` + `secret`. (~5 min)
2. Crear cuenta Cloudflare → crear Worker desde el dashboard → pegar ~40–60 líneas (obtener/cachear token, reenviar POST a IGDB, añadir cabecera `Access-Control-Allow-Origin`, opcionalmente `Cache-Control`) → pegar secrets → Deploy. (~15–30 min primera vez)
3. Pegar la URL `https://<worker>.workers.dev` como constante en la PWA. (~1 min)

Margen de uso: incluso refrescando Novedades a diario y buscando decenas de veces, el consumo personal queda en **decenas de requests/día** frente a 100.000 — sin riesgo práctico de agotar el plan free.

---

## 4. RECOMENDACIÓN

### Estrategia elegida: **mezcla — proxy Cloudflare Worker + IGDB para todo el contenido remoto, con copia local y snapshot ligero como red de seguridad**

**(a) Buscador "añadir juegos a mi biblioteca"**: la PWA llama al Worker; el Worker (único poseedor del secret) gestiona el token de Twitch (lo pide una vez, lo cachea ~60 días y lo renueva ante `401`) y reenvía la consulta a IGDB (`search "nombre"; fields name,first_release_date,genres.name,platforms.name,cover.image_id; where version_parent = null; limit 10;`). Al añadir, la app guarda en su `.json` local los campos mínimos + `cover.image_id`/URL `t_cover_big`; la carátula se descarga y cachea en Cache Storage (recordatorio: las imágenes eliminadas/reemplazadas permanecen 30 días en el CDN de IGDB, margen suficiente para cachear). Así la biblioteca sigue siendo 100 % local y offline, tal como exige el mapa.

**(b) Novedades**: mismo Worker contra IGDB:
- Recientes y calendario: `release_dates` con `sort date asc/desc` alrededor de hoy (ejemplos oficiales en los docs).
- Más populares: `popularity_primitives` con `popularity_type` de IGDB Visits (o combinación con Want to Play), `sort value desc`.
- Más esperados: primitiva "Most Wishlisted Upcoming".
El Worker puede cachear estas respuestas agregadas (Cache API/KV) con TTL de horas porque PopScore se actualiza cada 24 h. La app cachea el último resultado en Cache Storage y lo muestra si no hay red o IGDB falla (degradación elegante; cierra la duda abierta en map.md).

**Por qué no las alternativas**: acceso directo a IGDB imposible (sin CORS, por diseño); snapshot masivo en build-time inviable gratis (dumps solo para Data Partners); RAWG directo es viable pero inferior: 20 k req/mes, backlink obligatorio visible en la UI, popularidad menos afinada, y un historial de cambios unilaterales de acceso — se conserva como **plan B documentado** si algún día el usuario quisiera eliminar el Worker.

**Pasos de setup del usuario**: los tres del punto 3 (app Twitch + Worker en dashboard + constante en la app), ~30–60 min la primera vez, coste 0 €.

**Riesgos y mitigaciones**:
- *Cuota 4 req/s compartida por app*: mitigada con caché en Worker y serializando búsquedas; irrelevante para un solo usuario.
- *Token caduca (~60 días)*: el proxy lo renueva automáticamente al pedir uno nuevo tras `401`/expiración — cero acción del usuario.
- *Migración enum→tablas de IGDB en curso*: escribir las queries ya con los nombres de campo nuevos.
- *Cambio de condiciones de IGDB/Twitch o de Cloudflare free*: el plan B RAWG directo queda anotado; además la biblioteca local nunca depende de la API.
- *Dependencia de `*.workers.dev*`: funciona sin dominio propio; si se quisiera dominio propio sería opcional y también gratuito en el plan free.
