# 01: Puntero de guardrails de navegador en el archivo del agente

**What to build:** cuando alguien pida al agente un cambio de UI, scroll o navegación, la verificación en navegador real pasa a ser parte del criterio de terminado. El archivo de instrucciones del agente (AGENTS.md) gana UNA línea-puntero con el disparo delante — «cambios de UI/scroll/navegación ⇒ correr el `test:*` de navegador relevante» — que lista los seis checks existentes con su asunto y estampa la regla permanente: una regla nueva de scroll/navegación llega acompañada de su escenario en el check. Prosa puntero, no un cache de `package.json`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] La línea-puntero abre con el disparador (cambios de UI/scroll/navegación) y después nombra el gate.
- [ ] Lista los seis scripts con su asunto en tres o cuatro palabras cada uno, con nombres exactos según los scripts de `package.json` (nada inventado ni renombrado).
- [ ] Incluye la regla permanente «regla nueva de scroll/navegación ⇒ escenario en el check de navegador».
- [ ] Es una sola línea añadida; AGENTS.md no crece con un párrafo por check ni duplica lo que el entorno ya dice.
- [ ] Suite rápida en verde tras el cambio (typecheck, lint, test).
