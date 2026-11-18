# Spec · Guardrails de navegador para cambios de UI, scroll y navegación

Status: ready-for-agent

## Problem Statement

Cuando pido al agente un cambio de UI, scroll o navegación, este lo verifica con la suite jsdom y da por terminado el trabajo. La suite no puede ver el comportamiento real del navegador: su `scrollTop` es una propiedad plana sin semántica de overflow ni layout, y no ejercita el botón atrás del sistema ni el historial. Así ocurrió con la regla de scroll del Panel y la Ficha: la implementación pasó typecheck, lint y la suite completa en verde, y en el navegador real la tabla del Panel («Quiero jugar») volvía arriba en lugar de conservar su posición. El repo ya tenía seis checks de navegador real (puppeteer contra un dev server de verdad), pero nada en el flujo del agente los mencionaba, el check de scroll no cubría el modo de fallo exacto que se rompió, y el script se colgaba al salir tras imprimir su veredicto.

## Solution

Los cambios de UI, scroll y navegación se verifican además en un navegador real con el check correspondiente antes de darse por terminados. El flujo del agente (AGENTS.md) nombra los checks de navegador y cuándo corre cada uno; el check de scroll cubre los modos de fallo que guarda (scroll de documento y scroll interno de las superficies fijas, botones internos y atrás del sistema); el check termina y sale limpio; y el saber sembrar datos del app para diagnosticar vive donde se usa, sin documentos nuevos.

## User Stories

1. Como mantenedor/a, quiero que el archivo de instrucciones del agente nombre los checks de navegador real, para que ningún cambio de UI/scroll/navegación se dé por verificado solo con jsdom.
2. Como mantenedor/a, quiero que el puntero diga qué check corresponde a qué tipo de cambio, para que el agente corra el relevante y no los seis siempre.
3. Como agente implementador, quiero una regla explícita «cambios de UI/scroll/navegación ⇒ check de navegador relevante», para que la verificación en navegador sea parte del criterio de terminado y no un opcional.
4. Como agente implementador, quiero que el check de scroll termine y devuelva el control al shell tras el veredicto, para que no se me agote el timeout esperando un proceso que ya acabó.
5. Como mantenedor/a, quiero que el check de scroll cubra el scroll interno de la tabla del Panel al irse a la Ficha y volver (botón «← Volver» y atrás del sistema), para que esa regresión concreta no vuelva a colarse.
6. Como mantenedor/a, quiero que el check de scroll cubra «reabrir el Panel desde la Estantería es pantalla nueva», para que la regla de llegada fresca no se rompa al tocar la navegación.
7. Como mantenedor/a, quiero que el check de scroll siga cubriendo las reglas de scroll de documento (la Estantería y el tablón repone al volver; la Ficha y el drill-down llegan arriba), para que las reglas originales sigan guardadas.
8. Como mantenedor/a, quiero que el veredicto del check sea inequívoco (RED con código de salida distinto de cero, GREEN con cero), para que yo y el agente podamos cerrarnos sobre él sin ambigüedad.
9. Como agente implementador, quiero que cada regla de scroll o navegación nueva llegue acompañada de un escenario en el check de navegador, para que la cobertura crezca al ritmo de las reglas y no después del primer incidente.
10. Como agente implementador, quiero que la suite jsdom siga siendo la puerta rápida para reglas de estado puras, para que el coste de verificar no suba para todo lo que el navegador no aporta.
11. Como agente implementador, quiero que el comentario en el punto de orden (capturar antes de tocar la clase de superficie fija) diga que jsdom no detecta violaciones y nombre el check como guardrail, para que una edición futura no deshaga el invariante sin ver la regla.
12. Como agente revisor, quiero que el estándar «UI/scroll/navegación ⇒ test:* relevante» esté escrito en el repo, para poder exigirlo en revisión sin basarme en memoria de sesiones pasadas.
13. Como agente de diagnóstico, quiero que la receta de siembra (nombre y versión de la base de datos, almacenes y claves) esté donde ya se usa — la cabecera de los checks que siembran, para reproducir el estado del app sin releer el módulo de persistencia.
14. Como mantenedor/a, quiero que los checks de navegador corran lint sin globals de navegador inventados, para que un test de navegador no falle lint por usar `MouseEvent`.
15. Como mantenedor/a, quiero que el archivo de instrucciones del agente gane una sola línea-puntero y no un párrafo por check, para que el coste de contexto por turno se quede pequeño.
16. Como mantenedor/a, quiero que el porqué del race sobre el cierre del navegador y el watchdog esté comentado en el propio script, para que quien lo edite no «simplifique» el colgado de vuelta.
17. Como mantenedor/a, quiero que el check no deje procesos Edge huérfanos tras terminar, para que mis corridas repetidas no acumulen basura de proceso.
18. Como agente implementador, quiero que la decisión de no escribir ADR para este trabajo quede registrada en el spec, para que nadie busque una justificación arquitectónica que no existe.

## Implementation Decisions

