# Convenciones de implementación · Game Tracker

Guía para cualquier agente o persona que escriba código en este repo. La spec de producto vive en `.scratch/game-tracker-pwa/spec.md`; el vocabulario de dominio en `CONTEXT.md`. Usa siempre los términos del glosario (Juego, Jugada, Estado, Estado del juego, Estantería, Panel, Ficha, Alta, Balda, placa, pastilla…).

## Stack y estilo

- **Vanilla JS** (ES modules) + Vite + vite-plugin-pwa. Sin framework de UI.
- TypeScript se usa **solo como verificador**: `npm run typecheck` (`tsc --noEmit` con `checkJs`). Tipa con JSDoc (`@param`, `@returns`, `@typedef`). `strict: true` está activado: todo el código nuevo debe pasar typecheck.
- Tests con **Vitest** (`npm test`, watch con `npm run test:watch`), entorno jsdom, `fake-indexeddb/auto` precargado en `tests/setup.js`. Los tests viven junto al código como `*.test.js` o en `tests/`.
- Lint: `npm run lint` (ESLint flat). Formato: Prettier (`npm run format`).
- Antes de dar por terminado un cambio: `npm run typecheck && npm run lint && npm test` en verde.

## Estructura

```
src/
  main.js            # punto de entrada: monta app, registra SW
  app.js             # store central (estado + pub/sub) y navegación client-side
  styles/            # tokens.css (tokens §9), base.css, components.css
  lib/               # utilidades puras de UI (dom, debounce, formato)
  domain/            # MÓDULOS PUROS, sin DOM ni IDB:
    schema.js        # constantes, factorías createGame/createPlay, tipos
    validate.js      # validación de documentos (import/conectar/export)
    selectors.js     # estado del juego, orden, búsqueda, agregaciones
  data/              # persistencia (IndexedDB, Cache Storage, OPFS, FSA)
    db.js            # wrapper IDB: stores state/meta
    library.js       # repositorio: carga, mutaciones atómicas, dirty, hash
    ...
  services/          # clientes externos (proxy IGDB), fsa, hash
  ui/                # componentes reutilizables (píldoras, chips, placas, estrellas, diálogos)
  views/             # una función de render por vista (welcome, library, game, novedades, stats, data)
worker/              # Cloudflare Worker (piezas aparte, desplegada por el usuario)
public/              # fuentes woff2, iconos, robots.txt
tests/               # setup de vitest y tests de integración
```

## Reglas

- **Dominio puro**: `src/domain/` no importa DOM, IndexedDB ni fetch. Todo lo computable (estado del juego, orden recencia+alfabético, media ★, filtros, stats) vive ahí y tiene tests.
- **Toda mutación del documento pasa por el repositorio** (`data/library.js`): reemplaza `state.doc` atómicamente, marca `dirty`, agenda autoguardado. La UI nunca escribe en IDB directamente.
- **Fechas**: `YYYY-MM-DD` para fechas de jugada; `updatedAt` ISO completo. Campo ausente = desconocido. Nunca `Date.now()` dentro de `src/domain/` — recíbelo por parámetro (testable).
- **UUID**: `crypto.randomUUID()`; en tests, jsdom/node lo provee.
- **UI strings en español**; tokens de Estado en inglés en los datos (`backlog|playing|finished|abandoned`).
- **Render**: funciones que devuelven/insertan DOM; sin virtual DOM. Usa `html` (tagged template de `src/lib/dom.js`) y `esc()` para todo texto dinámico. Re-render de la vista activa tras cada cambio de estado.
- **Navegación client-side**: las vistas (Biblioteca, Novedades, Estadísticas) son estado en el store; cero rutas de URL.
- **FSA/permisos**: feature detection (`'showOpenFilePicker' in self`), manejo de `AbortError` siempre.
- Sin comentarios salvo cuando explican una decisión no obvia (referencia a § de la spec si aplica).
- No añadas dependencias sin necesidad; el runtime de la app no debe crecer sin motivo (objetivo: fluido hasta 5.000 juegos).

## Comandos

```
$env:Path = "C:\Users\elfri\AppData\Local\Temp\opencode\node\node-v26.7.0-win-x64;$env:Path"
npm run dev        # desarrollo
npm test           # suite completa
npx vitest run src/domain/selectors.test.js   # un solo fichero
npm run typecheck
npm run lint
npm run build      # build producción (genera SW)
```
