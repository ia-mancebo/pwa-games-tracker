# 20 · Proxy Cloudflare Worker para IGDB

**Status:** ready-for-agent
**Blocked by:** None (can start immediately) — pieza independiente desplegada por el usuario

## What to build

El proxy que resuelve el bloqueo CORS de IGDB sin exponer secretos en el cliente:

- Código del Worker (~50 líneas, plan free) listo para pegar en el dashboard de Cloudflare: secrets `CLIENT_ID`/`CLIENT_SECRET`, nunca en el navegador.
- Token de Twitch vía client credentials: pedido una vez, cacheado, renovado ante `401`/expiración (~60 días).
- Endpoint de **búsqueda** Apicalypse: `search "…" games where version_parent = null`; campos nombre, año, géneros, plataformas, `cover.image_id`, descripción.
- Endpoints de **Novedades**: recientes y calendario vía `release_dates` (sort asc/desc alrededor de hoy); populares vía PopScore («IGDB Visits», sort value desc); esperados vía primitiva «Most Wishlisted Upcoming». Caché agregada con TTL de horas (PopScore ~24 h).
- Contrato JSON documentado que consumirán los tickets 21 y 23.
- README con la guía de setup verificada (~30–60 min): app en dev.twitch.tv (con 2FA) → pegar código + secrets en Cloudflare → obtener URL `https://<worker>.workers.dev`.

## Acceptance criteria

- [ ] Un Worker desplegado responde búsqueda y los tres conjuntos de Novedades conforme al contrato documentado.
- [ ] El token de Twitch se cachea y se renueva solo ante 401/expiración.
- [ ] Respuestas repetidas de Novedades salen de caché dentro del TTL (verificable por tiempo de respuesta/logs).
- [ ] README permite a un usuario nuevo completar setup y deploy sin ayuda adicional.
