Label: wayfinder:map

# Mapa · Game Tracker PWA — spec v1

## Destination

Una spec completa en `.scratch/game-tracker-pwa/spec.md`, en español, con todas las decisiones cerradas para construir el game tracker: PWA estática alojada en GitHub Pages, usable sin conexión, datos personales en un `.json` versionado. La implementación será otro esfuerzo aparte; este mapa termina cuando la spec esté redactada.

## Notes

- Dominio: glosario en `CONTEXT.md` en la raíz del repo.
- Cualquier trabajo de diseño UI debe consultar la skill `frontend-design`.
- Idioma de UI, spec y docs: español.
- El mapa lleva el esfuerzo hasta la spec escrita (ticket "Redactar spec.md"); escribir el código de la aplicación queda fuera de este mapa.
- Restricciones fijas ya acordadas: hosting GitHub Pages (el deploy lo hace el usuario personalmente); objetivo mínimo Android 11 con Chrome actualizado, más ordenador; app 100% usable sin conexión (carátulas cacheadas, no solo su URL); datos en un único `.json` definido por nosotros, versionado dentro del archivo, que el usuario sincroniza manualmente con una app de terceros (esa sincronización está fuera del desarrollo); guardado vía File System Access API donde esté disponible con fallback export/import; cuatro estados (quiero jugar, jugando, terminado, abandonado); valoración 1-5 estrellas permitida en cualquier estado; varias plataformas por entrada; géneros de la fuente de datos más etiquetas propias; dashboard de estadísticas dentro del alcance.
- Acceso a datos de juegos: enfoque mixto (biblioteca 100% local; novedades y buscador con la estrategia que resulte del research). Al usuario no le importa crear credenciales OAuth de Twitch si IGDB lo requiere; alternativas se valoran en el research.

## Decisions so far

