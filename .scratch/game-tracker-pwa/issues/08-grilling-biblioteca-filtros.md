# 08 · Grilling: biblioteca — búsqueda, filtros y edición

Type: grilling
Status: resolved
Blocked by: 04

## Question

¿Cómo se consulta y edita la Biblioteca?

- Búsqueda por nombre combinada con filtros: género/etiqueta propia, plataforma y estado; ¿filtros acumulables?
- Ordenación por defecto en cada lista.
- Vista de detalle y edición de una entrada (alta manual como fallback del buscador).
- Expectativas de rendimiento con cientos o miles de entradas.

> Nota (ticket 03, cerrado): la estructura ya está decidida en el prototipo — estantería por estados con límite de 6 por fila que despliega lista tipo panel; chips de estado que **cambian** de lista (radio, no acumulan); chips de género de selección única; búsqueda dentro de la vista; ficha de detalle con cambio de estado y valoración.

> Nota (ticket 04, cerrado): el esquema separa **juego** (datos compartidos de la fuente) de **jugadas** (estado, valoración, fechas y notas por partida). La biblioteca lista juegos; las rejugadas se ven juntas en la ficha del juego. Este ticket decide lo restante sobre ese modelo: ordenación por defecto, filtro por plataforma, alta manual, edición completa y rendimiento.

Skills: `grilling` + `domain-modeling`.

## Comments

- 24-08-2026 · Ticket 07 cerrado: estantería y dashboard comparten la regla de recuento del nuevo término «Estado del juego» — un juego aparece donde dicte su jugada más reciente (por `addedAt`). Véase el glosario y la respuesta del ticket 07.

## Answer

Cerrado el 24-08-2026 por grilling con el usuario. Las nueve decisiones, sobre la estructura ya fijada por los tickets 03 (mezcla A+B) y 04 (Juego/Jugada):

### Búsqueda y filtros (estantería y panel)

- **Búsqueda**: coincide con título, etiquetas propias, géneros y plataformas; insensible a mayúsculas y tildes. Presente en ambas vistas: en la estantería filtra dentro de cada fila y **oculta las estanterías sin resultados** mientras se busca; en el panel filtra dentro del estado abierto.
- **Filtros**: tres dimensiones — género, plataforma y etiqueta propia — con **selección única por dimensión, acumulables entre dimensiones** (misma semántica que los filtros globales del dashboard, ticket 07). Tocar el chip activo lo quita.
- **Ubicación**: misma barra en estantería y panel (búsqueda + tres filas de chips bajo ella), filtrando siempre lo visible. Las filas de chips hacen scroll horizontal; la de etiquetas propias no aparece si el usuario no ha creado ninguna.

### Ordenación

- Por defecto, **recencia descendente**: primero el juego cuya jugada más reciente tenga `addedAt` mayor; desempate alfabético. Igual en estantería y panel. Sin conmutador de orden en v1 (opción futura). Coherente con «Estado del juego» (ticket 07): la lista refleja lo último tocado.

### Alta

- Botón fijo **«➕ Añadir juego»** en la barra de Biblioteca → hoja con dos caminos:
  - **Buscar online** (por defecto): búsqueda contra el proxy IGDB (ticket 01) con debounce de 300 ms; resultados con carátula y año; al elegir uno se precargan datos compartidos y se crea su primera jugada.
  - **Crear manualmente**: solo título obligatorio (esquema del ticket 04).
- Sin conexión el camino online se muestra deshabilitado con motivo, empujando al manual. Estado por defecto de la primera jugada: **Quiero jugar**, editable en el formulario. El aviso de duplicados (ticket 04) aplica en ambos caminos.

### Edición desde la ficha

- Cada **jugada** editable en línea: fechas (`startedAt`/`finishedAt`), plataforma efectiva y notas.
- **«Añadir jugada»** para rejugadas. Valores por defecto de una jugada nueva: estado **Jugando**, plataforma **heredada de la última jugada**, valoración vacía; todo editable al crearla.
- Datos compartidos del **juego**: título y etiquetas propias siempre editables; géneros, plataformas disponibles, carátula, descripción y capturas **solo lectura si vienen de IGDB** (`igdbId` presente) y editables si el alta fue manual.
- Cambiar de estado en la ficha opera sobre la jugada más reciente; nunca borra ni crea jugadas por sí solo.

### Borrado

- Borrar **juego** (en cascada con todas sus jugadas) y borrar **jugada individual** (respetando el mínimo de una por juego), ambos con diálogo de confirmación y **sin deshacer**. Red de seguridad: los backups rotativos OPFS del ticket 05. Sin papelera en v1.

### Rendimiento

- Objetivo explícito: fluido hasta **5.000 juegos**. La estantería pinta como máximo 6+1 tarjetas por estado (barato por diseño); el panel pagina en bloques de 100 con «Cargar más»; filtros y búsqueda recalculan en memoria (espejo IndexedDB), con debounce de 150 ms solo para el texto. Sin virtualización de listas ni librerías extra en v1.

### Glosario

`CONTEXT.md` gana cuatro términos: **Estantería**, **Panel**, **Ficha** y **Alta**.
