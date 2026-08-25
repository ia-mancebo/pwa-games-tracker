# 26 Â· Build + despliegue Pages + guÃ­as de usuario

**Status:** resolved
**Blocked by:** 25 Â· PWA: manifest + service worker + actualizaciones

## What to build

La entrega final que hace la app pÃºblica e instalable desde GitHub Pages:

- `base: '/<repo>/'` en Vite (reescribe assets, CSS y HTML; deriva `scope`/`start_url`; URLs construidas en runtime vÃ­a `import.meta.env.BASE_URL`, literal y no indexado).
- **Workflow de GitHub Actions** para Pages (Settings â†’ Pages â†’ Source: GitHub Actions; guÃ­a oficial de Vite como plantilla). Con esa fuente Jekyll no interviene.
- **README del usuario**: setup completo end-to-end â€” app en dev.twitch.tv (2FA), pegar el Worker + secrets en Cloudflare, pegar la URL `https://<worker>.workers.dev` como constante, ejecutar el deploy manual, verificar instalaciÃ³n en Android 11 con Chrome actual (si Pages sirviera el manifest con MIME raro, renombrar a `manifest.json` vÃ­a `manifestFilename`) y verificaciÃ³n offline post-deploy.
- VerificaciÃ³n end-to-end final sobre el deploy real: navegaciÃ³n, biblioteca offline, carÃ¡tulas, Novedades degradado, instalaciÃ³n PWA.

## Acceptance criteria

- [ ] Deploy de prueba verde en Pages sirviendo la app bajo subpath, sin assets rotos.
- [ ] Instalable en Android 11 / Chrome escritorio desde la URL pÃºblica; funciona offline tras la primera visita.
- [ ] Un usuario nuevo completa setup Worker + deploy siguiendo solo el README.
- [ ] Sin secretos en el cliente: el repo puede ser pÃºblico.
