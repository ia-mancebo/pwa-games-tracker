# 21 Â· Alta â†’ Buscar online

**Status:** resolved
**Blocked by:** 16 Â· Alta manual Â· 20 Â· Proxy Cloudflare Worker para IGDB

## What to build

El camino online de la hoja de Alta funciona de punta a punta:

- BÃºsqueda contra el proxy IGDB con debounce 300 ms; resultados con carÃ¡tula y aÃ±o.
- Al elegir un resultado se precargan los datos compartidos (tÃ­tulo, carÃ¡tula `t_cover_big`, descripciÃ³n, gÃ©neros, plataformas, capturas mÃ¡x. 5, `igdbId`) y se crea la primera jugada.
- **Aviso de duplicados**: si el `igdbId` ya existe en la biblioteca, ofrecer abrir la ficha existente o crear otro igual.
- Sin conexiÃ³n o sin Worker configurado, el camino queda deshabilitado con motivo (comportamiento ya esbozado en 16, ahora real).
- El alta manual sigue funcionando exactamente igual.

## Acceptance criteria

- [ ] Buscar devuelve resultados con carÃ¡tula y aÃ±o; escribir filtra tras ~300 ms sin peticiÃ³n por tecla.
- [ ] Elegir un resultado crea el juego con todos los datos compartidos + primera jugada Quiero jugar.
- [ ] AÃ±adir dos veces el mismo juego avisa de duplicado y permite abrir la ficha existente o duplicar.
- [ ] Con la red cortada (o URL de Worker vacÃ­a), el camino online se deshabilita con motivo y el manual sigue operativo.
