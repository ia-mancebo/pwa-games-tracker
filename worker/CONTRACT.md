# Contrato JSON del Worker · Game Tracker

Este documento fija el contrato entre el Cloudflare Worker (ticket 20) y los clientes de la app (tickets 21 y 23). Si algún día cambia una forma aquí descrita, se actualiza este archivo y los tickets afectados en la misma sesión.

## Generalidades

- **Base URL**: `https://<worker>.<cuenta>.workers.dev` (la URL exacta sale del dashboard de Cloudflare tras el deploy; ver `worker/README.md`).
- **Métodos**: solo `GET`. `OPTIONS` responde preflight con `204` (solo desde un origen autorizado).
- **Admisión (CORS)**: toda petición debe venir de un **origen autorizado** (cabecera `Origin`), configurado como la secret `ALLOWED_ORIGINS` del Worker (`worker/admit.js`). Sin ese origen —o sin cabecera— responde `403 {"error":"Origen no autorizado."}` incluso fuera del navegador (curl, scripts, otro sitio web). Solo `/api/health` está exenta. Las respuestas llevan `Access-Control-Allow-Origin` como eco del `Origin` admitido de ESA petición, añadido tras servir desde caché. Si `ALLOWED_ORIGINS` no existe o queda vacía, se rechaza todo salvo health (fail-closed).
- **Content-Type**: `application/json` en todos los cuerpos.
- **Errores**: siempre `{ "error": string }` con el código HTTP adecuado. Nunca incluyen secretos ni trazas.

### Tipos

```ts
Genre = { id: number, name: string }

Game = {
  igdbId: number          // identificador numérico de IGDB
  title: string           // nombre del juego
  releaseDate: string | null  // "YYYY-MM-DD" derivada de epoch UTC; null = desconocida
  coverUrl: string | null     // https://images.igdb.com/igdb/image/upload/t_cover_big/<image_id>.jpg; null = sin carátula
  description: string         // summary truncado a ~600 caracteres (acabado en «…» si se cortó); "" si no hay
  genres: Genre[]             // puede ser []
  platforms: Genre[]          // puede ser []
  screenshots: string[]       // máximo 5 URLs t_screenshot_big; galería solo online, puede ser []
}
```

---

## Endpoints

### `GET /api/health`

Comprobación de vida. Responde **sin necesidad de secretos configurados**, útil justo después del deploy.

```json
{ "ok": true }
```

### `GET /api/search?q=<texto>`

Búsqueda por título contra IGDB (`search "…"` sobre juegos, excluyendo versiones parentales: mods, bundles, recopilaciones). Devuelve **hasta 12** resultados por relevancia de IGDB.

- Parámetro obligatorio `q`; vacío o ausente → `400`.

**200 OK**

```json
{
  "results": [
    {
      "igdbId": 1877,
      "title": "Celeste",
      "releaseDate": "2018-01-25",
      "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1nij.jpg",
      "description": "A platformer for those who are determined to climb the mountain anyway…",
      "genres": [
        { "id": 8, "name": "Platform" },
        { "id": 32, "name": "Indie" }
      ],
      "platforms": [
        { "id": 6, "name": "PC (Microsoft Windows)" },
        { "id": 48, "name": "PlayStation 4" },
        { "id": 130, "name": "Nintendo Switch" }
      ]
    }
  ]
}
```

### `GET /api/novedades`

Instantánea completa del tablón Novedades: composición fija **12 recientes / 12 próximos / 6 populares / 6 esperados** (§7.2 de la spec; los arrays pueden traer menos si IGDB no tiene datos suficientes).

- `recientes`: lanzamientos ya ocurridos (`release_dates.date <= hoy`), más nuevos primero. Un juego puede repetir fecha por plataforma: el Worker deduplica por `igdbId`.
- `proximos`: lanzamientos futuros (`date > hoy`), los inminentes primero.
- `populares`: top PopScore «IGDB Visits» (juegos más visitados ahora mismo). El tipo se resuelve por nombre tolerante («IGDB Visits», «Visits»…): IGDB renombra primitivas y el Worker no debe romperse por ello.
- `esperados`: primitiva «Most Wishlisted Upcoming» (más deseados que aún no salen).
- `generatedAt`: sello ISO del momento de generación; alimenta el «Actualizado: fecha/hora» del tablón.

