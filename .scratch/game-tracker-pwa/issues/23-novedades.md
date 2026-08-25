# 23 Â· Novedades

**Status:** resolved
**Blocked by:** 20 Â· Proxy Cloudflare Worker para IGDB Â· 22 Â· CarÃ¡tulas offline (`covers-v1`) Â· 16 Â· Alta manual

## What to build

El tablÃ³n completo, online y degradado:

- **Refresco**: automÃ¡tico al abrir la pestaÃ±a si la instantÃ¡nea tiene >12 h y hay conexiÃ³n; botÃ³n manual siempre; reintento automÃ¡tico silencioso al volver la red.
- **InstantÃ¡nea atÃ³mica** en su propio store: composiciÃ³n 12 recientes / 12 prÃ³ximos / 6 populares / 6 esperados = 36 juegos, cada uno con los campos para poblar ficha y alta local (tÃ­tulo, carÃ¡tula, gÃ©neros, plataformas, descripciÃ³n, fecha de lanzamiento). Las 36 carÃ¡tulas se cachean ademÃ¡s en `covers-v1`; las capturas quedan fuera (solo online).
- **Sello permanente discreto** Â«Actualizado: fecha/horaÂ» en cabecera + banner destacado no bloqueante cuando la instantÃ¡nea supera 7 dÃ­as.
- **Modo degradado Ãºnico** (sin conexiÃ³n o fallo del servicio): tablÃ³n servido desde la instantÃ¡nea con banda fina no bloqueante indicando el motivo (Â«Sin conexiÃ³nÂ» / Â«No se pudo contactar con el servicioÂ») + Reintentar. **Sin cachÃ©**: estado vacÃ­o explicativo (Â«Novedades necesita conexiÃ³n la primera vezâ€¦Â») con Reintentar.
- **Layout**: tira de meses con scroll horizontal + baldas de tarjetas con badge de fecha; placas de secciÃ³n despliegan su lista (portadas, filtro por gÃ©nero).
- **Ficha de detalle externa** desde Novedades con fecha/interÃ©s y botÃ³n **Â«âž• Quiero jugarloÂ»**: crea la entrada local como Quiero jugar conservando descripciÃ³n y galerÃ­a â€” operaciÃ³n 100 % local.

## Acceptance criteria

- [ ] Primer refresco con conexiÃ³n puebla el tablÃ³n 12/12/6/6 y guarda instantÃ¡nea atÃ³mica + 36 carÃ¡tulas.
- [ ] Sin conexiÃ³n, el tablÃ³n se sirve desde la instantÃ¡nea con banda de motivo y Reintentar; todo el recorrido funciona offline.
- [ ] InstantÃ¡nea >7 dÃ­as â†’ banner visible sin bloquear; sello Â«ActualizadoÂ» siempre presente.
- [ ] Refresco automÃ¡tico ocurre solo si >12 h y hay conexiÃ³n; al volver la red hay reintento silencioso.
- [ ] Â«âž• Quiero jugarloÂ» crea el juego local como Quiero jugar sin necesitar red, y aparece en Biblioteca.
