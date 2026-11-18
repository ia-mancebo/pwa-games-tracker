# 01: format:check como comando y barrido único

**What to build:** el formato del repo pasa a ser observable con un comando: script npm `format:check` (prettier en modo check, mismo alcance que el script `format` existente). El ignore de prettier gana el directorio futuro de los worktrees y `.scratch/` — el tracker no paga peaje de formato (el linter ya lo ignora; decisión del mantenedor al aprobar los tickets). Después, UN barrido único de formato en su propio commit. Demo: `npm run format:check` en verde sobre un repo barrido, con la suite completa dando los mismos veredictos que antes del barrido y el check de scroll corriendo una vez como seguro.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] El script npm `format:check` corre el check de prettier sobre el mismo alcance que el script `format`.
- [ ] El ignore de prettier excluye el directorio de worktrees y `.scratch/`; el config de prettier no se toca.
- [ ] El barrido de formato va en su propio commit (separado del commit del script); `npm run format:check` ⇒ EXIT=0 tras él.
- [ ] typecheck, lint y test en verde con los mismos 698 tests; check de scroll EXIT=0 tras el barrido (toca el app y los scripts que el check conduce).
- [ ] Sin procesos Edge huérfanos tras la corrida del seguro.
