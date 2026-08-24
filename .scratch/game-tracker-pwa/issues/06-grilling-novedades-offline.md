# 06 · Grilling: Novedades sin conexión o con el proxy caído

Type: grilling
Status: resolved

## Question

¿Qué ve el usuario en la pestaña Novedades sin conexión o cuando el Worker/IGDB falla?

- El research 01 recomendó cachear el último resultado en Cache Storage y mostrarlo como degradación elegante; esta sesión cierra el detalle: caducidad visible (fecha/hora del último refresco), aviso de antigüedad, qué se muestra si no hay ninguna caché.
- Encaje con el diseño cerrado en el ticket 03 (tira de meses, baldas, drill-down, fichas de detalle con «➕ Quiero jugarlo»).

Skills: `grilling` + `domain-modeling`.

## Answer

**Decisión cerrada (grill HITL).** Comportamiento de Novedades sin conexión o con el Worker/IGDB caído:

- **Instantánea atómica**: en cada refresco con éxito se guarda en Cache Storage (caché `novedades-v1`) una única instantánea con todo el tablón — recientes, próximos, populares, esperados — más el sello fecha/hora del refresco. Composición: **12/12/6/6 (36 juegos)**; cada juego lleva los campos necesarios para poblar la ficha y el alta local (título, carátula, géneros, plataformas, descripción, fecha de lanzamiento). Peso ≈ 0,5–1,5 MB por refresco. Las **36 carátulas** `cover_big` se cachean además en `covers-v1` (la caché compartida con la app, coherente con el ticket 10).
- **Refresco**: automático al abrir la pestaña si la instantánea tiene más de **12 h** y hay conexión; botón manual siempre disponible; al volver la red (`online`) un reintento automático silencioso (si falla, queda el botón). Un solo sello para todo el tablón.
- **Antigüedad visible**: sello permanente discreto «Actualizado: fecha/hora» en la cabecera, y **banner destacado no bloqueante cuando la instantánea supera los 7 días** (el calendario de próximos ya es poco fiable).
- **Modo degradado único** (sin conexión o fallo del servicio): el tablón se sirve desde la instantánea con una banda fina no bloqueante indicando el motivo («Sin conexión» / «No se pudo contactar con el servicio») y botón Reintentar. No hay dos tratamientos visuales distintos.
- **Sin caché (primera vez o datos borrados)**: estado vacío explicativo — «Novedades necesita conexión la primera vez para descargar el calendario» — con botón Reintentar.
- **Usabilidad sobre la instantánea**: todo el recorrido funciona local — tira de meses, baldas, filtros, drill-down, ficha de detalle — y **«➕ Quiero jugarlo» crea la entrada «Quiero jugar»** con los campos de la instantánea (operación 100 % local). Las **galerías de capturas solo online** (no se descargan en el snapshot).
- **Glosario**: nuevo término «Instantánea de Novedades» añadido a `CONTEXT.md`.
