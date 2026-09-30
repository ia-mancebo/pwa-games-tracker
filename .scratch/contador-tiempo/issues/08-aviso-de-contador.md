# 08: Aviso de contador en todas las pantallas

**What to build:** mientras haya un Contador en marcha o un Tramo pendiente, una barra fija presente en todas las pantallas (las tres pestañas y la Ficha) muestra el Juego, el tiempo transcurrido en vivo y un botón de Pausar inline, y señala los Tramos pendientes de revisión. Pulsar el resto del aviso abre la Ficha de su Juego (navegación existente, con su pila atrás). Vive en el shell como estado efímero global mínimo, compartiendo el tictac del total vivo; con el ancla huérfana o sin nada que mostrar no aparece ni rompe.

**Blocked by:** 06 (Ficha: botón Iniciar/Pausar con tiempo vivo), 04 (Motor: consolidar Tramos).

**Status:** ready-for-agent

- [x] Visible en Estantería, Panel, Ficha, Novedades y Estadísticas con Contador en marcha
- [x] Tiempo en vivo (tictac global compartido) y Pausar inline operan por los comandos del motor
- [x] Señala los Tramos pendientes de revisión; visible también con solo pendientes y sin Contador en marcha
- [x] Pulsarlo abre la Ficha de su Juego con pila atrás; Pausar no navega
- [x] Sin Contador ni pendientes no se muestra; ancla huérfana no rompe ni se muestra
- [x] Sobrevive a cambios de pestaña sin perder el conteo (el ancla vive en el Doc)
