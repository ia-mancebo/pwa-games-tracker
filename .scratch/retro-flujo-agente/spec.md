# Spec · Flujo del agente: worktrees dentro del repo, formato como puerta, receta Edge y ciclo de Status

Status: ready-for-agent

## Problem Statement

La retro de la sesión de guardrails de navegador dejó cuatro fricciones observables. Cuando el orquestador montó los worktrees de los dos subagentes implementadores, nacieron como carpetas hermanas del repo (`game-tracker-wt01/02` en la carpeta de proyectos del mantenedor): funcionaron, pero sorprendieron y ensuciaron un sitio que nadie pidió tocar — el entorno pre-aprobado para trabajo externo es el temp, y ni siquiera eso se usó. Aparte, prettier está configurado en el repo (config e ignore propios) pero nunca se cableó: hoy 131 archivos fallan su check, y la puerta del flujo del agente (typecheck, lint, test) no ve el formato, así que un cambio puede terminar «en verde» con el formato roto. Además, la receta para verificar que el check de scroll no deja procesos Edge huérfanos se descubrió a base de improvisar (la vía obvia da acceso denegado en esta máquina) y ahora solo vive en el comentario de un ticket cerrado: el siguiente agente de diagnóstico la tendrá que reencontrar a mano. Y por último, los spec.md del tracker llevan una línea `Status:` que ninguna convención define: en los specs cerrados sigue congelada en `ready-for-agent`, así que el archivo miente y el lector no puede fiarse de él.

## Solution

Los worktrees de subagentes nacen DENTRO de la carpeta del repo, en un directorio gitignored, siguiendo el flujo de implement-spec tal cual (un worktree por ticket, rama propia basada en la rama de integración, fusión al integrar): solo cambia el destino, no el flujo, y nada se crea fuera del repo sin preguntar. El formato pasa a ser puerta observable: un script `format:check` en el entorno, nombrado en la línea de puertas del archivo del agente, precedido de UN barrido único de formato que nazca en verde. La receta de huérfanos Edge vive donde ya se usa — la cabecera del check que siembra procesos. Y el ciclo del `Status:` de specs queda definido en el tracker: un spec se marca `resolved` cuando todos sus tickets lo están, y los specs cerrados se marcan.

## User Stories

1. Como mantenedor/a, quiero que los worktrees de los subagentes nazcan dentro de la carpeta del repo, para que mi carpeta de proyectos no acumule carpetas que no pedí.
2. Como agente orquestador, quiero una regla escrita de dónde crear worktrees, para que cada corrida de implement-spec los ponga en el mismo sitio sin preguntar ni improvisar.
3. Como agente implementador, quiero que mi worktree siga siendo un checkout completo con rama propia basada en la rama de integración, para que el flujo de implement-spec funcione igual que hoy y solo cambie la ubicación.
4. Como mantenedor/a, quiero que el directorio de worktrees esté ignorado por git, el formato y el lint, para que el repo limpio no muestre basura ni las puertas cuenten copias.
5. Como mantenedor/a, quiero que cada worktree se limpie al cerrar su ticket, para que el directorio no crezca sin fin entre sesiones.
6. Como agente orquestador, quiero que la ubicación no dependa de carpetas hermanas con nombre inventado, para que dos corridas en la misma máquina no choquen ni dejen restos con nombres ambiguos.
7. Como mantenedor/a, quiero un script `format:check` en el entorno, para que el formato sea observable con un comando y no una convención oral.
8. Como agente implementador, quiero que la puerta del flujo incluya el check de formato, para que ningún cambio se dé por terminado con formato roto.
9. Como mantenedor/a, quiero un barrido único de formato antes de cablear la puerta, para que la puerta nueva nazca en verde y no en rojo permanente sobre 131 archivos.
10. Como mantenedor/a, quiero que el barrido no cambie comportamiento, para que la suite, el lint y el check de scroll sigan en verde exactamente como antes de él.
11. Como agente revisor, quiero que el formato no sea parte del review, para que el review discuta decisiones y no comas colgantes.
12. Como agente de diagnóstico, quiero la receta de huérfanos Edge en la cabecera del check de scroll, para reproducir la verificación sin releer tickets de sesiones pasadas.
13. Como mantenedor/a, quiero que la receta viva donde ya se usa (co-localización), para que no exista otro documento que se quede viejo.
14. Como agente de diagnóstico, quiero que la receta diga qué vía de conteo funciona en esta máquina y qué es un huérfano, para no redescubrir el acceso denegado ni acusar a la sesión normal del usuario.
15. Como mantenedor/a, quiero que el ciclo del `Status:` de specs esté definido en el tracker, para que la línea signifique algo y se pueda exigir.
16. Como lector/a del tracker, quiero que los specs cerrados digan `resolved`, para fiarme del archivo en vez de la memoria de las sesiones.
17. Como agente implementador, quiero saber con una mirada si un spec está cerrado, para no reabrir trabajo terminado ni cerrar trabajo vivo.
18. Como mantenedor/a, quiero que los specs con tickets históricos abiertos queden fuera de este barrido, para que la limpieza de la convención no se convierta en una auditoría no pedida.

## Implementation Decisions

