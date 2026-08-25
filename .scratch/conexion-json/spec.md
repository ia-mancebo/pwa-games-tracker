# Spec · Conexión en el archivo de datos

Status: ready-for-agent
Feature slug: conexion-json
Origen: sesión de grilling + implementación ya verificada (typecheck ✓ · lint ✓ · 324 tests ✓)

## Problem Statement

La única usuaria de la app la usa como PWA instalada desde GitHub Pages, en varios dispositivos, y sincroniza su biblioteca por sus propios medios con un archivo de datos personal. La URL del proxy IGDB se guardaba en el almacenamiento del navegador, así que:

- Cada dispositivo o navegador nuevo exigía volver a configurar la conexión a mano.
- El campo de configuración vivía en un lugar poco natural (la hoja de «Añadir juego», camino online deshabilitado), sin relación con el resto de ajustes del archivo.
- El proxy respondía con CORS abierto a cualquier origen: cualquiera que descubriera la URL podría quemar la cuota de la API de la usuaria.
- Además, la usuaria quería entender dónde vivían las credenciales de Twitch/IGDB y por qué no podía integrarse directamente con ellas en su JSON.

## Solution

Una única pieza de configuración llamada **Conexión** (glosario): la URL del proxy IGDB. Vive DENTRO del archivo de datos personal de la Biblioteca, así que viaja con él: al conectar el mismo `.json` en otro dispositivo, la configuración ya está. Se edita en **Datos → Conexión**, con confirmación y errores inline, protegida en pestañas de solo lectura. Las credenciales NO forman parte de la app ni del JSON: se pegan una sola vez como *Secrets* del Cloudflare Worker, que actúa de escudo CORS/token. El Worker restringe su origen autorizado al de GitHub Pages de la usuaria mediante una constante-placeholder que debe sustituirse antes del Deploy.

## User Stories

1. Como única usuaria de la app, quiero guardar la URL de mi proxy IGDB en la sección «Conexión» del diálogo Datos, para tener todos los ajustes de conexión en un solo lugar visible.
2. Como única usuaria, quiero que la Conexión se guarde dentro de mi archivo de datos personal, para que viaje con mi biblioteca cuando lo sincronice o lo comparta entre dispositivos.
3. Como única usuaria, quiero que al conectar mi `.json` en otro dispositivo la Conexión ya esté configurada, para no repetir el paso de pegado en cada navegador.
4. Como única usuaria, quiero que la misma URL alimente «Buscar online» del Alta y la pestaña Novedades, para configurar un solo valor.
5. Como única usuaria, quiero empezar con la Conexión vacía tras este cambio, para adoptarlo sin migraciones mágicas y pegar mi URL una vez conscientemente.
6. Como única usuaria, quiero que una URL con espacios o barra final se normalice al guardarla, para no fallar por detalles de pegado.
7. Como única usuaria, quiero un aviso claro si pego algo que no es una URL http(s), para corregirlo sin haber estropeado mi archivo.
8. Como única usuaria, quiero que una URL inválida se revierta automáticamente, para que mi Conexión anterior (o su ausencia) quede intacta tras un error.
9. Como única usuaria, quiero poder borrar la Conexión vaciando el campo, para dejar la app sin servicio de forma deliberada.
10. Como única usuaria, quiero confirmación inline («Conexión guardada: …») tras guardar, para saber que el valor quedó en mi archivo.
11. Como única usuaria, quiero que la edición esté bloqueada en una pestaña secundaria de solo lectura, para que ninguna pestaña vieja corrompa mi archivo.
12. Como única usuaria, quiero que el campo inline desaparezca de la hoja de Alta, para que la configuración no conviva con el alta de juegos.
13. Como única usuaria, quiero que el motivo «Sin servicio configurado — añade la URL del proxy en Datos» me lleve mentalmente a Datos, para saber siempre dónde arreglarlo.
14. Como única usuaria, quiero que Buscar online solo se active con Conexión configurada Y conexión de red, para distinguir fallos de configuración de fallos de red.
15. Como única usuarie, quiero que Novedades siga entrando en modo degradado con la última Instantánea cuando la Conexión falle, para no perder el tablón offline.
16. Como única usuaria, quiero que mi proxy solo acepte peticiones desde mi origen de GitHub Pages, para que nadie más pueda quemar mi cuota aunque descubra la URL.
17. Como única usuaria, quiero que el código entregado del Worker traiga un placeholder evidente del origen, para no desplegar por accidente con CORS mal configurado.
18. Como única usuaria, quiero verificar el deploy con `/api/health` antes de configurar nada, para separar problemas del Worker de problemas de configuración.
19. Como única usuaria, quiero que mis credenciales de Twitch/IGDB vivan SOLO como Secrets del Worker, para que ni el navegador ni mi JSON las contengan jamás.
20. Como única usuaria, quiero que la validación rechace campos desconocidos dentro de `connection`, para que archivos manipulados a mano no entren silenciosamente.
21. Como única usuaria, quiero que exportar, compartir copia, backups y restauración incluyan la Conexión, porque es parte del documento validado.
22. Como agente futuro, quiero un término de glosario («Conexión») y esta spec, para entender qué viaja en el archivo y qué no sin leer código.
23. Como desarrollador, quiero que el contrato del Worker documente el origen restringido, para que cliente y proxy no diverjan silenciosamente.

