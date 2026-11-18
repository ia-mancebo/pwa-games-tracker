# 05: Ciclo de Status de specs

**What to build:** el doc del tracker gana la convención que falta: los spec.md llevan `Status:` con el mismo vocabulario de triage que los tickets, y un spec pasa a `resolved` cuando TODOS sus tickets están `resolved`. Barrido incluido: los specs cuyo conjunto completo de tickets ya está `resolved` se marcan (hoy: correccion-tiempo-jugado y guardrails-navegador). Los históricos con tickets abiertos (contador-tiempo, architecture-deepening y su continuación) y los specs sin línea `Status:` quedan intactos — la auditoría de qué se implementó de verdad no se pidió. Demo: leer el doc del tracker y ver los dos specs cerrados marcados.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] El doc del tracker define el ciclo de `Status:` de specs en prosa puntero (una línea o dos).
- [x] Solo se marcan specs cuyo conjunto completo de tickets está `resolved` (verificar al ejecutar, no de memoria); hoy son dos.
- [x] Ningún otro spec ni ticket histórico tocado.

## Comentarios

- 2026-11-18: Añadida UNA línea-puntero en `docs/agents/issue-tracker.md` (Conventions): los `spec.md` llevan la misma línea `Status:` con el vocabulario de triage, y un spec pasa a `resolved` cuando TODOS sus tickets están `resolved`. Barrido ejecutado con verificación en vivo del estado de los tickets (grep de `**Status:**`/`Status:` sobre `.scratch/`): marcados `Status: resolved` (formato plano, línea 3) los dos specs cuyo conjunto completo de tickets está `resolved` — `correccion-tiempo-jugado` (3/3) y `guardrails-navegador` (2/2). No tocados: `contador-tiempo` (10 tickets abiertos), `architecture-deepening` (7 tickets abiertos, `**Status:**` antiguo), `architecture-deepening-2` (forma antigua `**Status:**`, out of scope por decisión del orquestador), `conexion-json` y `game-tracker-pwa` (sin línea `Status:` de generación actual). Verificado en verde: `npm run typecheck`, `npm run lint`, `npm test` (47 archivos, 698 tests). Commit: `b397729`.
