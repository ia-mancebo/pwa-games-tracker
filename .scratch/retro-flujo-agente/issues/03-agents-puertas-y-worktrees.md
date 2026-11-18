# 03: El archivo del agente: puertas y worktrees

**What to build:** el archivo de instrucciones del agente gana DOS líneas-puntero. (1) La línea de puertas pasa a nombrar el check de formato junto a typecheck, lint y test — un cambio no se da por terminado con formato roto. (2) La regla de worktrees con el disparo delante: worktrees de subagentes (flujo implement-spec: uno por ticket, rama propia basada en la rama de integración) ⇒ dentro del repo, en el directorio ignorado; nada fuera de la carpeta del repo sin preguntar. El temp queda descartado por decisión explícita del mantenedor. Prosa puntero: una línea cada una, sin párrafos ni caches de lo que el entorno ya dice.

**Blocked by:** 01, 02 (nombra la puerta y el directorio; deben existir antes).

**Status:** resolved

- [x] La línea de puertas lista typecheck, lint, test y format:check con los nombres exactos del entorno.
- [x] La línea de worktrees abre con el disparo (subagentes / flujo implement-spec) y fija el destino: dentro del repo, en el directorio ignorado; fuera de la carpeta del repo solo preguntando.
- [x] Son dos líneas añadidas; cero párrafos, cero duplicación del entorno.
- [x] Puertas en verde tras el cambio: typecheck, lint, test, format:check.

## Comentarios

- 2026-11-18: Añadidas DOS líneas-puntero en AGENTS.md (Dev environment): la línea de puertas, editada in situ, pasa a nombrar el check de formato junto a typecheck, lint y test; la línea de worktrees nace al final de la sección, con el disparo delante y el destino fijado. Quedaron literalmente:
  ```
  - Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` before finishing any code change.
  - Worktrees de subagentes (flujo implement-spec: uno por ticket, rama propia basada en la rama de integración) ⇒ dentro del repo, en el directorio ignorado (`.worktrees/`); nada fuera de la carpeta del repo sin preguntar.
  ```
  Puertas en verde tras el cambio: `npm run typecheck`, `npm run lint`, `npm test` (47 archivos, 698 tests — números reales re-verificados), `npm run format:check`. Nota: una primera corrida completa dejó `tests/backnav.test.js` en rojo por timing bajo carga (flake); el archivo pasa en aislamiento (17/17) y la re-corrada completa dio 47/47 archivos y 698/698 tests en verde. Commit: `36120ad`.
