# 04 · Grilling: esquema del .json v1

Type: grilling
Status: resolved
Blocked by: 01

## Question

¿Cuál es el esquema exacto del `.json` v1, definido por nosotros y versionado dentro del archivo?

- Campos por entrada: identificadores de la fuente elegida (ver ticket 01), título, carátula (URL), estado, valoración, plataformas múltiples, géneros, etiquetas propias, notas, fecha de fin.
- Estructura raíz del documento y campo `version`.
- Reglas de versionado y compatibilidad hacia adelante.

Skills: `grilling` + `domain-modeling`.

## Answer

Cerrado el 23-08-2026 por grilling con el usuario. Modelo central: el archivo no guarda «entradas» planas sino **juegos** con sus **jugadas** anidadas — los datos compartidos de una obra se almacenan una sola vez aunque se rejuge, y las rejugadas se ven todas juntas en la ficha del juego.

### Estructura raíz

```jsonc
{
  "schema": "game-tracker",
  "version": 1,
  "updatedAt": "2026-08-23T10:00:00Z",
  "games": [ ... ]
}
```

- `schema`: identificador del formato; permite rechazar un JSON equivocado antes de parsear nada.
- `version`: entero desde 1. Migraciones **forward-only** al abrir archivos antiguos; si el archivo trae una `version` mayor a la entendida → **rechazo explícito** («actualiza la app»), nunca lectura a ciegas ni sobrescritura. Cambios puramente aditivos y tolerados no bumpan versión.
- `updatedAt`: escrito en cada guardado; los mtimes sobreviven mal a las apps de sincronización (research 02) y el diálogo de conflicto necesita una fecha legible del archivo externo.
- Convenciones generales: fechas ISO `YYYY-MM-DD`; campo ausente = desconocido; arrays vacíos permitidos pero omitibles.

### Juego — datos compartidos, guardados una vez

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID propio | sí | clave primaria, generado por la app |
| `igdbId` | número | no | referencia IGDB; el alta manual no lo tiene |
| `title` | string | sí | |
| `coverUrl` | URL completa (`t_cover_big`) | no | agnóstica de fuente, lista para cachear |
| `description` | string | no | texto plano; alimenta la ficha offline |
| `screenshots` | array de URLs (máx. 5) | no | cacheadas con CORS como las carátulas |
| `genres` | `[{id, name}]` de IGDB | no | nombre congelado para garantizar offline |
| `platforms` | `[{id, name}]` de IGDB | no | dónde **se puede jugar** (catálogo de la fuente) |
| `tags` | array de strings | no | etiquetas propias **inline** + autocompletado en UI; describen al juego |
| `plays` | array de jugadas | sí | mínimo una; el alta crea la primera automáticamente |

Identidad desacoplada de la fuente (UUID propios): el plan B RAWG no rompería nada.

### Jugada — lo vivido, se repite por cada rejugada

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID propio | sí | referenciable desde dashboard y ficha |
| `status` | `backlog \| playing \| finished \| abandoned` | sí | tokens ingleses: identificadores de datos; la UI mapea a etiquetas españolas |
| `rating` | entero 1–5 | no | ausente = sin valorar; permitida en cualquier estado |
| `platform` | `{id, name}` única | no | dónde se jugó **esta** jugada; `id: null` cuando es valor propio ajeno a la fuente (p. ej. emulador) |
| `addedAt` | fecha | sí | automática al crear la jugada |
| `startedAt` | fecha | no | sugerida al pasar a Jugando, editable/borrable |
| `finishedAt` | fecha | no | sugerida al pasar a Terminado, editable |

### Decisiones transversales

- **Duplicados permitidos** (mismo `igdbId` dos veces); la UI avisa al añadir y ofrece abrir la ficha existente o crear otra igual.
- **Alta manual viable**: solo `title` y su primera jugada son obligatorios.
- Glosario actualizado (`CONTEXT.md`): **Juego** y **Jugada** sustituyen a «Entrada»; **Plataforma** pasa a tener dos facetas (del juego y de la jugada).
- Nota dejada en el ticket 08: la estantería lista juegos; las rejugadas viven en la ficha.
