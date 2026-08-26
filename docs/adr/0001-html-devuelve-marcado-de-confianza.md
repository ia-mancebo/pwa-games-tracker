# La salida de `html` es marcado de confianza, reconocida por `stringify`

Contexto: componer plantillas anidadas exigía envolver cada resultado de `html` con `raw()` (~147 call sites); olvidarlo escapaba el marcado entero como texto visible (bug de la búsqueda del 2026-08-26). Decisión: `html` (y `raw`) devuelven un objeto `Markup` (subclase de `String`) que `stringify` reconoce e inyecta sin escapar; los átomos simples (strings, números) siguen escapándose siempre. `raw()` queda reservado para literales ajenos genuinos.

## Considered options

- Mantener `raw()` explícito en cada composición: rechazado porque la regla vivía repartida en cada call site y ya produjo una clase de bug completa.
- Devolver un objeto nuevo ajeno a `String`: rompía `.trim()`, `.includes()` y coerción natural en cientos de sitios.

## Consequences

- El truco de subclase implica un engaño controlado: el tipo declarado de `html` sigue siendo `string` (así ningún call site necesita cambios), pero en ejecución es un objeto. Comparaciones de identidad contra primitivos (`=== ''`) o comprobaciones de falsedad sobre cadenas vacías fallarán silenciosamente en la salida de `html`; si alguna vez hace falta un primitivo puro, se convierte con `String(...)`.
- `structuredClone` serializa objetos `String` a primitivos, así que persistir por error un `Markup` en IndexedDB se degrada a cadena plana, nunca a `[object Object]`.
