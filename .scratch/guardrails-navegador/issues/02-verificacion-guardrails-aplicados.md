# 02: Verificación de los guardrails ya aplicados

**What to build:** prueba observable de que la infraestructura de guardrails aplicada en la sesión de la retrospectiva está en su sitio y funciona: el check de scroll corre en un navegador real, cubre el modo de fallo exacto que se rompió (el scroll interno de la tabla del Panel al irse a la Ficha y volver), termina y devuelve el control al shell tras el veredicto, y la suite rápida sigue en verde. Quien lo verifique no necesita releer la retro: la corrida es la demo.

**Blocked by:** None (can start immediately; independiente del ticket 01).

**Status:** ready-for-agent

- [ ] El check de scroll termina con EXIT=0 e imprime «la tabla del Panel restaurada a 300px al volver de la Ficha» y «reabrir el Panel desde la Estantería: arriba (0)» junto a los escenarios previos (Estantería/tablón por el atrás, Ficha/drill-down arriba).
- [ ] El check devuelve el control al shell tras el veredicto (sin timeout del proceso: race de 5 s sobre el cierre del navegador y watchdog de 60 s presentes y comentados).
- [ ] La suite rápida queda en verde: typecheck, lint, test.
- [ ] Confirmados los tres artefactos de la sesión: los escenarios del Panel en el check, el global `MouseEvent` en la configuración del linter y el comentario del invariante de orden (capturar antes de cambiar la clase de superficie fija) en el sitio del render.
- [ ] La corrida no deja procesos Edge huérfanos.

## Comentarios

**2026-11-18 — Verificación (worktree `guardrails-navegador-02`, HEAD 8f903c1).**

- **Check de scroll**: `npm run test:scroll` ⇒ `EXIT=0`. Líneas observadas:
  - `la tabla del Panel restaurada a 300px al volver de la Ficha (300, 300, 300, 300)`
  - `reabrir el Panel desde la Estantería: arriba (0)`
  - Previos presentes: `Ficha arriba (0) al abrirse (estantería en 400)`, `la Estantería restaurada a 400px tras el atrás (400, 400, 400, 400)`, `Sección arriba (0) al abrirse (tablón en 200)`, `el tablón restaurada a 200px tras el atrás (200, 200, 200, 200)`.
  - Veredicto: `GREEN: Ficha y drill-down arriba; Estantería, tablón y Panel restaurados tras el volver`. El proceso devolvió el control al shell justo tras el veredicto (sin timeout).
- **Artefactos confirmados** (leídos, no de memoria):
  - Escenarios del Panel: `scripts/check-scroll-restore.mjs:175-226` (siembra+clic síncronos, muestras 0/100/300/600 ms, reapertura fresca); cabecera con el porqué en `:1-19`.
  - Global `MouseEvent`: `eslint.config.js:29` (lista de globals compartidos).
  - Invariante de orden: `src/app.js:429-433` (capturar el scroll de la superficie saliente ANTES de cambiar `surface-fixed`; menciona que jsdom no lo detecta y que el guardrail es `npm run test:scroll`).
  - Salida limpia: race de 5 s sobre `browser.close()` en `scripts/check-scroll-restore.mjs:271-279` y watchdog de 60 s (`unref`) en `:282-284`; salida explícita en `:291-296`.
- **Procesos Edge**: antes = 9; después = 9 (delta 0, sin huérfanos). `Get-CimInstance` dio acceso denegado en este entorno; el conteo se hizo con `Get-Process` y la inspección de CommandLine con `wmic`: los 9 son la sesión normal del usuario (`--user-data-dir=...\Microsoft\Edge\User Data`, padre 4216), ninguno del perfil temporal del script.
- **Suite rápida**: `npm run typecheck` ⇒ EXIT=0; `npm run lint` ⇒ EXIT=0; `npm test` ⇒ EXIT=0 (47 archivos, 698 tests en verde).
- **Desviaciones**: ninguna. No se tocó código de la app ni otros archivos de `.scratch`.
