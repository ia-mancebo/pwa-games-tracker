# 04: Pasarela de Alta desde la Fuente de datos

**Spec:** la de este esfuerzo (architecture-deepening). Tanda 2. Usa el splitter de listas del ticket 01.

**What to build:** un módulo puro en domain con dos funciones: mapear un juego de la Fuente de datos (+ Estado inicial y etiquetas en bruto) al input de alta del repositorio de la Biblioteca, preservando solo los datos compartidos presentes; y el moldeado a Juego para el render de carátula (hoy escrito tres veces). Lo consumen la ruta de previsualización del formulario de Alta y el «➕ Quiero jugarlo» de Novedades, así el payload de alta se construye una sola vez. Los flujos, la previsualización y las dos UX de duplicados quedan intactos: en el formulario, «abrir ficha existente / crear otro igual»; en Novedades, «Ya en tu biblioteca» con el botón que voltea. El alta manual no pasa por el mapeo.

**Blocked by:** 01 — Utilidades compartidas y limpieza.

**Status:** ready-for-agent

- [ ] El mapeo Fuente de datos → input de alta existe una vez y lo consumen ambos caminos (previsualización del Alta y Quiero jugarlo de Novedades).
- [ ] El moldeado a Juego para carátula existe una vez; las tres copias se borran.
- [ ] Suite colocada junto a sus pares de domain: campos presentes/ausentes, etiquetas (usando el splitter compartido), Estado por defecto Quiero jugar, juego sin datos compartidos.
- [ ] Previsualización antes de añadir y aviso de duplicados intactos (spec §4.5); el Alta desde Novedades sigue siendo 100 % local sin red (spec §8.6).
- [ ] El alta manual funciona exactamente igual que hoy.
- [ ] typecheck, lint y suite completa en verde.
