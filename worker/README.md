# Setup del Worker IGDB · Game Tracker

Guía para desplegar el proxy de una sola vez (~30–60 min). Al terminar tendrás una URL `https://<worker>.<cuenta>.workers.dev` lista para pegar en la app.

## 0 · Qué necesitas

- Una **cuenta de Twitch** con la **verificación en dos pasos (2FA) activada** — Twitch no deja crear aplicaciones sin ella.
- Una **cuenta gratuita de Cloudflare** (el plan Free basta: 100 000 peticiones/día).
- El contenido de [`worker/worker.js`](./worker.js) de este repo.

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
4. Borra todo el editor y pega el contenido íntegro de `worker/worker.js` → **Deploy**.
5. Vuelve al panel del Worker y apunta tu URL: `https://<nombre-worker>.<subdominio-cuenta>.workers.dev`.

## 3 · Configurar los secretos (~5 min)

1. En el panel del Worker: **Settings** → **Variables and Secrets**.
2. Añade dos variables de tipo **Secret** (quedan cifradas y no se vuelven a mostrar):
   - `CLIENT_ID` → el Client ID de Twitch.
   - `CLIENT_SECRET` → el Client Secret de Twitch.
3. Guarda. Los secretos están disponibles en el próximo deploy/ejecución.

## 4 · Verificar el deploy (~5 min)

Desde un navegador o terminal (`curl.exe` viene con Windows):

```powershell
curl.exe https://<nombre-worker>.<subdominio>.workers.dev/api/health
# {"ok":true}

curl.exe "https://<nombre-worker>.<subdominio>.workers.dev/api/search?q=celeste"
# {"results":[{"igdbId":1877,"title":"Celeste",...}]}

curl.exe https://<nombre-worker>.<subdominio>.workers.dev/api/novedades
# {"recientes":[12],"proximos":[12],"populares":[6],"esperados":[6],"generatedAt":"..."}
```

Las formas exactas están documentadas en [`CONTRACT.md`](./CONTRACT.md). Si `/api/health` responde pero las demás dan `500 «Worker not configured»`, revisa el paso 3.

## 5 · Conectar con la app

Pega la URL base (`https://<nombre-worker>.<subdominio>.workers.dev`) en la app: botón **Datos** → sección **Conexión**. Queda guardada dentro del `game-tracker.json` del usuario y viaja con su biblioteca.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Twitch devuelve `{"status":400,"message":"invalid_client"}` | Client ID o Secret mal copiados, o la app quedó sin guardar | Revisa ambos valores; genera un Secret nuevo en dev.twitch.tv y actualiza el secreto del Worker |
| No puedes crear la app en dev.twitch.tv | 2FA de la cuenta de Twitch desactivado | Actívalo en twitch.tv/settings/security y reintenta |
| `500` con «Worker not configured» | Secretos ausentes o guardados tras una petición fallida antigua | Verifica nombres exactos (`CLIENT_ID`, `CLIENT_SECRET`, tipo *Secret*) y vuelve a probar |
| `502` «No se pudo contactar con IGDB» | Caída puntual de IGDB/Twitch o token rechazado | Espera un minuto y reintenta; si persiste, comprueba que el Client ID sigue activo en dev.twitch.tv |
| Error CORS en la app | La respuesta no llega del Worker (o se tocó `ALLOWED_ORIGIN`) | Comprueba que la URL apunta al Worker y que `ALLOWED_ORIGIN` sigue como `'*'` en `worker.js` |
| Datos repetidos aunque debería refrescar | Caché del Worker por datacenter | `/api/novedades` caduca a las 6 h y populares/esperados a las 24 h; para forzar, espera el TTL o prueba con un parámetro inocuo (`?t=1`) |

Para purgar la caché manualmente desde el dashboard: panel del Worker → pestaña **Logs**/**Deployments** → *Quick edit* + redeploy reinicia el isolate; la caché de borda caduca sola según los TTL anteriores.
