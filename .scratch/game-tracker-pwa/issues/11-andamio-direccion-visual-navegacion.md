# 11 Â· Andamio + direcciÃ³n visual + navegaciÃ³n

**Status:** resolved
**Blocked by:** None (can start immediately)

## What to build

Proyecto Vite arrancado con la pÃ¡gina Ãºnica y la direcciÃ³n visual aprobada (prototipo variante B): tema carbÃ³n cÃ¡lido con los tokens de Â§9, tipografÃ­as Space Grotesk + IBM Plex Mono, raÃ­l lateral fijo que colapsa a barra superior en mÃ³vil (<900 px), y las vistas Biblioteca / Novedades / EstadÃ­sticas como estado client-side (vacÃ­as por ahora), navegables sin recargas ni rutas de URL.

Incluye el setup de tooling de calidad para que los siguientes tickets puedan verificar: suite de tests ejecutable y lint/format en verde.

## Acceptance criteria

- [ ] La app arranca en dev y en build; se navega entre las tres vistas por estado client-side.
- [ ] Tokens del prototipo B aplicados: colores carbÃ³n cÃ¡lido, acentos semÃ¡nticos de estado, tipografÃ­as, pÃ­ldoras/chips/placas segÃºn spec Â§9.
- [ ] RaÃ­l lateral fijo (236 px) en escritorio; barra superior en mÃ³vil; cero desbordes de pÃ¡gina (`minmax(0, 1fr)`, chips `nowrap`).
- [ ] `:focus-visible` visible; animaciones discretas; respeta `prefers-reduced-motion`.
- [ ] Script de tests ejecutable con un test de humo verde; lint en verde.
