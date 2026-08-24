# 11 · Andamio + dirección visual + navegación

**Status:** ready-for-agent
**Blocked by:** None (can start immediately)

## What to build

Proyecto Vite arrancado con la página única y la dirección visual aprobada (prototipo variante B): tema carbón cálido con los tokens de §9, tipografías Space Grotesk + IBM Plex Mono, raíl lateral fijo que colapsa a barra superior en móvil (<900 px), y las vistas Biblioteca / Novedades / Estadísticas como estado client-side (vacías por ahora), navegables sin recargas ni rutas de URL.

Incluye el setup de tooling de calidad para que los siguientes tickets puedan verificar: suite de tests ejecutable y lint/format en verde.

## Acceptance criteria

- [ ] La app arranca en dev y en build; se navega entre las tres vistas por estado client-side.
- [ ] Tokens del prototipo B aplicados: colores carbón cálido, acentos semánticos de estado, tipografías, píldoras/chips/placas según spec §9.
- [ ] Raíl lateral fijo (236 px) en escritorio; barra superior en móvil; cero desbordes de página (`minmax(0, 1fr)`, chips `nowrap`).
- [ ] `:focus-visible` visible; animaciones discretas; respeta `prefers-reduced-motion`.
- [ ] Script de tests ejecutable con un test de humo verde; lint en verde.
