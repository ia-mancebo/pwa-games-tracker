/**
 * Lógica pura del proxy IGDB: construcción de queries Apicalypse y mapeo
 * al contrato Game (worker/CONTRACT.md). Sin APIs de Workers ni fetch,
 * para que todo sea testeable con vitest.
 */

/**
 * Par etiquetado de IGDB (género o plataforma).
 *
 * @typedef {object} Genre
 * @property {number} id
 * @property {string} name
 */

/**
 * Contrato Game servido por el Worker y consumido por la app (tickets 21 y 23).
 *
 * @typedef {object} Game
 * @property {number} igdbId   Identificador numérico de IGDB.
 * @property {string} title    Nombre del juego.
 * @property {string|null} releaseDate  Fecha YYYY-MM-DD o null si es desconocida.
 * @property {string|null} coverUrl     URL t_cover_big lista para cachear, o null.
 * @property {string} description       Summary truncado a ~600 caracteres.
 * @property {Genre[]} genres
 * @property {Genre[]} platforms
 * @property {string[]} screenshots     Máximo 5 URLs (galería solo online).
 */

/**
 * Fila parcial de IGDB con forma de juego (endpoint `games`) o anidada en
 * release_dates (`{date, game}`). Todos los campos opcionales: IGDB omite
 * los nulos y las filas pueden venir incompletas.
 *
 * @typedef {object} IgdbGameLike
 * @property {number} [id]
 * @property {string} [name]
 * @property {number} [first_release_date]  Segundos epoch UTC.
 * @property {{ image_id?: string } | null} [cover]
 * @property {string | null} [summary]
 * @property {Genre[] | null} [genres]
 * @property {Genre[] | null} [platforms]
 * @property {{ image_id?: string }[] | null} [screenshots]
 * @property {number} [date]                Solo filas de release_dates.
 * @property {IgdbGameLike | null} [game]   Solo filas de release_dates.
 */

const COVER_BASE_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
const SCREENSHOT_BASE_URL = 'https://images.igdb.com/igdb/image/upload/t_screenshot_big';
const DESCRIPTION_LIMIT = 600;
const SCREENSHOTS_LIMIT = 5;

const GAME_FIELDS =
  'name,first_release_date,genres.name,platforms.name,cover.image_id,summary,screenshots.image_id';
const RELEASE_DATE_FIELDS =
  'game.name,game.first_release_date,game.genres.name,game.platforms.name,game.cover.image_id,game.summary,game.screenshots.image_id,date';

const SEARCH_LIMIT = 12;
// release_dates devuelve una fila por plataforma; 40 filas crudas bastan para
// reunir 12 juegos distintos tras deduplicar.
const RELEASE_DATES_LIMIT = 40;
// Populares/esperados piden 12 primitivas y el Worker recorta a 6 por si
// algún game_id no resuelve o viene duplicado.
const PRIMITIVES_LIMIT = 12;

/** Convierte `YYYY-MM-DD` en segundos epoch (UTC medianoche) para las queries de release_dates.
 *
 * @param {string} isoDate
 * @returns {number}
 */
export function isoToEpochSeconds(isoDate) {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000);
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function apicalypse(lines) {
  return lines.join('\n');
}

/** Query de búsqueda (endpoint `games`): título libre, sin versiones parentales (mods, bundles…).
 *
 * @param {string} q
 * @returns {string}
 */
export function searchQuery(q) {
  const escaped = String(q).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return apicalypse([
    `search "${escaped}";`,
    `fields ${GAME_FIELDS};`,
    'where version_parent = null;',
    `limit ${SEARCH_LIMIT};`,
  ]);
}

/** Lanzamientos ya ocurridos (fecha <= hoy), más recientes primero. Endpoint `release_dates`.
 *
 * @param {string} todayIso
 * @returns {string}
 */
export function recentQuery(todayIso) {
  const epoch = isoToEpochSeconds(todayIso);
  return apicalypse([
    `fields ${RELEASE_DATE_FIELDS};`,
    `where game.version_parent = null & date <= ${epoch};`,
    'sort date desc;',
    `limit ${RELEASE_DATES_LIMIT};`,
  ]);
}

/** Lanzamientos futuros (fecha > hoy), los próximos primero. Endpoint `release_dates`.
 *
 * @param {string} todayIso
 * @returns {string}
 */
export function upcomingQuery(todayIso) {
  const epoch = isoToEpochSeconds(todayIso);
  return apicalypse([
    `fields ${RELEASE_DATE_FIELDS};`,
    `where game.version_parent = null & date > ${epoch};`,
    'sort date asc;',
    `limit ${RELEASE_DATES_LIMIT};`,
  ]);
}

/** Catálogo de tipos de PopScore; el id se resuelve por nombre en runtime. Endpoint `popularity_types`.
 *
 * @returns {string}
 */
