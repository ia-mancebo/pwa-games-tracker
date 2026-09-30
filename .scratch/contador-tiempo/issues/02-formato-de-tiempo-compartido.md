# 02: Formato de tiempo compartido (H:MM:SS vivo y redondo histórico)

**What to build:** todas las pantallas dicen lo mismo. Un módulo de formato compartido convierte segundos a texto para los dos usos del feature: el Contador en marcha se lee en vivo como `H:MM:SS` (p. ej. `1:05:03`) y el histórico se lee redondo (p. ej. «12 h 34 min»). Módulo puro, sin DOM ni reloj, compartido: nada de formatos duplicados por vista que acaban diciendo cosas distintas.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] El formato vivo muestra `H:MM:SS` con horas sin rellenar (p. ej. `1:05:03`)
- [x] El formato histórico es redondo y legible (p. ej. `12 h 34 min`, `5 min`, `1 h`) con casos borde cubiertos (menos de un minuto, hora exacta, cero)
- [x] Módulo puro con tests, único para todas las pantallas
