# Game Tracker

Tu biblioteca personal de videojuegos como **PWA 100 % estática**: estantería con Estados (Quiero jugar, Jugando, Terminado, Abandonado), Novedades del calendario IGDB y estadísticas. Funciona **sin conexión** y todos tus datos viven en **un único archivo `game-tracker.json`** que tú posees y sincronizas entre dispositivos por tus propios medios.

- **Stack**: Vanilla JS + Vite + vite-plugin-pwa; Cloudflare Worker como proxy de la API de IGDB.
- **Privacidad**: sin cuentas ni backend propio. Los secretos de Twitch/IGDB viven solo en TU Worker de Cloudflare — en el cliente no hay ningún secreto, así que este repo puede ser público sin riesgo.

## Requisitos

- Una **cuenta de Twitch con la verificación en dos pasos (2FA)** activada (sin ella Twitch no permite crear aplicaciones).
- Una **cuenta gratuita de Cloudflare** (plan Free: 100 000 peticiones/día, más que suficiente).
- Una **cuenta de GitHub** para publicar tu copia en Pages.

Coste total: **0 €**.

## Paso 1 · Crear la aplicación en dev.twitch.tv (~10 min)

IGDB exige un token de OAuth de Twitch, y Twitch exige una aplicación registrada:

1. Activa el 2FA si no lo tienes: <https://www.twitch.tv/settings/security>.
2. Entra en <https://dev.twitch.tv/console> → **Register Your Application**:
   - *Name*: `game-tracker-proxy` (o el que prefieras).
   - *OAuth Redirect URLs*: `http://localhost` (obligatorio rellenar algo; este flujo nunca hace redirect).
   - *Category*: `Application Integration`.
3. Copia el **Client ID** y genera un **Client Secret** (solo se muestra una vez).

> Nunca pegues estos valores en el código ni en el repo: solo en los secrets del Worker (paso 2).

## Paso 2 · Desplegar el proxy en Cloudflare (~30 min)

1. Entra en <https://dash.cloudflare.com> → **Workers & Pages** → **Create application** → **Create Worker**, ponle nombre (p. ej. `game-tracker-igdb`) y despliega el código de ejemplo.
2. **Edit code**: borra todo y pega el contenido íntegro de [`worker/worker.js`](./worker/worker.js). Después añade dos archivos nuevos junto a él (panel de archivos del editor, botón **+**), nómbralos exactamente `lib.js` y `admit.js`, y pega en cada uno el contenido íntegro de [`worker/lib.js`](./worker/lib.js) y [`worker/admit.js`](./worker/admit.js). Si tu editor no permite archivos extra: pega primero TODO `lib.js`, debajo TODO `admit.js` y debajo `worker.js` SIN sus bloques de `import` (queda autocontenido).
3. Pulsa **Deploy**: no hay nada que editar en el código. Los orígenes autorizados se configuran como secreta, no tocando archivos.
4. Después: **Settings** → **Variables and Secrets** (el equivalente del `.env` en Cloudflare; no existe tal archivo en el dashboard). Añade TRES variables de tipo **Secret**, con estos nombres EXACTOS:
   - `CLIENT_ID` → el Client ID de Twitch.
   - `CLIENT_SECRET` → el Client Secret de Twitch.
   - `ALLOWED_ORIGINS` → tu origen de GitHub Pages: `https://<tu-usuario>.github.io` — sin ruta ni barra final (varios: separados por comas).

    Detalles y errores típicos: [`worker/README.md`, paso 3](./worker/README.md#3--configurar-los-secretos-5-min).
5. Apunta tu URL: `https://<nombre-worker>.<subdominio>.workers.dev`.

Verifica desde un terminal (`curl.exe` viene con Windows):

```powershell
curl.exe https://<nombre-worker>.<subdominio>.workers.dev/api/health
# {"ok":true}

curl.exe -H "Origin: https://<tu-usuario>.github.io" "https://<nombre-worker>.<subdominio>.workers.dev/api/search?q=zelda"
# {"results":[{"igdbId":…,"title":"The Legend of Zelda",…}]}
```

Ojo: fuera del navegador toda llamada sin el Origin correcto responde `403 «Origen no autorizado»` — es la cerradura funcionando, no un fallo. Solo `/api/health` es pública. La prueba definitiva es buscar desde tu app desplegada; si la app ve `403`, revisa la secret `ALLOWED_ORIGINS` del paso 2.

Si `/api/search` responde, tienes búsqueda y Novedades. La guía completa con solución de problemas está en [`worker/README.md`](./worker/README.md).

## Paso 3 · Configurar la URL en la app

Abre tu app desplegada (paso 4) y pulsa **Datos** → sección **Conexión**: pega ahí tu URL `https://<worker>.workers.dev` y pulsa **Guardar conexión**. La misma URL alimenta las búsquedas («Añadir juego» → **Buscar online**) y la pestaña **Novedades**. La Conexión se guarda **dentro de tu `game-tracker.json`**, así que viaja con tu biblioteca: al conectar el mismo archivo en otro dispositivo, la configuración ya está.

## Paso 4 · Publicar tu copia en GitHub Pages (~10 min)

1. Crea un repositorio llamado **`game-tracker`** y sube este código a la rama `main`. El nombre importa: la app se construye con base `/game-tracker/`, que debe coincidir con el repo (si renombras el repo, cambia `base` en `vite.config.js`).
2. En el repo: **Settings** → **Pages** → **Source**: **GitHub Actions** (así Jekyll no interviene).
3. Haz push a `main` (o ejecuta **Actions** → *Deploy a GitHub Pages* → **Run workflow**): el workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) construye la app y la publica.
4. Tu app quedará en `https://<tu-usuario>.github.io/game-tracker/`.

