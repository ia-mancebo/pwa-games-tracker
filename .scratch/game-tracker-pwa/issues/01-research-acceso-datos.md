# 01 · Research: estrategia de acceso a datos de juegos

Type: research
Status: resolved
Blocked by:

## Question

¿Cómo accede la PWA (estática, en GitHub Pages, sin backend propio) a los datos de juegos que necesita el buscador y la pestaña Novedades? Verificar con fuentes primarias y fecha actual (2026):

1. **IGDB**: flujo OAuth de Twitch (client credentials), si `api.igdb.com` permite CORS desde navegador, qué implica exponer el secret en un cliente estático, rate limits, y su CDN de imágenes (carátulas: URLs, hotlinking, caché).
2. **Alternativas** con acceso directo desde navegador: p.ej. RAWG (CORS, cuota gratuita, estado del servicio hoy) u otras comparables.
3. **Proxy serverless gratuito** (p.ej. Cloudflare Workers) para envolver IGDB: límites del plan gratuito, esfuerzo de setup para el usuario.
4. **Recomendación**: una estrategia concreta (directa / proxy / snapshot en build-time / mezcla) para (a) buscar y añadir juegos a la biblioteca y (b) alimentar Novedades, con pasos de setup que asumiría el usuario.

## Answer

**Recomendación: proxy Cloudflare Worker (plan free) delante de IGDB para buscador y Novedades, con copia local en el `.json` y caché de carátulas/respuestas como red de seguridad offline.**

- IGDB **no soporta CORS** (afirmación literal de sus docs oficiales): el acceso directo desde navegador está descartado por diseño, y exponer el client secret en un cliente estático contradice además el flujo client-credentials de Twitch (pensado para server-to-server). Un Worker gratuito resuelve CORS + secret: 100.000 req/día gratis, setup de ~30–60 min sin CLI (app Twitch + pegar ~50 líneas en el dashboard de Cloudflare).
- IGDB cubre todo Novedades con datos frescos cada 24 h: recientes/calendario vía `release_dates`, populares vía PopScore (`popularity_primitives`, tipo "IGDB Visits") y más esperados vía primitiva "Most Wishlisted Upcoming". Rate limit 4 req/s + 8 concurrentes, sobrado para uso personal con caché.
- Carátulas: URLs construidas `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg` (p. ej. `cover_big` 264×374, variantes `_2x`); hotlinking no está prohibido; las imágenes eliminadas/reemplazadas permanecen 30 días → tiempo de sobra para cachearlas en Cache Storage.
- Snapshot masivo en build-time inviable gratis (los dumps CSV son solo para Data Partners comerciales). RAWG directo es el plan B viable (CORS sí, key simple, 20.000 req/mes) pero exige backlink visible a RAWG, tiene menos riqueza de datos y precedentes de cambios unilaterales de acceso.
- Riesgos gestionados: token se renueva solo en el proxy (~60 días); usar ya los nombres de campo nuevos de la migración enum→tablas que IGDB tiene en curso; la biblioteca local nunca depende de la API.

Informe completo con citas: [research/acceso-a-datos.md](../research/acceso-a-datos.md)
