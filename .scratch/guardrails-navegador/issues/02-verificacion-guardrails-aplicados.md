# 02: Verificación de los guardrails ya aplicados

**What to build:** prueba observable de que la infraestructura de guardrails aplicada en la sesión de la retrospectiva está en su sitio y funciona: el check de scroll corre en un navegador real, cubre el modo de fallo exacto que se rompió (el scroll interno de la tabla del Panel al irse a la Ficha y volver), termina y devuelve el control al shell tras el veredicto, y la suite rápida sigue en verde. Quien lo verifique no necesita releer la retro: la corrida es la demo.

**Blocked by:** None (can start immediately; independiente del ticket 01).

**Status:** ready-for-agent

- [ ] El check de scroll termina con EXIT=0 e imprime «la tabla del Panel restaurada a 300px al volver de la Ficha» y «reabrir el Panel desde la Estantería: arriba (0)» junto a los escenarios previos (Estantería/tablón por el atrás, Ficha/drill-down arriba).
- [ ] El check devuelve el control al shell tras el veredicto (sin timeout del proceso: race de 5 s sobre el cierre del navegador y watchdog de 60 s presentes y comentados).
- [ ] La suite rápida queda en verde: typecheck, lint, test.
- [ ] Confirmados los tres artefactos de la sesión: los escenarios del Panel en el check, el global `MouseEvent` en la configuración del linter y el comentario del invariante de orden (capturar antes de cambiar la clase de superficie fija) en el sitio del render.
- [ ] La corrida no deja procesos Edge huérfanos.