## Implementation Decisions

- **Esquema**: campo raíz opcional `connection` en el documento v1, objeto con la clave opcional `workerUrl` (string). Sin bump de versión: cambio aditivo. La ausencia total significa «sin conexión»; objeto vacío también es válido.
- **Validación de forma**: claves desconocidas dentro de `connection` se rechazan igual que en el resto de la raíz (mismo estilo estricto del validador); `workerUrl` debe ser string o estar ausente. La política forward-only y la copia normalizada del validador se mantienen intactas.
- **Normalización**: recorte de espacios laterales y barras finales, aplicada al guardar y, defensivamente, al leer. Helper puro junto al resto de primitivas del esquema.
- **Persistencia**: guardar/quitar la Conexión es una mutación atómica más del repositorio (clona → muta → valida → persiste espejo IDB → marca dirty), heredando autosave hacia el archivo conectado y el flujo de conflictos existente. Devuelve la URL normalizada para feedback.
- **Lectura**: el cliente del servicio lee la URL del documento cargado en el store en memoria (no de IndexedDB ni de localStorage), con tolerancia si no hay biblioteca cargada. `isConfigured()` sigue exigiendo URL http(s).
- **Sin migración**: la antigua clave de navegador se abandona sin leerla ni borrarla (decisión explícita de la usuaria: arranque vacío).
- **UI**: nueva sección «Conexión» en el diálogo Datos (patrón input + botón + nota/error inline ya existente). Comportamiento preservado de la affordance anterior: revertir ante URL no http(s) y avisar. Guard bloqueado por rol de pestaña antes de mutar. Se elimina el campo inline de la hoja de Alta junto con sus estilos muertos; el motivo de camino deshabilitado apunta a Datos.
- **Worker**: constante de origen autorizado entregada como placeholder evidente (`TU-USUARIO.github.io`) con comentario de advertencia; sustitución obligatoria pre-Deploy. Contrato actualizado para describir el origen restringido en vez de `*`.
- **Documentos vivos**: README (paso 3) y guía del Worker actualizados al nuevo flujo Datos → Conexión. La spec histórica del tracker queda como registro sin tocar. Glosario: nueva entrada «Conexión» (ajustes que ligan la app a su Fuente de datos; viajan en el archivo; nunca incluyen credenciales).
- **Credenciales**: decisión de arquitectura ratificada: solo en el Worker (spec §6 se mantiene); se descartó explícitamente la variante BYO (credenciales enviadas desde la app) y cualquier llamada directa navegador→IGDB (CORS de IGDB cerrado por diseño).

## Testing Decisions

- Un buen test comprueba comportamiento externo: qué ve la usuaria y qué queda en su documento; nunca internals como llamadas a primitivas de bajo nivel.
- Cuatro seams acordados, ninguno nuevo:
  1. **Diálogo Datos (DOM)**: abrir, escribir URL, guardar, assert sobre doc + feedback inline; cubre guardado, reversión inválida, borrado y solo-lectura. Prior art: suite del diálogo Datos.
  2. **Store como fuente**: siembra directa del documento en memoria para probar lecturas del cliente IGDB (URL vacía, normalizada, no-http). Prior art: suite del cliente IGDB.
  3. **Validador puro**: aceptación/rechazo de formas de `connection`. Prior art: suite del validador.
  4. **Contrato del Worker**: suite propia de la pieza desplegable, ya existente.
- Los tests de caminos online/novedades pasaron de sembrar localStorage a sembrar el doc mediante un helper compartido de soporte, manteniéndolos conductuales (qué petición se emite y con qué URL).
- Cobertura nueva añadida en los tres primeros seams; la cuarta no requería cambios.

## Out of Scope

- BYO-credentials: enviar Client ID/Secret desde la app al Worker (descartada en grilling por riesgo y por contradecir spec §6).
- Llamadas directas navegador→IGDB o proxys públicos de terceros (imposibles/inseguras por diseño).
- Proxy en localhost o autoalojado distinto de Cloudflare Workers.
- Migración automática de la clave antigua del navegador.
- Mover otras preferencias al archivo: el nombre sugerido de exportación sigue siendo preferencia local del dispositivo.
- Rotación de credenciales desde la app, múltiples conexiones, o selección de fuente de datos alternativa (RAWG).
- ADR dedicado: la decisión queda registrada en esta spec, el glosario y el contrato; no cumple el triple umbral de irreversibilidad.

## Further Notes

- Implementación ya aterrizada y verificada en la misma sesión (324 tests verdes, typecheck y lint limpios); los pasos pendientes son humanos: sustituir el placeholder del origen, desplegar el Worker, pegar los Secrets en el dashboard y guardar la URL en Datos → Conexión.
- Si algún día se publica la app para terceros, revisar: restricción de origen por usuario, cuota compartida del Worker gratuito y esta spec entera.
- El helper compartido de siembra vive junto a los otros shims de soporte de tests; no es código de producción.
