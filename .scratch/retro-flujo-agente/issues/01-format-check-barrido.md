# 01: format:check como comando y barrido único

**What to build:** el formato del repo pasa a ser observable con un comando: script npm `format:check` (prettier en modo check, mismo alcance que el script `format` existente). El ignore de prettier gana el directorio futuro de los worktrees y `.scratch/` — el tracker no paga peaje de formato (el linter ya lo ignora; decisión del mantenedor al aprobar los tickets). Después, UN barrido único de formato en su propio commit. Demo: `npm run format:check` en verde sobre un repo barrido, con la suite completa dando los mismos veredictos que antes del barrido y el check de scroll corriendo una vez como seguro.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] El script npm `format:check` corre el check de prettier sobre el mismo alcance que el script `format`.
- [x] El ignore de prettier excluye el directorio de worktrees y `.scratch/`; el config de prettier no se toca.
- [x] El barrido de formato va en su propio commit (separado del commit del script); `npm run format:check` ⇒ EXIT=0 tras él.
- [x] typecheck, lint y test en verde con los mismos 698 tests; check de scroll EXIT=0 tras el barrido (toca el app y los scripts que el check conduce).
- [x] Sin procesos Edge huérfanos tras la corrida del seguro.

## Comentarios

- 2026-11-18: Añadido el script `format:check` (`prettier --check .`, mismo alcance que `format`) y las entradas `.worktrees/` y `.scratch/` en `.prettierignore`; `.prettierrc` intacto (commit `75a2ea4`). Verificación RED→GREEN del script como prueba de sí mismo: antes del barrido `npm run format:check` ⇒ EXIT=1 con 146 archivos (el dato de la retro, 131, era número a re-verificar; el real medido fue 146); barrido único `prettier --write .` en su propio commit `f602f28` (146 archivos reformateados por prettier: 81 con cambios reales en el diff de git y 65 solo con fin de línea CRLF→LF que git normaliza); después ⇒ EXIT=0. Desviación menor: el formato embebido HTML de prettier reflowó el template `html\`<ul>${items}</ul>\`` de `src/lib/dom.test.js` cambiando el valor de la cadena (rompía el test «joins arrays of values»); para conservar cero cambios de comportamiento, commit `5799c48` restaura la línea original con `// prettier-ignore` (única edición manual de la sesión: el comentario-directiva). Puertas finales en verde: `npm run format:check` EXIT=0; `npm run typecheck` EXIT=0; `npm run lint` EXIT=0; `npm test` 47 archivos, 698 tests (mismos que el baseline previo al barrido, re-verificado); `npm run test:scroll` EXIT=0 (GREEN); procesos Edge antes/después de la corrida 9/9, delta 0 (sin huérfanos). Commits del trabajo: `75a2ea4` (script + ignores), `f602f28` (barrido), `5799c48` (prettier-ignore).
