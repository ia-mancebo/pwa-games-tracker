# 03 · Prototype: stack técnico y dirección visual

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

¿Qué stack técnico usamos y qué dirección visual sigue la app?

- Prototipo barato y navegable del shell (Biblioteca / Novedades / Estadísticas) con sesgo de tema oscuro, hecho con la skill `frontend-design`.
- Comparar en el propio prototipo las opciones de stack viables para GitHub Pages + PWA offline que dejen abiertas el research (01) y el research (02).
- El usuario reacciona al prototipo y se cierra: framework/herramientas elegidos y dirección visual aprobada.

Skill: `prototype` (+ `frontend-design`).

## Answer

**Decisión cerrada el 23-08-2026 tras iteración HITL sobre el prototipo** (`.scratch/game-tracker-pwa/prototype/shell.html`, variante B «Mezcla A+B» — fuente primaria de esta decisión; desechable, datos ficticios, estado en memoria; el repo no tiene git, así que no hay rama throwaway).

**Dirección visual: mezcla A+B**

- **Cromatura general = B (panel)**: raíl lateral con navegación y widgets, listas densas, Space Grotesk + IBM Plex Mono, tema carbón cálido oscuro donde las carátulas llevan el color; acentos semánticos por estado (quiero jugar ámbar, jugando verde, terminado violeta, abandonado rust).
- **Biblioteca por defecto = estantería de A**: una balda por estado con placa-etiqueta (nombre, conteo, media ★); límite de 6 portadas por fila y tarjeta «+N más» al final de cada balda.
- **Despliegue a lista**: pulsar la placa de un estado o «+N más» abre la lista densa estilo B (portada mini, título, etiquetas propias, plataformas, valoración, píldora de estado). Los chips de otros estados **cambian** de lista (radio, no acumulan); los chips de género son de selección única (toggle) y filtran dentro del estado; la búsqueda filtra dentro de la vista; «← Estantería» vuelve.
- **Novedades = layout de A**: tira de meses con scroll horizontal (padding de scroll, sin cortes secos) + baldas de tarjetas con badge de fecha; las placas «Recién salidos» / «Próximamente» despliegan su lista (con portadas, filtro por género y cambio de sección).
- **Ficha de detalle** (pulsando cualquier juego, fila o tarjeta): portada, píldora de estado, título, valoración por estrellas clicables (+ «quitar»), descripción, plataformas, géneros, etiquetas propias, fecha de fin, chips de estado para cambiarlo y galería de capturas si existe. En Novedades añade fecha/interés y el botón «➕ Quiero jugarlo», que crea la entrada como «Quiero jugar» conservando descripción y galería.
- **Estadísticas = B**: KPIs (número grande + etiqueta con espaciado) y barras por plataforma, género y terminados por año.
- **Móvil**: el raíl colapsa a barra superior; chips con nowrap + flex-shrink:0 envuelven sin solaparse; buscador a ancho completo; tablas simplificadas; cero desbordes de página (grid en minmax(0,1fr), scroll horizontal solo dentro de baldas, tira de meses y galería).

**Stack: Vanilla JS + Vite + vite-plugin-pwa** (service worker + manifest). Sin framework de UI. El Worker de Cloudflare delante de IGDB (ticket 01) es pieza aparte y compatible.

Decisiones abiertas que este prototipo deja anotadas para sus tickets: modelo completo de filtros (plataforma, acumulación) y ordenación → ticket 08; comportamiento offline de Novedades → ticket 06; build/SW para Pages → ticket 10.
