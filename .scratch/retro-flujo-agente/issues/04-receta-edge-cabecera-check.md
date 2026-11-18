# 04: Receta Edge en la cabecera del check de scroll

**What to build:** la cabecera del check de scroll gana el comentario de la receta de huérfanos Edge, co-localizada como la cabecera de siembra que ya practica: cómo contar los procesos Edge que el script crea (conteo de msedge antes/después de la corrida), cómo distinguir huérfano de la sesión normal del usuario (el huérfano apunta al perfil temporal del script, no al perfil del navegador del usuario), y la nota de que la vía de línea de comandos directa (WMI) da acceso denegado en esta máquina — la receta que funciona es conteo por proceso + inspección con las herramientas alternativas. Cambio de comentario solo: el check no cambia de comportamiento. Demo: UNA corrida del check con el conteo antes/después de la receta (delta cero).

**Blocked by:** 01 (el barrido reformatea el archivo que este ticket comenta; el comentario nace sobre la base barrida).

**Status:** ready-for-agent

- [ ] Comentario solo: cero cambio de comportamiento en el script.
- [ ] La receta incluye el porqué (acceso denegado de la vía directa) y qué es huérfano frente a sesión del usuario.
- [ ] Corrida del check EXIT=0 con delta Edge 0 antes/después, citada en el ticket.
- [ ] Puertas en verde tras el cambio: typecheck, lint, test, format:check.
