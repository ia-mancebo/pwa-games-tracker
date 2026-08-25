# 22 Â· CarÃ¡tulas offline (`covers-v1`)

**Status:** resolved
**Blocked by:** 21 Â· Alta â†’ Buscar online

## What to build

La siembra de carÃ¡tulas para que la biblioteca pueda verse completa sin conexiÃ³n:

- Al aÃ±adir/editar un juego con carÃ¡tula remota, la app la **siembra**: `fetch(url)` + `cache.put` en la cachÃ© dedicada `covers-v1`, compartida entre app y service worker. Ã‰xito observable = imagen mostrada; nunca persistir errores. Las respuestas opacas (`no-cors`, status 0) se aceptan; probar `crossorigin="anonymous"` contra el CDN y preferir CORS si responde.
- Limpieza de carÃ¡tulas huÃ©rfanas al importar.
- ExpiraciÃ³n prudencial: mÃ¡x. 500 entradas, edad mÃ¡xima 1 aÃ±o.

Nota: el servicio offline de estas imÃ¡genes lo completa la ruta runtime del service worker (ticket 25); este ticket entrega la siembra y la gestiÃ³n de la cachÃ© verificable en DevTools.

## Acceptance criteria

- [ ] AÃ±adir un juego con carÃ¡tula IGDB siembra su URL en `covers-v1` (visible en DevTools â†’ Cache Storage).
- [ ] Una respuesta fallida no se persiste como carÃ¡tula.
- [ ] Tras importar, las URLs sin dueÃ±o desaparecen de la cachÃ©.
- [ ] La cachÃ© respeta el lÃ­mite de 500 entradas / 1 aÃ±o de edad segÃºn polÃ­tica configurada.