- Worktrees de subagentes: DENTRO de la carpeta del repo, bajo un directorio gitignored dedicado (un directorio único, p. ej. `.worktrees/`, con un subdirectorio por ticket). El flujo de implement-spec NO cambia: un worktree por ticket, rama propia basada en la rama de integración, fusión de la punta de integración antes de reportar, merge al integrar, limpieza al cerrar. Solo cambia el destino de `git worktree add`. El temp queda descartado por decisión explícita del mantenedor; el destino es el repo.
- El archivo del agente gana UNA línea en Dev environment, disparo delante: worktrees de subagentes (flujo implement-spec: uno por ticket, rama propia) ⇒ dentro del repo, en el directorio ignorado; nada fuera de la carpeta del repo sin preguntar. Prosa puntero, sin párrafos.
- El directorio de worktrees entra en .gitignore, en el ignore de prettier y en los ignores del linter, para que ni el status de git, ni el barrido de formato, ni el lint lo vean. Los worktrees son efímeros: nada de su contenido es fuente de verdad.
- Puerta de formato: script npm `format:check` (prettier en modo check, mismo alcance que el script `format` existente), añadido a la línea de puertas del archivo del agente junto a typecheck, lint y test. Sin pre-commit hooks ni CI: el guardrail vive en el flujo del agente, decisión ya registrada en el spec anterior y respetada.
- Barrido único de formato: un commit propio, `prettier --write .` sobre el estado actual (131 archivos fallan el check hoy; el número real se confirma al ejecutar). El config de prettier existente se respeta tal cual; no se toca.
- Receta Edge en la cabecera del check de scroll: cómo contar los procesos Edge que el script crea (conteo de procesos msedge antes/después de la corrida) y cómo distinguir huérfano de sesión normal del usuario (el huérfano apunta al perfil temporal del script, no al perfil del navegador del usuario), con la nota de que la vía de línea de comandos por WMI directa da acceso denegado en esta máquina y la receta que funciona es conteo por proceso + inspección con las herramientas alternativas. Co-localización, el mismo principio que la cabecera de siembra del check ya practica.
- Ciclo de Status de specs: el doc del tracker gana una línea — los spec.md llevan `Status:` con el mismo vocabulario de triage que los tickets, y un spec pasa a `resolved` cuando TODOS sus tickets están `resolved`. Barrido incluido: solo los specs cuyo conjunto de tickets ya está todo `resolved` (hoy: correccion-tiempo-jugado y guardrails-navegador).
- Sin ADR: reversible, poco sorprendente, sin trade-off arquitectónico; no toca reglas de dominio ni ADRs existentes.
- Sin documentos nuevos: una línea en el archivo del agente, una línea en el doc del tracker, un comentario en la cabecera del check; nada más. El porqué del destino de worktrees (decisión del mantenedor contra temp y contra hermanas) vive en el archivo del agente, que es donde el agente lo necesita.

## Testing Decisions

- Un buen test aquí no añade ninguno nuevo: las puertas existentes son la verificación. Cada cambio debe dejar typecheck, lint y test en verde con los mismos veredictos que antes; ningún test nuevo de módulos porque no nace ningún módulo.
- El barrido de formato se verifica por inducción: la suite completa en verde antes y después (mismo número de tests pasando), el lint en verde, y UNA corrida del check de scroll tras el barrido como seguro — el barrido toca el app y los scripts que el check conduce, y el check es la puerta decisiva para scroll/navegación.
- El script `format:check` se verifica a sí mismo: hoy RED (131 archivos), tras el barrido GREEN; el script es a la vez la cosa y su prueba. Su primer uso como puerta es la corrida del propio flujo del agente.
- La receta Edge se verifica igual que en el ticket de verificación anterior: conteo antes/después de una corrida del check con delta cero.
- Los cambios de docs no tienen seam de test: reglas de una línea, verificables por lectura. El seam de todo el trabajo es el que ya existe: la suite npm y el check de scroll; cero seams nuevos de test.
- No se testea: el flujo de implement-spec (skill externo al repo), el interior de prettier, ni el comportamiento del app más allá del formato.

## Out of Scope

- Cambiar el flujo, los prompts o las skills de implement-spec: son externas al repo; el repo solo fija el destino de los worktrees que ese flujo crea.
- Resolver o auditar tickets históricos que siguen abiertos (contador-tiempo con diez tickets sin cerrar, architecture-deepening y su continuación): marcar specs de esfuerzo pasados requeriría una auditoría de qué se implementó de verdad, que no se pidió.
- Specs sin línea `Status:` (la PWA, los deepening): se dejan tal cual; la convención nueva solo gobierra specs que la llevan.
- Pre-commit hooks, lint-staged y CI: decisión ya registrada en el spec de guardrails, se respeta.
- Cambiar la configuración de prettier, el ignore de prettier o el alcance del formato: el config existente manda.
- Cambiar el destino de los worktrees a temp o a carpetas hermanas: descartado por el mantenedor.
- Comportamiento del app: ningún cambio de src o worker más allá del formato del barrido.

## Further Notes

- Origen: retro de la sesión «guardrails de navegador», candidatos 1, 2, 3 y 5. El candidato 4 (los tickets de verificación podrían prescindir de worktree) quedó descartado por el mantenedor: el flujo de implement-spec se respeta tal cual, con su worktree por ticket.
- Decisión del mantenedor sobre worktrees en el check de seams: aprobado el resto; los worktrees NO van a temp y el flujo debe hacer lo que indica implement-spec — de ahí la decisión de directorio gitignored dentro del repo.
- Números de la retro que el ejecutor debe re-verificar, no recordar: 131 archivos fallan el check de formato hoy; el conteo de procesos Edge por WMI directa da acceso denegado en esta máquina; dos specs cerrados llevan el `Status:` congelado.
- Prior art directo: la línea-puntero de guardrails de navegador en el archivo del agente (patrón de una línea con el disparo delante), la cabecera de siembra del check de scroll (patrón de co-localización de recetas) y el cierre de tickets del tracker (patrón de `Status:` + comentario fechado).
- Decisión añadida al trocear en tickets (2026-11-18, mantenedor): `.scratch/` entra también en el ignore de prettier — 30 de los 131 archivos que fallan el check son del tracker, y el linter ya lo ignora; el barrido queda limitado al código y docs fuera del tracker. Tickets en `issues/` (01–05).
