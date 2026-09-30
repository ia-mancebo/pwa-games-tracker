# Contador en el Doc, documento v2 y tramos pendientes de revisión

El Contador de tiempo jugado necesita sobrevivir al cierre de la app: para eso su ancla (Juego, Jugada, instante de inicio) se guarda dentro del propio Doc, como un campo más de la Biblioteca, y no en el espejo de IndexedDB ni en el estado efímero de la Ficha. Cada pausa del Contador —manual, por iniciar otro, por Terminar/Abandonar la Jugada o por añadir otra— no suma directamente al Tiempo jugado: produce un **Tramo pendiente** que el usuario confirma (tal cual o con otra duración) o descarta; solo el Tramo confirmado se consolida. Ese mismo Tramo pendiente es lo que aparece al reabrir la app tras cerrarla con el Contador en marcha, con el tiempo de pared transcurrido prefillado: el usuario lo revisa y decide. El Doc sube a **v2** con los campos nuevos como opcionales: los archivos v1 siguen válidos sin migración de datos, la validación forward-only existente basta y el lector desactualizado recibe el mensaje claro "versión más nueva (v2). Actualiza la app." en vez del críptico "Campo desconocido".

## Considered Options

- Consolidar cada pausa directamente (sin pregunta): menos fricción, pero el tramo más sospechoso —el tiempo transcurrido con la app cerrada, quizá días— entraría sin revisión, justo donde el usuario quiere poder descartar.
- Extender v1 con campos nuevos en vez de subir a v2: mismo código de migración (cero), pero un lector desactualizado fallaría con el mensaje críptico de "campo desconocido" en vez del de versión futura; el mensaje entendible vale el salto de versión.
- Guardar el Contador en marcha y los Tramos pendientes fuera del Doc (IndexedDB/estado UI): evita tocar el esquema pero se pierden al limpiar el espejo o usar otro navegador.
- Truncar tramos cerrados implausibles o descartar con rastro: el usuario decidirá cada Tramo; la app ni trunca ni guarda basura.

## Consequences

- `validatePlayShape` admite en la Jugada el Tiempo jugado (segundos enteros) y los Tramos pendientes; la raíz admite el Contador en marcha. Un doc v1 sigue válido por ser campos opcionales.
- Solo puede haber un Contador en marcha en toda la Biblioteca; puede haber varios Tramos pendientes (uno por Jugada afectada).
- El Doc solo se escribe al pausar (guarda el Tramo pendiente) y al confirmar/descartar un Tramo (consolidar); el total vivo mostrado es Tiempo jugado + tramo en marcha (cálculo, no persistencia).
- La consolidación no es automática: mientras haya Tramos pendientes, el Tiempo jugado mostrado de esa Jugada es el ya guardado, y el Aviso de contador/la Ficha señalan la revisión.
