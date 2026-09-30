# Corrección manual del Tiempo jugado

ADR-0011 dejó el Tiempo jugado como un valor acumulado que ni el usuario ni la app modifican una vez consolidado; pero el usuario se equivoca al guardar: confirma un Tramo con otra duración por descuido, lo guarda tal cual sin querer, o el prefill del tiempo de pared al reabrir la app no refleja lo realmente jugado — y no existía forma de reducir (o subir) el valor ya guardado. Se decide que el Tiempo jugado de cada Jugada se edite mediante una corrección manual explícita: una acción que establece un valor nuevo —entero ≥ 0— y reemplaza el guardado; subir y bajar son la misma operación, un set y no una resta. Revierte deliberadamente la regla de invarianza de ADR-0011, pero no abre una vía nueva de consolidación: los Tramos pendientes no se consumen y los confirmados después se suman sobre la base corregida; si el Contador corre sobre esa Jugada, la corrección lo auto-pausa igual que las demás acciones que lo detienen. Sin cambio de esquema: `playedSeconds` ya admite cualquier entero ≥ 0, el Doc sigue en v2 y no hay migración.

## Considered Options

- Corrección como resta o ajuste relativo: obliga a calcular el delta y solo cubre la mitad del problema (el error también puede ir al alza); el set absoluto es más simple y simétrico.
- Editar los Tramos ya consolidados (corregir la historia): el Doc no guarda la procedencia — el Tramo desaparece al consolidarse —, así que arreglar un número exigiría un modelo nuevo de historial.
- Segundo diálogo de confirmación por ser destructivo: la app no tiene undo y el resto de ediciones de la Ficha (título, fechas, notas) aplican directo; el campo de la corrección ya es el paso deliberado, el doble diálogo es fricción.
- Entrada sin affordance (tocar el valor para editar): en móvil no hay hover y no se descubre; la convención de affordance explícita lo prohíbe — la corrección va con un lápiz visible junto al valor.
- Mantener la invarianza (status quo): un Tramo guardado mal quedaría en el archivo personal para siempre.

## Consequences

- El Doc se escribe, además de al pausar y al consolidar, al corregir el Tiempo jugado; no cambia la versión (v2) ni la validación.
- La corrección auto-pausa el Contador anclado a esa Jugada, produciendo un Tramo pendiente; corregir otra Jugada no toca el Contador.
- Los Tramos pendientes de esa Jugada quedan como están: confirmarlos después suma sobre el valor corregido, que pasa a ser la base.
- No hay historial ni undo: el valor anterior desaparece del Doc; la única recuperación es el archivo conectado o el respaldo de instantánea.
- Estadísticas y agregaciones que suman el Tiempo jugado reflejan el valor corregido sin código extra.
