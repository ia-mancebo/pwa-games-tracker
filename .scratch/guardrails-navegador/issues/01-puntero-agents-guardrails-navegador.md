# 01: Puntero de guardrails de navegador en el archivo del agente

**What to build:** cuando alguien pida al agente un cambio de UI, scroll o navegación, la verificación en navegador real pasa a ser parte del criterio de terminado. El archivo de instrucciones del agente (AGENTS.md) gana UNA línea-puntero con el disparo delante — «cambios de UI/scroll/navegación ⇒ correr el `test:*` de navegador relevante» — que lista los seis checks existentes con su asunto y estampa la regla permanente: una regla nueva de scroll/navegación llega acompañada de su escenario en el check. Prosa puntero, no un cache de `package.json`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] La línea-puntero abre con el disparador (cambios de UI/scroll/navegación) y después nombra el gate.
- [ ] Lista los seis scripts con su asunto en tres o cuatro palabras cada uno, con nombres exactos según los scripts de `package.json` (nada inventado ni renombrado).
- [ ] Incluye la regla permanente «regla nueva de scroll/navegación ⇒ escenario en el check de navegador».
- [ ] Es una sola línea añadida; AGENTS.md no crece con un párrafo por check ni duplica lo que el entorno ya dice.
- [ ] Suite rápida en verde tras el cambio (typecheck, lint, test).

## Comentarios

- 2026-11-18: Añadida UNA línea-puntero en AGENTS.md (Dev environment), con el disparador delante («Cambios de UI, scroll o navegación ⇒ correr el `test:*` de navegador relevante antes de darse por terminado»), los seis scripts con nombres exactos de `package.json` y su asunto en 3 palabras (`test:scroll` scroll y navegación, `test:layout` layout de escritorio, `test:layout:mobile` layout en móvil, `test:overflow:mobile` desbordes horizontales móviles, `test:add-online:overflow` alta online: overflow, `test:aviso` aviso del contador), más la regla permanente «regla nueva de scroll/navegación ⇒ escenario en el check de navegador». Sin tocar código de la app. Verificado en verde: `npm run typecheck`, `npm run lint`, `npm test` (47 archivos, 698 tests). Commit: `45a8096`.
