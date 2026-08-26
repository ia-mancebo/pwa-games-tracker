# Setup del Worker IGDB · Game Tracker

Guía para desplegar el proxy de una sola vez (~30–60 min). Al terminar tendrás una URL `https://<worker>.<cuenta>.workers.dev` lista para pegar en la app.

## 0 · Qué necesitas

- Una **cuenta de Twitch** con la **verificación en dos pasos (2FA) activada** — Twitch no deja crear aplicaciones sin ella.
- Una **cuenta gratuita de Cloudflare** (el plan Free basta: 100 000 peticiones/día).
- El contenido de [`worker/worker.js`](./worker.js), [`worker/lib.js`](./lib.js) **y** [`worker/admit.js`](./admit.js) de este repo (son TRES archivos: `worker.js` importa a los otros dos).

## 1 · Crear la aplicación en dev.twitch.tv (~10 min)

1. Activa el 2FA si no lo tienes: <https://www.twitch.tv/settings/security>.
2. Entra en <https://dev.twitch.tv/console> e inicia sesión.
3. Pulsa **Register Your Application**:
   - *Name*: `game-tracker-proxy` (o el que prefieras).
   - *OAuth Redirect URLs*: `http://localhost` (es obligatorio rellenar algo; este proxy usa client credentials y nunca hace redirect).
   - *Category*: `Application Integration` (o `Other`).
4. Tras crearla, entra en **Manage** → copia el **Client ID**.
5. Pulsa **New Secret**, copia el **Client Secret inmediatamente** (solo se muestra una vez; podrás generarlo otra vez si lo pierdes).

> Nunca pegues estos valores en el código de la app ni en este repo: solo en los secrets del Worker (paso 3).

## 2 · Crear el Worker en Cloudflare (~15 min)

1. Entra en <https://dash.cloudflare.com> y crea cuenta si no tienes.
2. Menú lateral: **Workers & Pages** → **Create application** → **Create Worker**.
3. Ponle nombre (p. ej. `game-tracker-igdb`) → **Deploy** con el código de ejemplo → después **Edit code**.
4. Borra todo el editor y pega el contenido íntegro de `worker/worker.js`. Añade después dos archivos nuevos junto a él (panel de archivos del editor, botón **+**), nómbralos **exactamente `lib.js`** y **exactamente `admit.js`**, y pega en cada uno el contenido íntegro de su archivo del repo.
   - Si tu editor no permite archivos adicionales: crea UN solo archivo pegando primero TODO `lib.js`, debajo TODO `admit.js` y, debajo, `worker.js` sin su bloque de `import { … } from './lib.js'` ni el de `import { … } from './admit.js'`. El resultado es autocontenido y equivalente.
5. Pulsa **Deploy**. No hay nada que editar en el código: los orígenes autorizados se configuran en el paso 3.
6. Vuelve al panel del Worker y apunta tu URL: `https://<nombre-worker>.<subdominio-cuenta>.workers.dev`.

## 3 · Configurar los secretos (~5 min)

En el flujo del dashboard NO existe un archivo `.env`: el equivalente son las **Variables and Secrets** del panel.

1. En el panel del Worker: **Settings** → **Variables and Secrets**.
2. Pulsa **Add** y añade TRES variables, todas de tipo **Secret** (quedan cifradas y no se vuelven a mostrar):
   - Nombre exacto: `CLIENT_ID` → valor: tu Client ID de Twitch.
   - Nombre exacto: `CLIENT_SECRET` → valor: tu Client Secret de Twitch.
   - Nombre exacto: `ALLOWED_ORIGINS` → valor: tu origen de GitHub Pages, p. ej. `https://<tu-usuario>.github.io`. Puedes listar varios separados por comas: `https://a.github.io,https://b.pages.dev`.