export function popularityTypesQuery() {
  return apicalypse(['fields id,name;', 'limit 50;']);
}

/**
 * Resuelve el id de un tipo de PopScore tolerando renombranzas de IGDB:
 * la API ha cambiado nombres («IGDB Visits» pasó a «Visits»), así que se
 * aceptan varios candidatos exactos (sin mayúsculas ni espacios sobrantes)
 * y, en último caso, cualquier nombre que contenga la palabra clave.
 * @param {{ id: number, name: string }[]} types
 * @param {{ names: string[], keyword: string }} want
 * @returns {number | null} id del tipo, o null si ninguno encaja
 */
export function resolvePopularityTypeId(types, want) {
  const normalize = (/** @type {string} */ name) => name.trim().toLowerCase();
  /** @type {Map<string, number>} */
  const byName = new Map(
    types
      .filter((type) => type && typeof type.name === 'string' && type.id != null)
      .map((type) => /** @type {[string, number]} */ ([normalize(type.name), type.id])),
  );
  for (const candidate of want.names) {
    const id = byName.get(normalize(candidate));
    if (id != null) return id;
  }
  const keyword = normalize(want.keyword);
  for (const [name, id] of byName) {
    if (name.includes(keyword)) return id;
  }
  return null;
}

/**
 * @param {number} typeId
 * @param {number} limit
 * @returns {string}
 */
function primitivesQuery(typeId, limit) {
  return apicalypse([
    'fields game_id,value;',
    `where popularity_type = ${Number(typeId)};`,
    'sort value desc;',
    `limit ${limit};`,
  ]);
}

/** Top popularidad («IGDB Visits»). Endpoint `popularity_primitives`; requiere resolver antes el typeId.
 *
 * @param {number} typeId
 * @returns {string}
 */
export function popularQuery(typeId) {
  return primitivesQuery(typeId, PRIMITIVES_LIMIT);
}

/** Más esperados («Most Wishlisted Upcoming»). Mismo endpoint y forma que popularQuery.
 *
 * @param {number} typeId
 * @returns {string}
 */
export function hypedQuery(typeId) {
  return primitivesQuery(typeId, PRIMITIVES_LIMIT);
}

/** Resuelve game_ids de popularity_primitives en una sola llamada a `games`.
 *
 * @param {number[]} ids
 * @returns {string}
 */
export function idsQuery(ids) {
  const unique = [...new Set(ids.map(Number))];
  return apicalypse([
    `fields ${GAME_FIELDS};`,
    `where id = (${unique.join(',')});`,
    `limit ${unique.length};`,
  ]);
}

/**
 * @param {number} seconds
 * @returns {string}
 */
function epochToIsoDate(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
function truncateDescription(text) {
  if (!text || text.length <= DESCRIPTION_LIMIT) return text ?? '';
  const cut = text.slice(0, DESCRIPTION_LIMIT);
  const boundary = cut.lastIndexOf(' ');
  return `${boundary > DESCRIPTION_LIMIT / 2 ? cut.slice(0, boundary) : cut}…`;
}

/**
 * @param {Genre[] | null | undefined} list
 * @returns {Genre[]}
 */
function toNamedList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && item.id != null && item.name != null)
    .map(({ id, name }) => ({ id, name }));
}

/**
 * @param {{ image_id?: string }[] | null | undefined} list
 * @returns {string[]}
 */
function toScreenshotUrls(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((shot) => shot && shot.image_id != null)
    .slice(0, SCREENSHOTS_LIMIT)
    .map((shot) => `${SCREENSHOT_BASE_URL}/${shot.image_id}.jpg`);
}

/**
 * Mapea un payload de IGDB al Game del contrato. Acepta tanto la fila de
 * `games` como la fila anidada de `release_dates`, en cuyo caso la fecha
 * preferida es la del propio lanzamiento (`row.date`).
 *
 * @param {IgdbGameLike | null} row
 * @returns {Game | null}
 */
export function toGame(row) {
  if (!row) return null;
  const source = row.game ?? row;
  if (!source || source.id == null) return null;
  const epochSeconds = Number(row.date ?? source.first_release_date);
  return {
    igdbId: source.id,
    title: source.name ?? '',
    releaseDate:
      Number.isFinite(epochSeconds) && epochSeconds > 0 ? epochToIsoDate(epochSeconds) : null,
    coverUrl: source.cover?.image_id ? `${COVER_BASE_URL}/${source.cover.image_id}.jpg` : null,
    description: truncateDescription(source.summary),
    genres: toNamedList(source.genres),
    platforms: toNamedList(source.platforms),
    screenshots: toScreenshotUrls(source.screenshots),
  };
}

/** Elimina duplicados conservando la primera aparición; clave configurable (por defecto `.id`).
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string | number} [getId]
 * @returns {T[]}
 */
export function dedupeById(items, getId = (item) => /** @type {{id: string|number}} */ (item).id) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getId(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
