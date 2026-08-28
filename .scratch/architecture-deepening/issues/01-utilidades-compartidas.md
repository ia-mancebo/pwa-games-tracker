# 01: Utilidades compartidas y limpieza

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 1, prefactor: «haz fácil el cambio antes de hacer el cambio».

**What to build:** una pequeña capa de utilidades en lib para que las vistas y los módulos de datos dejen de llevar copias: un único formateador de mensajes de error (hoy hay cuatro copias entre la vista de la Ficha, el Enlace de archivo, el diálogo de Datos y la bienvenida, más variantes inline), una única detección de cancelación (dos copias + inline), un único helper de descarga de texto Blob (la copia local del conflicto y la exportación de datos) y un único splitter de listas por comas (la entrada de etiquetas del Alta y el campo de capturas de la Ficha son hoy la misma función escrita dos veces). Además, aplicar el deletion test a la export de escritura de doc sin callers y borrarla. Cero cambios de comportamiento.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Un único formateador de errores y una única detección de aborto viven en lib; las cuatro copias (y las variantes inline) consumen las de lib.
- [ ] Un único helper de descarga Blob usado por la copia local de conflicto y por la exportación de datos.
- [ ] Un único splitter de listas por comas usado por la entrada de etiquetas del Alta y por el campo de capturas de la Ficha.
- [ ] La export de escritura de doc sin callers no existe.
- [ ] typecheck, lint y suite completa en verde; cero cambios de comportamiento observables.
