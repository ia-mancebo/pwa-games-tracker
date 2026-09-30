# 06: Ficha — botón Iniciar/Pausar con tiempo vivo y consejo de pausa

**What to build:** en la Ficha, el usuario cronometra su partida sin salir de la app: botón Iniciar/Pausar en el héroe y en la tarjeta de la Jugada más reciente. Mientras corre, la duración mostrada en héroe y tarjeta es el total vivo = Tiempo jugado existente + tramo aún no pausado (cálculo sobre un tictac global mínimo del shell; el Doc no se escribe por segundo). Al pausar manualmente, un consejo in situ pregunta qué hacer con el tiempo contado, prefillado con lo realmente contado: guardar tal cual, editarlo y guardar, o descartarlo; cerrar el consejo sin decidir deja el Tramo pendiente para revisar después. Las auto-pausas (iniciar otro Contador, Terminar/Abandonar, añadir Jugada) nunca preguntan: dejan el Tramo pendiente y la Ficha lo señaliza.

**Blocked by:** 02 (Formato de tiempo compartido), 03 (Motor del Contador: iniciar y pausar), 04 (Motor: consolidar Tramos).

**Status:** ready-for-agent

- [x] El botón arranca el Contador (ancla en el Doc, Jugada a Jugando) y pasa a Pausar
- [x] El tiempo mostrado avanza en vivo y coincide con Tiempo jugado + tramo en marcha
- [x] Pausar abre el consejo prefillado con lo contado; las tres salidas operan por los comandos del motor (guardar tal cual / editar y guardar / descartar)
- [x] Cerrar el consejo sin decidir deja el Tramo pendiente
- [x] Con auto-pausa no hay consejo: queda pendiente y la Ficha lo señaliza
- [x] El tictac es efímero (no escribe Doc por segundo) y se detiene sin Contador en marcha
