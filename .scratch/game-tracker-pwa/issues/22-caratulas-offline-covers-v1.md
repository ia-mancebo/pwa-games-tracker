# 22 · Carátulas offline (`covers-v1`)

**Status:** ready-for-agent
**Blocked by:** 21 · Alta → Buscar online

## What to build

La siembra de carátulas para que la biblioteca pueda verse completa sin conexión:

- Al añadir/editar un juego con carátula remota, la app la **siembra**: `fetch(url)` + `cache.put` en la caché dedicada `covers-v1`, compartida entre app y service worker. Éxito observable = imagen mostrada; nunca persistir errores. Las respuestas opacas (`no-cors`, status 0) se aceptan; probar `crossorigin="anonymous"` contra el CDN y preferir CORS si responde.
- Limpieza de carátulas huérfanas al importar.
- Expiración prudencial: máx. 500 entradas, edad máxima 1 año.

Nota: el servicio offline de estas imágenes lo completa la ruta runtime del service worker (ticket 25); este ticket entrega la siembra y la gestión de la caché verificable en DevTools.

## Acceptance criteria

- [ ] Añadir un juego con carátula IGDB siembra su URL en `covers-v1` (visible en DevTools → Cache Storage).
- [ ] Una respuesta fallida no se persiste como carátula.
- [ ] Tras importar, las URLs sin dueño desaparecen de la caché.
- [ ] La caché respeta el límite de 500 entradas / 1 año de edad según política configurada.
