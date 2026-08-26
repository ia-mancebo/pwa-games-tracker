# La admisión del Worker es una secret fail-closed, no una constante del código

Contexto: el origen autorizado vivía en la constante `ALLOWED_ORIGIN` de `worker.js`, sustituida a mano antes de pulsar Deploy (trampa documentada como ticket 17 de `.scratch/conexion-json/spec.md`), y el CORS resultante era decorativo: `Access-Control-Allow-Origin` solo impide *leer* la respuesta desde otro navegador; las peticiones GET «simples» ejecutaban igualmente el proxy (cuota de IGDB gastada) y curl/scripts recibían la respuesta íntegra. Decisión: módulo `worker/admit.js` como única puerta de entrada — `admit(request, env)` se invoca antes que cachés y rutas, lee los orígenes autorizados de la secret/env `ALLOWED_ORIGINS` (lista separada por comas), compara con la cabecera `Origin` y devuelve `null` o un Response listo para devolver; las respuestas llevan el ACAO como eco del Origin validado añadido tras servir desde caché (`withAllowedOrigin`). Rechazo uniforme `403 {"error":"Origen no autorizado."}` (sin Origin, origin ajeno, secret ausente); fail-closed sin lista; solo `/api/health` exenta.

## Considered options

- Mantener la constante placeholder pre-Deploy: rechazada porque el paso manual es una trampa que rompe todo si se olvida y el resultado no protegía nada servidor-side.
- Fail-open (admitir todo mientras `ALLOWED_ORIGINS` falte): rechazado porque hace seguro-por-descuido lo inseguro; el fail-closed invierte el flujo de deploy: desplegar primero es seguro por defecto.
- Exención hardcoded para `http://localhost:*`: rechazada; cuando haga falta desarrollo local contra el worker desplegado, ese origin se añade a la secret.

## Consequences

- El deploy son TRES archivos (`worker.js`, `lib.js`, `admit.js`) y TRES secrets (`CLIENT_ID`, `CLIENT_SECRET`, `ALLOWED_ORIGINS`); deja de existir cualquier edición de código pre-deploy.
- Curl/direct-link reciben `403` por diseño (no mandan Origin): README y CONTRACT.md lo documentan como comportamiento esperado, síntoma tipificado en troubleshooting.
- Límite honesto: comprobar `Origin` corta abuso oportunista y gasto accidental de cuota, no adversarios que falsifiquen cabeceras; si algún día hiciera falta protección real, la vía es una clave compartida o Cloudflare Access, y esto se reabre con su propio ADR.
- Con varios orígenes configurados funciona porque el ACAO nunca va horneado en respuestas cacheadas: se añade tras la caché por petición; mantener esa disciplina al tocar la ruta de novedades.
- Supersede al ticket 17 («placeholder evidente»): futuras revisiones de arquitectura no deben re-sugerir constantes de origen ni fail-open.