- El flujo del agente (AGENTS.md) gana UNA línea-puntero, redactada con el disparador delante: cambios de UI/scroll/navegación ⇒ correr el `test:*` de navegador relevante. Detrás van los seis scripts existentes (`test:scroll`, `test:layout`, `test:layout:mobile`, `test:overflow:mobile`, `test:add-online:overflow`, `test:aviso`) con su asunto en tres o cuatro palabras cada uno. Prosa puntero, sin duplicar lo que `package.json` ya dice: los nombres de script son el entorno, no un cache.
- El check de scroll (ya aplicado en la sesión que originó este spec) cubre: Ficha y drill-down de Novedades llegan arriba; la Estantería y el tablón repone su scroll de documento al volver por el atrás del sistema; la tabla del Panel repone su scroll interno al volver de la Ficha; reabrir el Panel desde la Estantería es pantalla nueva (tabla arriba). Cada aserción muestrea la posición en varios instantes (0/100/300/600 ms) para que un pisado tardío del navegador no pase desapercibido.
- La siembra y el clic en el escenario del Panel ocurren en una misma tarea síncrona dentro de la página: un clic de puntero (el conductor de la prueba) auto-scrollea el cardbox y arruinaría la medición; el clic sintetizado por JS no. El porqué queda en comentario del script.
- La salida limpia del check (ya aplicada): carrera de 5 s sobre el cierre del navegador (puede colgar tras navegación por historial con Edge headless y service worker) más un watchdog sin referencia de 60 s que fuerza la salida con el código ya fijado. El veredicto se imprime antes de la limpieza, así que un colgado nunca oculta el resultado.
- El check fija el código de salida: RED ⇒ distinto de cero; GREEN ⇒ cero. No hay CI en el repo: el guardrail vive en el flujo del agente (puntero en AGENTS.md) y en los scripts de `package.json`, no en un pipeline.
- Globals de navegador para los scripts de Node (ya aplicado): `MouseEvent` añadido a los globals compartidos del linter. Regla para el futuro: un global de navegador que un check necesite entra en esa lista, no se evita con malabares.
- El invariante de orden en el bucle de render (capturar el scroll de la superficie saliente ANTES de cambiar la clase de superficie fija; el cardbox pierde su `overflow-y` al perder la clase y su `scrollTop` pasa a leer 0) queda comentado en el sitio (ya aplicado), con la mención explícita de que jsdom no lo puede vigilar y de cuál es el guardrail.
- Sin ADR: el trabajo es reversible, poco sorprendente y sin trade-off arquitectónico real (decisión ya tomada con el mantenedor en la sesión de grilling).
- Sin documentos nuevos para la siembra: el conocimiento vive en las cabeceras de los checks que siembran (co-localización); el módulo de persistencia conserva su comentario con nombre de base, versión y claves. Si el coste de reencontrarlo vuelve a doler, se reevalúa.

## Testing Decisions

- Un buen test aquí mide comportamiento externo: posiciones de scroll del documento y de la tabla en instantes concretos tras una navegación real, y nada de internos de módulos (no se espía el mapa de posiciones guardadas ni el bucle de render).
- El seam principal es el más alto posible y ya existe: la app renderizada en un navegador real (Edge headless vía puppeteer-core) contra un dev server real, conduciendo la UI con sus selectores y el historial del navegador. Es un solo seam para todo el dominio de scroll/navegación; no se proponen seams nuevos.
- El seam jsdom (suite vitest) cubre las reglas de estado que no dependen de layout ni de historial: conservación de búsqueda y filtros, reglas de superficie, intents de navegación. Es la puerta rápida; el navegador es la puerta lenta pero decisiva.
- Prior art: el propio check de scroll (ayudantes `tapPos` y aserción con muestras temporales), la suite jsdom de scroll (montaje con `createApp`, `scrollY` simulado, `scrollTo` espiado) y la suite de backnav (historial falso). Las pruebas nuevas del check siguen el patrón de las existentes: sembrar → medir antes → navegar → muestrear después.
- Lo que NO se testea: el interior del check de scroll (se considera el guardrail, no la cosa guardada) ni el comportamiento de vitest.

## Out of Scope

- Cablear los checks a CI: el repo no tiene pipeline y no se propone crearlo.
- Pre-commit hooks o lint-staged: no se pidieron; el flujo del agente es el lugar del guardrail.
- Extender los otros cinco checks de navegador (layout, overflow móvil, alta online, aviso) a nuevos escenarios: cada uno crece cuando su dominio lo pida.
- Cambiar comportamiento del app: la regla de scroll del Panel y la Ficha ya está implementada y verificada; este spec es la infraestructura que evita que vuelva a romperse sin ser vista.
- Migrar de puppeteer-core/Edge a Playwright u otro conductor.
- ADRs, cambios de glosario (el scroll es implementación, no dominio) y cambios de las reglas de navegación existentes (ADR-0005/0007/0008 se respetan tal cual).

## Further Notes

- Origen: retrospectiva de la sesión que implementó «el Panel conserva su scroll interno al volver de la Ficha». Hallazgos 1–5 de esa retro son este spec completo: (1) puntero en AGENTS.md a los checks de navegador, (2) cobertura del check de scroll, (3) colgado al salir, (4) globals de lint, (5) siembra de datos para diagnóstico.
- Estado al publicar: los hallazgos 2, 3, 4 y el fix del invariante de orden ya están aplicados y verificados (check de scroll en GREEN con el escenario del Panel, typecheck, lint y 698 tests en verde). El trabajo pendiente para el agente es el hallazgo 1 (la línea-puntero en AGENTS.md) y verificar que lo demás está en su sitio.
- El hallazgo 5 no pide trabajo nuevo: su remedia es la co-localización ya practicada y el puntero del hallazgo 1, que baja el coste de reencontrar la siembra.
- La regla de dominio de scroll vigente (ADR-0005/0008 y el comentario de reglas del módulo de scroll) se respeta; este spec no la toca.
