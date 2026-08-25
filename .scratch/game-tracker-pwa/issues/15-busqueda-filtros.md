# 15 Â· BÃºsqueda y filtros (estanterÃ­a y panel)

**Status:** resolved
**Blocked by:** 14 Â· EstanterÃ­a + Panel completos

## What to build

Barra comÃºn compartida por estanterÃ­a y panel:

- **BÃºsqueda**: coincide con tÃ­tulo, etiquetas propias, gÃ©neros y plataformas; insensible a mayÃºsculas y tildes; debounce 150 ms. En estanterÃ­a filtra dentro de cada balda y oculta las baldas sin resultados; en panel filtra dentro del estado abierto.
- **Filtros**: tres filas de chips (gÃ©nero, plataforma, etiqueta propia) bajo el buscador, scroll horizontal por fila; la fila de etiquetas no aparece si no hay ninguna creada. SelecciÃ³n Ãºnica por dimensiÃ³n (tocar el chip activo lo quita), acumulables entre dimensiones (Y lÃ³gico). Los chips de estado cambian de lista (radio, no acumulan).

## Acceptance criteria

- [ ] Buscar Â«pokemonÂ», Â«pokÃ©monÂ» y Â«POKÃ‰MONÂ» da los mismos resultados.
- [ ] Los resultados aparecen tras ~150 ms sin escribir (debounce observable).
- [ ] Dos filtros de dimensiones distintas acumulan; solo uno activo por dimensiÃ³n.
- [ ] Baldas sin resultados se ocultan; el panel filtra dentro de su estado.
- [ ] La fila de etiquetas desaparece cuando no existen etiquetas propias.
