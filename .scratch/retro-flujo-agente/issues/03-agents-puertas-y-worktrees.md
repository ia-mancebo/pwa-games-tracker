# 03: El archivo del agente: puertas y worktrees

**What to build:** el archivo de instrucciones del agente gana DOS líneas-puntero. (1) La línea de puertas pasa a nombrar el check de formato junto a typecheck, lint y test — un cambio no se da por terminado con formato roto. (2) La regla de worktrees con el disparo delante: worktrees de subagentes (flujo implement-spec: uno por ticket, rama propia basada en la rama de integración) ⇒ dentro del repo, en el directorio ignorado; nada fuera de la carpeta del repo sin preguntar. El temp queda descartado por decisión explícita del mantenedor. Prosa puntero: una línea cada una, sin párrafos ni caches de lo que el entorno ya dice.

**Blocked by:** 01, 02 (nombra la puerta y el directorio; deben existir antes).

**Status:** ready-for-agent

- [ ] La línea de puertas lista typecheck, lint, test y format:check con los nombres exactos del entorno.
- [ ] La línea de worktrees abre con el disparo (subagentes / flujo implement-spec) y fija el destino: dentro del repo, en el directorio ignorado; fuera de la carpeta del repo solo preguntando.
- [ ] Son dos líneas añadidas; cero párrafos, cero duplicación del entorno.
- [ ] Puertas en verde tras el cambio: typecheck, lint, test, format:check.
