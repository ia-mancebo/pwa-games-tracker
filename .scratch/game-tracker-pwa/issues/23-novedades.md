# 23 · Novedades

**Status:** ready-for-agent
**Blocked by:** 20 · Proxy Cloudflare Worker para IGDB · 22 · Carátulas offline (`covers-v1`) · 16 · Alta manual

## What to build

El tablón completo, online y degradado:

- **Refresco**: automático al abrir la pestaña si la instantánea tiene >12 h y hay conexión; botón manual siempre; reintento automático silencioso al volver la red.
- **Instantánea atómica** en su propio store: composición 12 recientes / 12 próximos / 6 populares / 6 esperados = 36 juegos, cada uno con los campos para poblar ficha y alta local (título, carátula, géneros, plataformas, descripción, fecha de lanzamiento). Las 36 carátulas se cachean además en `covers-v1`; las capturas quedan fuera (solo online).
- **Sello permanente discreto** «Actualizado: fecha/hora» en cabecera + banner destacado no bloqueante cuando la instantánea supera 7 días.
- **Modo degradado único** (sin conexión o fallo del servicio): tablón servido desde la instantánea con banda fina no bloqueante indicando el motivo («Sin conexión» / «No se pudo contactar con el servicio») + Reintentar. **Sin caché**: estado vacío explicativo («Novedades necesita conexión la primera vez…») con Reintentar.
- **Layout**: tira de meses con scroll horizontal + baldas de tarjetas con badge de fecha; placas de sección despliegan su lista (portadas, filtro por género).
- **Ficha de detalle externa** desde Novedades con fecha/interés y botón **«➕ Quiero jugarlo»**: crea la entrada local como Quiero jugar conservando descripción y galería — operación 100 % local.

## Acceptance criteria

- [ ] Primer refresco con conexión puebla el tablón 12/12/6/6 y guarda instantánea atómica + 36 carátulas.
- [ ] Sin conexión, el tablón se sirve desde la instantánea con banda de motivo y Reintentar; todo el recorrido funciona offline.
- [ ] Instantánea >7 días → banner visible sin bloquear; sello «Actualizado» siempre presente.
- [ ] Refresco automático ocurre solo si >12 h y hay conexión; al volver la red hay reintento silencioso.
- [ ] «➕ Quiero jugarlo» crea el juego local como Quiero jugar sin necesitar red, y aparece en Biblioteca.