**Degradación elegante del bloque PopScore**: si las llamadas de populares/esperados fallan (tipo no encontrado, IGDB caído…), la respuesta sigue siendo **200** con `populares: []` y `esperados: []`; solo `recientes`/`proximos` quedan garantizados. En ese caso la caché del tablón caduca en **30 min** (ver tabla de cachés) para recuperar el bloque antes. El cliente ya trata las cuatro secciones como arrays y pinta las baldas vacías.

**200 OK**

```json
{
  "recientes": [ { "igdbId": 246938, "title": "Hollow Knight: Silksong", "releaseDate": "2025-09-04", "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co3x0b.jpg", "description": "…", "genres": [ { "id": 8, "name": "Platform" } ], "platforms": [ { "id": 130, "name": "Nintendo Switch" } ] } ],
  "proximos": [ { "igdbId": 296504, "title": "Juego Por Anunciar", "releaseDate": "2026-11-19", "coverUrl": null, "description": "", "genres": [], "platforms": [] } ],
  "populares": [ { "igdbId": 1020, "title": "Elden Ring", "releaseDate": "2022-02-25", "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg", "description": "…", "genres": [{ "id": 12, "name": "Role-playing (RPG)" }], "platforms": [{ "id": 6, "name": "PC (Microsoft Windows)" }] } ],
  "esperados": [ { "igdbId": 300000, "title": "Juego Esperado", "releaseDate": "2027-03-10", "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/coabcd.jpg", "description": "…", "genres": [], "platforms": [] } ],
  "generatedAt": "2026-08-24T09:30:00.000Z"
}
```

*(El ejemplo muestra un elemento por sección; las respuestas reales traen 12/12/6/6 cuando hay datos.)*

---

## Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | `/api/search` sin `q` (o solo espacios) | `{ "error": "Falta el parámetro de búsqueda «q»." }` |
| `403` | Cabecera `Origin` ausente o fuera de `ALLOWED_ORIGINS`; también cuando esa secret falta o está vacía (fail-closed). Mismo cuerpo para todos los casos | `{ "error": "Origen no autorizado." }` |
| `404` | Ruta desconocida o método distinto de GET | `{ "error": "Ruta no encontrada." }` |
| `500` | Secretos `CLIENT_ID`/`CLIENT_SECRET` sin configurar, o fallo interno | `{ "error": "Worker not configured: faltan los secretos CLIENT_ID y CLIENT_SECRET." }` / `{ "error": "Error interno del Worker." }` |
| `502` | Twitch o IGDB fallaron o respondieron fuera de 2xx | `{ "error": "No se pudo contactar con IGDB." }` |

El cliente debe tratar cualquier estado ≥ 400 como «No se pudo contactar con el servicio» y servir la instantánea local (§7.3 de la spec).

---

## Cachés y refresco

| Qué | TTL | Notas |
|---|---|---|
| Respuesta completa de `/api/novedades` | **6 h** (`Cache-Control: public, max-age=21600`) | Cacheada en `caches.default` del Worker por URL; solo respuestas 200 se cachean. |
| Respuesta degradada (sin bloque PopScore) | **30 min** (`max-age=1800`) | El tablón recupera populares/esperados en cuanto IGDB vuelva a responder. |
| Bloque intermedio populares+esperados | **24 h** (`max-age=86400`) | Clave interna `/__internal__/popular-block`: PopScore diario aunque el tablón refresque cada 6 h. |
| Token de Twitch (client credentials) | `expires_in` de la respuesta (~55 días), renovado con 10 min de margen | Cacheado en memoria del isolate; ante un `401` de IGDB se invalida y se pide uno nuevo (un reintento). |

Notas de rate limit:

- IGDB permite **4 req/s y 8 concurrentes**. Un refresco de Novedades hace como máximo 5 llamadas a IGDB (2× release_dates, popularity_types, 2× popularity_primitives) + 1 de resolución de ids; con caché caliente, cero.
- La app debe refrescar Novedades como muy tarde cada 12 h (§7.2): el TTL de 6 h del Worker garantiza datos razonablemente frescos sin golpear IGDB.
- El CDN de carátulas (`images.igdb.com`) permite hotlinking; las imágenes borradas persisten ~30 días → la caché `covers-v1` de la PWA tiene margen de sobra.