- [01 · Research: estrategia de acceso a datos de juegos](issues/01-research-acceso-datos.md): proxy Cloudflare Worker gratuito delante de IGDB para buscador y Novedades — IGDB no soporta CORS por diseño, el Worker free (100k req/día) guarda el secret; PopScore y `release_dates` alimentan Novedades; RAWG directo queda como plan B; snapshot build-time inviable gratis. Detalle: `research/acceso-a-datos.md`.
- [02 · Research: persistencia y offline](issues/02-research-persistencia-offline.md): el `.json` es la única fuente de verdad con IndexedDB como espejo atómico offline (hash + flag dirty + UI de conflicto); FSA existe hoy en Chrome Android (132+) pero el permiso muere al cerrar sesión → reconexión manual y fallback export/import universal; carátulas cacheadas con `fetch()`+`cache.put()` y `navigator.storage.persist()`. Detalle: `research/persistencia-y-offline.md`.
- [03 · Prototype: stack técnico y dirección visual](issues/03-prototype-stack-direccion-visual.md): dirección = **mezcla A+B** (estantería por estados con límite de 6 por fila que despliega lista tipo panel con cambio de estado en radio y género en toggle; Novedades de A con drill-down; ficha de detalle con estado, valoración, descripción y galería; móvil sin desbordes) y **stack Vanilla JS + Vite + vite-plugin-pwa**. Prototipo (fuente primaria): `prototype/shell.html`.
- [04 · Grilling: esquema del .json v1](issues/04-grilling-esquema-json.md): raíz `{schema, version, updatedAt, games}`; el **juego** guarda una sola vez los datos compartidos (géneros, plataformas disponibles, carátula, descripción, capturas, etiquetas inline) y cada **jugada** lo vivido (estado en tokens ingleses, valoración 1–5, plataforma efectiva con `id: null` para propias como emuladores, fechas, notas); mínimo una jugada por juego; duplicados permitidos con aviso; migraciones forward-only y rechazo explícito de versiones futuras. El glosario cambia: Juego + Jugada sustituyen a Entrada.
- [10 · Research: build y service worker para GitHub Pages](issues/10-research-build-github-pages.md): `base: '/<repo>/'` + vite-plugin-pwa `generateSW` (precache del build, navigateFallback index.html por defecto) con `registerType: 'prompt'` y una ruta `runtimeCaching` que lee/escribe la misma caché `covers-v1` de la app; manifest con iconos 192/512 maskable y `display: standalone` instala en Android 11 Chrome 2026; deploy vía Actions; límites Pages (sitio 1 GB, banda soft 100 GB/mes, builds soft 10/h no aplicables con Actions) sin fricción. Detalle: `research/build-github-pages.md`.
- [05 · Grilling: flujo de guardado y carga del .json](issues/05-grilling-flujo-guardado.md): autoguardado con debounce de 15 s al archivo conectado (fallo de escritura nunca bloquea; sin FSA, vuelco manual); reconexión silenciosa entre sesiones con pastilla; conflicto real a 3 opciones sin merge usando el `updatedAt` de cada documento; elección deliberada de archivo gana siempre sin conflicto; segunda pestaña en solo lectura vía Web Locks; backups rotativos OPFS (últimos 3) dentro de v1; export/import universal con nombre personalizable local y «Compartir copia» en Android.
- [06 · Grilling: Novedades sin conexión o con el proxy caído](issues/06-grilling-novedades-offline.md): instantánea atómica del tablón (12/12/6/6, 36 juegos) en caché `novedades-v1` con sello «Actualizado» permanente y banner a los 7 días; carátulas de la instantánea en `covers-v1`; refresco auto >12 h + botón + reintento al reconectar; un único modo degradado no bloqueante con motivo y Reintentar; estado vacío explicativo sin caché; recorrido completo y «➕ Quiero jugarlo» funcionan offline; galerías solo online. Glosario: nueva «Instantánea de Novedades».
- [07 · Grilling: dashboard de estadísticas](issues/07-grilling-dashboard-estadisticas.md): solo lectura con filtros globales (plataforma, género, etiqueta propia; selección única, acumulables entre dimensiones) que recomputan todo; KPIs (4 estados + total + media ★), barras de distribución (plataforma por catálogo, género, etiqueta), terminados por mes de los últimos 12 (cuenta jugadas) y Top 5 mejor valorados clicable a ficha; los juegos cuentan una vez según el «Estado del juego» (jugada más reciente). Glosario: nuevo «Estado del juego».
- [08 · Grilling: biblioteca — búsqueda, filtros y edición](issues/08-grilling-biblioteca-filtros.md): búsqueda (título + géneros + plataformas + etiquetas propias, insensible a tildes) y tres dimensiones de filtro con selección única acumulable entre dimensiones, presentes en estantería y panel; orden por recencia de la última jugada con desempate alfabético; alta en dos caminos (buscador IGDB online / manual, estado inicial Quiero jugar) con aviso de duplicados; ficha edita jugadas en línea y «Añadir jugada» nace Jugando heredando plataforma; borrado de juego y jugada con confirmación y sin deshacer (red: backups OPFS); objetivo 5.000 juegos fluidos, panel paginado en bloques de 100. Glosario: nuevos «Estantería», «Panel», «Ficha» y «Alta».
- [09 · Task: redactar spec.md](issues/09-task-redactar-spec.md): spec completa escrita en `.scratch/game-tracker-pwa/spec.md` — 14 secciones que consolidan todas las decisiones cerradas (dominio, esquema v1, stack, proxy IGDB, persistencia y conflictos, offline, UX por pestaña, dirección visual, PWA/SW, build Pages) más fuera de alcance. **El mapa queda completo: la spec es el destino alcanzado.**

## Not yet specified

<!-- nada: la spec v1 está escrita y no queda niebla antes del destino -->

## Out of scope

- Migraciones concretas entre versiones del esquema `.json` posteriores a la v1: la política (forward-only, rechazo explícito, aditivo no bumpea) queda fijada en la spec §4.4; definir cada migración futura es trabajo de otro esfuerzo.
- Multiusuario y autenticación.
- Importación desde Steam u otras plataformas/bibliotecas.
- Funciones sociales (compartir listas, amigos, valoraciones públicas).
- Backend persistente propio (un proxy serverless puntual para llamar a APIs públicas sí está permitido).
- Horas jugadas por entrada (descartado durante el grill inicial).
- El deploy a GitHub Pages y la sincronización con la app de terceros: son acciones manuales del usuario, fuera del desarrollo.