3. Guarda/**Deploy** para aplicar. Los secretos quedan disponibles para la siguiente ejecución.

> Detalles que importan:
>
> - Los nombres van EXACTOS, en mayúsculas y con guion bajo: el código lee `env.CLIENT_ID`, `env.CLIENT_SECRET` y `env.ALLOWED_ORIGINS`. Cualquier otra variante (`client_id`, `TWITCH_SECRET`…) provoca el error `500 «Worker not configured»`; sin la de orígenes, todo responde `403 «Origen no autorizado»`.
> - El valor de `ALLOWED_ORIGINS` es SOLO el origen: sin ruta `/game-tracker/`, sin barra final, con `https://`. Es lo único que diferencia a tu app de un desconocido.
> - Fail-closed: mientras `ALLOWED_ORIGINS` no esté configurada, el Worker rechaza con `403` absolutamente todo salvo `/api/health`. Desplegar antes de configurar es seguro por defecto.
> - El tipo debe ser **Secret**, no texto plano: las variables de texto son visibles en el panel y al exportar la configuración.
> - Si algún día despliegas con la CLI de Wrangler en vez del dashboard: el equivalente local del `.env` es un archivo `.dev.vars` junto al Worker, y los de producción se crean con `npx wrangler secret put CLIENT_ID` (y lo mismo para `CLIENT_SECRET` y `ALLOWED_ORIGINS`). Para esta guía no hace falta nada de eso.

## 4 · Verificar el deploy (~5 min)

Desde un navegador o terminal (`curl.exe` viene con Windows):

```powershell
curl.exe https://<nombre-worker>.<subdominio>.workers.dev/api/health
# {"ok":true}   <- pública por diseño, ideal tras cada deploy

curl.exe -H "Origin: https://<tu-usuario>.github.io" "https://<nombre-worker>.<subdominio>.workers.dev/api/search?q=celeste"
# {"results":[{"igdbId":1877,"title":"Celeste",...}]}

curl.exe "https://<nombre-worker>.<subdominio>.workers.dev/api/novedades"
# {"error":"Origen no autorizado."}  <- 403: curl no manda Origin, comportamiento ESPERADO
```

Las formas exactas están documentadas en [`CONTRACT.md`](./CONTRACT.md). Si `/api/health` responde pero las demás dan `500 «Worker not configured»`, revisa los secretos `CLIENT_ID`/`CLIENT_SECRET`; si dan `403`, revisa `ALLOWED_ORIGINS`.

La prueba definitiva es una búsqueda desde la app desplegada: ahí manda tu navegador el Origin correcto y verás datos reales.

## 5 · Conectar con la app

Pega la URL base (`https://<nombre-worker>.<subdominio>.workers.dev`) en la app: botón **Datos** → sección **Conexión**. Queda guardada dentro del `game-tracker.json` del usuario y viaja con su biblioteca.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Twitch devuelve `{"status":400,"message":"invalid_client"}` | Client ID o Secret mal copiados, o la app quedó sin guardar | Revisa ambos valores; genera un Secret nuevo en dev.twitch.tv y actualiza el secreto del Worker |
| No puedes crear la app en dev.twitch.tv | 2FA de la cuenta de Twitch desactivado | Actívalo en twitch.tv/settings/security y reintenta |
| `500` con «Worker not configured» | Secretos ausentes o guardados tras una petición fallida antigua | Verifica nombres exactos (`CLIENT_ID`, `CLIENT_SECRET`, tipo *Secret*) y vuelve a probar |
| `502` «No se pudo contactar con IGDB» | Caída puntual de IGDB/Twitch o token rechazado | Espera un minuto y reintenta; si persiste, comprueba que el Client ID sigue activo en dev.twitch.tv |
| `403` «Origen no autorizado» en la app | La secret `ALLOWED_ORIGINS` no existe, está mal escrita o su valor no coincide con el origen real de la app (barra final, ruta `/game-tracker/`, `http` en vez de `https`) | Revisa el paso 3: nombre exacto `ALLOWED_ORIGINS` y valor SOLO con el origen; guarda/**Deploy** para aplicar |
| Datos repetidos aunque debería refrescar | Caché del Worker por datacenter | `/api/novedades` caduca a las 6 h y populares/esperados a las 24 h; para forzar, espera el TTL o prueba con un parámetro inocuo (`?t=1`) |

Para purgar la caché manualmente desde el dashboard: panel del Worker → pestaña **Logs**/**Deployments** → *Quick edit* + redeploy reinicia el isolate; la caché de borda caduca sola según los TTL anteriores.
