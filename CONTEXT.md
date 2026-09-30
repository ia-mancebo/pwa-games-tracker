# Contexto · Game Tracker

Glosario del dominio. Sin detalles de implementación: los términos y nada más.

## Términos

- **Biblioteca**: el conjunto de juegos del usuario. Su soporte es un archivo de datos personal que el usuario posee y sincroniza por sus propios medios.
- **Estantería**: vista de la Biblioteca que organiza los juegos en filas, una por Estado del juego; cada fila muestra un máximo de juegos y abre el Panel de su estado.
- **Panel**: lista completa de los juegos de un mismo Estado del juego, con búsqueda y filtros aplicados.
- **Ficha**: detalle de un Juego: sus datos compartidos y todas sus Jugadas juntas, donde se consulta y edita.
- **Alta**: incorporación de un Juego a la Biblioteca, buscando en la Fuente de datos o creándolo manualmente; crea siempre la primera Jugada.
- **Alta manual**: Alta creando el Juego a mano; solo el título es obligatorio.
- **Alta desde la Fuente de datos**: Alta buscando el Juego en la Fuente de datos; conserva sus datos compartidos al crearlo.
- **Juego**: una obra en la biblioteca, con sus datos compartidos: título, carátula, descripción, capturas, géneros, plataformas disponibles y etiquetas propias. Se guarda una sola vez aunque tenga varias jugadas.
- **Jugada**: una partida de un juego, con su propio estado, valoración, plataforma jugada, fechas y notas. Todo juego tiene al menos una.
- **Estado**: ciclo de vida de una jugada. Valores: **Quiero jugar**, **Jugando**, **Terminado**, **Abandonado**.
- **Estado del juego**: el Estado con el que se muestra y cuenta un Juego: el de su jugada más reciente.
- **Jugada más reciente**: la Jugada de un Juego incorporada más tarde. Define el Estado del juego y es la que recibe la Valoración del héroe de la Ficha.
- **Contador**: cronómetro ligado a la Jugada más reciente de un Juego. Iniciar lo pone en marcha y Pausar lo detiene; al detenerse produce un Tramo con lo contado. Solo puede haber uno en marcha en toda la Biblioteca: iniciar otro lo detiene antes; también se detiene al Terminar o Abandonar su Jugada, o al añadir otra Jugada a ese Juego. Con la app cerrada sigue contando: al reabrir, el tiempo transcurrido queda como Tramo.
- **Tramo**: tiempo contado por un Contador entre Iniciar y Pausar. Queda pendiente de la decisión del usuario: guardarlo tal cual, guardarlo con otra duración o descartarlo. Solo un Tramo confirmado suma al Tiempo jugado; uno descartado no deja rastro.
- **Consolidar**: sumar al Tiempo jugado de una Jugada un Tramo que el usuario ha guardado.
- **Tiempo jugado**: duración acumulada de una Jugada, formada al Consolidar sus Tramos confirmados. Ni el usuario ni la app modifican lo ya guardado.
- **Aviso de contador**: aviso fijo presente en todas las pantallas mientras haya un Contador en marcha o un Tramo pendiente: muestra el Juego, el tiempo transcurrido y un botón de Pausar, y señala los Tramos pendientes de revisión. Pulsar el resto abre la Ficha de su Juego.
- **Valoración**: nota de 1 a 5 estrellas que el usuario da a una jugada. Puede existir en cualquier estado.
- **Plataforma**: hardware en el que se juega (PS5, Switch, PC…). Cada juego indica en cuáles puede jugarse; cada jugada registra en cuál se jugó, y esta puede ser propia (p. ej. un emulador), ajena a la lista oficial.
- **Género**: categoría oficial del juego según la fuente de datos externa (terror, acción, plataformas…).
- **Etiqueta propia**: categoría personal creada por el usuario, ajena a los géneros oficiales. Describe al juego.
- **Carátula**: imagen de portada de un juego. Se referencia por su origen externo y debe poder verse sin conexión.
- **Novedades**: sección con información externa y reciente: juegos nuevos y populares, próximos lanzamientos y un calendario de estrenos.
- **Instantánea de Novedades**: copia del último contenido refrescado de Novedades que la app conserva para mostrar el tablón cuando no puede refrescar.
- **Modo degradado**: estado de Novedades cuando el refresco falla y el tablón muestra la última Instantánea con un aviso.
- **Dashboard de estadísticas**: resúmenes agregados calculados sobre la biblioteca propia.
- **Fuente de datos**: servicio externo del que se obtienen juegos, géneros, carátulas y fechas de lanzamiento.
- **Cliente de la Fuente de datos**: pieza que habla con la Fuente de datos usando la Conexión. No decide cómo se configura: su conexión se le entrega ya hecha.
- **Conexión**: ajustes que ligan la app a su Fuente de datos externa. Forman parte del archivo de datos personal de la Biblioteca y viajan con él; nunca incluyen credenciales.
- **Origen autorizado**: origen web desde el que la app tiene permiso para hablar con la Fuente de datos. Decide qué páginas pueden usarla; se configura aparte del repositorio y nunca incluye credenciales.
- **Enlace de archivo**: vínculo vivo entre la Biblioteca y su archivo de datos personal (.json): conectarlo, volcar a él, reconectarlo y resolver conflictos. Es lo que permite autoguardado; sin él solo existe el espejo del navegador.
