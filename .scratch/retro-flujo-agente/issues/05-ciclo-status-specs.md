# 05: Ciclo de Status de specs

**What to build:** el doc del tracker gana la convención que falta: los spec.md llevan `Status:` con el mismo vocabulario de triage que los tickets, y un spec pasa a `resolved` cuando TODOS sus tickets están `resolved`. Barrido incluido: los specs cuyo conjunto completo de tickets ya está `resolved` se marcan (hoy: correccion-tiempo-jugado y guardrails-navegador). Los históricos con tickets abiertos (contador-tiempo, architecture-deepening y su continuación) y los specs sin línea `Status:` quedan intactos — la auditoría de qué se implementó de verdad no se pidió. Demo: leer el doc del tracker y ver los dos specs cerrados marcados.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] El doc del tracker define el ciclo de `Status:` de specs en prosa puntero (una línea o dos).
- [ ] Solo se marcan specs cuyo conjunto completo de tickets está `resolved` (verificar al ejecutar, no de memoria); hoy son dos.
- [ ] Ningún otro spec ni ticket histórico tocado.