Para actualizar la app basta con nuevos pushes a `main`: el workflow redespliega solo.

### Si el manifest llegara con MIME incorrecto

Tras el primer deploy, comprueba `curl -I https://<tu-usuario>.github.io/game-tracker/manifest.webmanifest`. GitHub Pages sirve `.webmanifest` como `application/manifest+json`, pero si algún día sirviera un MIME raro, la solución es editar `vite.config.js` y añadir `manifestFilename: 'manifest.json'` dentro de `pwaOptions` (el manifest pasará a servirse como `.json`).

## Paso 5 · Verificar instalación PWA y offline

En **Android 11 con Chrome actualizado**:

1. Visita la URL pública una vez con conexión (Chrome exige haber interactuado con la página).
2. Menú ⋮ → **Añadir a pantalla de inicio** → **Instalar** (o el banner automático). El icono aparece en el launcher con su variante maskable.
3. Activa el modo avión y abre la app instalada: debe funcionar la navegación entre pestañas, la biblioteca completa y sus carátulas. **Novedades** entra en modo degradado («Sin conexión — mostrando la última instantánea») si ya descargaste el calendado alguna vez.

En **escritorio (Chrome)**: icono de instalación en la barra de direcciones (o ⋮ → *Instalar Game Tracker*); la ventana standalone funciona igual offline.

Las actualizaciones de la app se detectan solas al abrirla con conexión: aparecerá «Nueva versión disponible» con botón **Recargar**.

## Paso 6 · Primer uso

1. La pantalla de bienvenida ofrece dos caminos: **Importar mi game-tracker.json** (si vienes de otra instalación) o **Empezar biblioteca nueva**.
2. Opcionalmente **conecta un archivo** real del disco (botón **Datos** → *Conectar o importar .json…*): la app escribirá ahí cada vuelco verificado, y ese archivo lo sincronizas entre dispositivos como quieras (Drive, Syncthing, USB…). Sin conectar, la biblioteca vive solo en ese navegador.
3. En **Datos** tienes además exportación manual, nombre sugerido de copia y las **copias de seguridad automáticas** (los últimos 3 vuelcos exitosos, guardados en el almacenamiento privado del navegador) con botón **Restaurar**.

## Estructura del repo

```
index.html            entrada única de la app
src/                  código (domain/, data/, services/, ui/, views/)
public/               fuentes woff2, iconos, robots.txt
worker/               proxy Cloudflare Worker + su guía (piezas aparte)
.github/workflows/    deploy a GitHub Pages
docs/                 convenciones de desarrollo
tests/                suite de Vitest
```
