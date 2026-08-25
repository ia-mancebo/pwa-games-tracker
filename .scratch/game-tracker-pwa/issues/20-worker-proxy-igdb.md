# 20 Â· Proxy Cloudflare Worker para IGDB

**Status:** resolved
**Blocked by:** None (can start immediately) â€” pieza independiente desplegada por el usuario

## What to build

El proxy que resuelve el bloqueo CORS de IGDB sin exponer secretos en el cliente:

- CÃ³digo del Worker (~50 lÃ­neas, plan free) listo para pegar en el dashboard de Cloudflare: secrets `CLIENT_ID`/`CLIENT_SECRET`, nunca en el navegador.
- Token de Twitch vÃ­a client credentials: pedido una vez, cacheado, renovado ante `401`/expiraciÃ³n (~60 dÃ­as).
- Endpoint de **bÃºsqueda** Apicalypse: `search "â€¦" games where version_parent = null`; campos nombre, aÃ±o, gÃ©neros, plataformas, `cover.image_id`, descripciÃ³n.
- Endpoints de **Novedades**: recientes y calendario vÃ­a `release_dates` (sort asc/desc alrededor de hoy); populares vÃ­a PopScore (Â«IGDB VisitsÂ», sort value desc); esperados vÃ­a primitiva Â«Most Wishlisted UpcomingÂ». CachÃ© agregada con TTL de horas (PopScore ~24 h).
- Contrato JSON documentado que consumirÃ¡n los tickets 21 y 23.
- README con la guÃ­a de setup verificada (~30â€“60 min): app en dev.twitch.tv (con 2FA) â†’ pegar cÃ³digo + secrets en Cloudflare â†’ obtener URL `https://<worker>.workers.dev`.

## Acceptance criteria

- [ ] Un Worker desplegado responde bÃºsqueda y los tres conjuntos de Novedades conforme al contrato documentado.
- [ ] El token de Twitch se cachea y se renueva solo ante 401/expiraciÃ³n.
- [ ] Respuestas repetidas de Novedades salen de cachÃ© dentro del TTL (verificable por tiempo de respuesta/logs).
- [ ] README permite a un usuario nuevo completar setup y deploy sin ayuda adicional.
