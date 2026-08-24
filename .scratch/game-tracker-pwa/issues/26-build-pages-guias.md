# 26 · Build + despliegue Pages + guías de usuario

**Status:** ready-for-agent
**Blocked by:** 25 · PWA: manifest + service worker + actualizaciones

## What to build

La entrega final que hace la app pública e instalable desde GitHub Pages:

- `base: '/<repo>/'` en Vite (reescribe assets, CSS y HTML; deriva `scope`/`start_url`; URLs construidas en runtime vía `import.meta.env.BASE_URL`, literal y no indexado).
- **Workflow de GitHub Actions** para Pages (Settings → Pages → Source: GitHub Actions; guía oficial de Vite como plantilla). Con esa fuente Jekyll no interviene.
- **README del usuario**: setup completo end-to-end — app en dev.twitch.tv (2FA), pegar el Worker + secrets en Cloudflare, pegar la URL `https://<worker>.workers.dev` como constante, ejecutar el deploy manual, verificar instalación en Android 11 con Chrome actual (si Pages sirviera el manifest con MIME raro, renombrar a `manifest.json` vía `manifestFilename`) y verificación offline post-deploy.
- Verificación end-to-end final sobre el deploy real: navegación, biblioteca offline, carátulas, Novedades degradado, instalación PWA.

## Acceptance criteria

- [ ] Deploy de prueba verde en Pages sirviendo la app bajo subpath, sin assets rotos.
- [ ] Instalable en Android 11 / Chrome escritorio desde la URL pública; funciona offline tras la primera visita.
- [ ] Un usuario nuevo completa setup Worker + deploy siguiendo solo el README.
- [ ] Sin secretos en el cliente: el repo puede ser público.
