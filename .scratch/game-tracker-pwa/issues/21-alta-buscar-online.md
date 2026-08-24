# 21 · Alta → Buscar online

**Status:** ready-for-agent
**Blocked by:** 16 · Alta manual · 20 · Proxy Cloudflare Worker para IGDB

## What to build

El camino online de la hoja de Alta funciona de punta a punta:

- Búsqueda contra el proxy IGDB con debounce 300 ms; resultados con carátula y año.
- Al elegir un resultado se precargan los datos compartidos (título, carátula `t_cover_big`, descripción, géneros, plataformas, capturas máx. 5, `igdbId`) y se crea la primera jugada.
- **Aviso de duplicados**: si el `igdbId` ya existe en la biblioteca, ofrecer abrir la ficha existente o crear otro igual.
- Sin conexión o sin Worker configurado, el camino queda deshabilitado con motivo (comportamiento ya esbozado en 16, ahora real).
- El alta manual sigue funcionando exactamente igual.

## Acceptance criteria

- [ ] Buscar devuelve resultados con carátula y año; escribir filtra tras ~300 ms sin petición por tecla.
- [ ] Elegir un resultado crea el juego con todos los datos compartidos + primera jugada Quiero jugar.
- [ ] Añadir dos veces el mismo juego avisa de duplicado y permite abrir la ficha existente o duplicar.
- [ ] Con la red cortada (o URL de Worker vacía), el camino online se deshabilita con motivo y el manual sigue operativo.
