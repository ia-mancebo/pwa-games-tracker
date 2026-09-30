# 03: Motor del Contador — iniciar y pausar (las cuatro formas)

**What to build:** desde el motor de la Ficha, iniciar el Contador de un Juego cronometra su Jugada más reciente: escribe el ancla en el Doc al instante (es lo que permite contar con la app cerrada), pasa la Jugada a Estado Jugando si no lo estaba —con la fecha de inicio auto-rellenada solo si faltaba, reutilizando la semántica existente; esto también reabre partidas Terminadas/Abandonadas— y, si ya había otro Contador en marcha de cualquier Juego, lo pausa antes dejando su tiempo a salvo. Pausar el Contador calcula el tramo transcurrido con el instante de inicio, lo deja como Tramo pendiente en la Jugada (id nuevo, segundos entero) y limpia el ancla. Las cuatro formas de pausa —manual, iniciar otro Contador, marcar la Jugada Terminado/Abandonado, añadir Jugada— comparten la misma pausa. Borrar el Juego o la Jugada anclada limpia el ancla (poda mínima). Durante la marcha el Doc no se escribe por segundo: solo al iniciar (ancla) y al pausar (Tramo pendiente). Todo devuelve `Promise<Result>` como el resto del motor y muta por el cauce usual, con lo que el autoguardado y el espejo funcionan sin tocar nada.

**Blocked by:** 01 (Documento v2).

**Status:** ready-for-agent

- [x] Iniciar crea el ancla con instante de inicio inmediato y pasa la Jugada a Jugando (fecha de inicio solo si faltaba)
- [x] Iniciar sobre una Jugada Terminada/Abandonada la reabre (pasa a Jugando)
- [x] Iniciar un segundo Contador auto-pausa el primero: ancla nueva y Tramo pendiente en la Jugada anterior
- [x] Pausar manual deja Tramo pendiente y limpia el ancla
- [x] setStatus a Terminado/Abandonado y añadir Jugada auto-pausan igual
- [x] Iniciar ignora los Tramos pendientes que ya tenga la Jugada (acumulan; no bloquean el arranque)
- [x] Borrar el Juego o la Jugada anclada deja el Doc sin ancla
- [x] El Doc no sufre escrituras por segundo durante la marcha
- [x] Los comandos devuelven `Promise<Result>` y los errores llegan como Result sin lanzar
