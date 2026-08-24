# 15 · Búsqueda y filtros (estantería y panel)

**Status:** ready-for-agent
**Blocked by:** 14 · Estantería + Panel completos

## What to build

Barra común compartida por estantería y panel:

- **Búsqueda**: coincide con título, etiquetas propias, géneros y plataformas; insensible a mayúsculas y tildes; debounce 150 ms. En estantería filtra dentro de cada balda y oculta las baldas sin resultados; en panel filtra dentro del estado abierto.
- **Filtros**: tres filas de chips (género, plataforma, etiqueta propia) bajo el buscador, scroll horizontal por fila; la fila de etiquetas no aparece si no hay ninguna creada. Selección única por dimensión (tocar el chip activo lo quita), acumulables entre dimensiones (Y lógico). Los chips de estado cambian de lista (radio, no acumulan).

## Acceptance criteria

- [ ] Buscar «pokemon», «pokémon» y «POKÉMON» da los mismos resultados.
- [ ] Los resultados aparecen tras ~150 ms sin escribir (debounce observable).
- [ ] Dos filtros de dimensiones distintas acumulan; solo uno activo por dimensión.
- [ ] Baldas sin resultados se ocultan; el panel filtra dentro de su estado.
- [ ] La fila de etiquetas desaparece cuando no existen etiquetas propias.
