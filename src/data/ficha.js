/**
 * Motor de la Ficha: interface de comandos con identidad explícita para las
 * mutaciones de la Ficha (spec §8.5). Cada comando recibe `gameId`/`playId`
 * por parámetros y compone la interface del repositorio de la Biblioteca
 * (src/data/library.js), que no cambia: la semántica «undefined borra», la
 * regla de plataforma propia, los parsers de listas/URLs y la herencia de
 * plataforma son conocimiento interno del motor, no de la vista. Toda la
 * interface devuelve `Promise<Result>`: el motor nunca lanza al llamador.
 */
import { store } from '../app.js';
import { splitCommaList } from '../lib/list.js';
import { latestPlay } from '../domain/selectors.js';
import { STATUSES, todayFrom } from '../domain/schema.js';
import {
  addPlay as repoAddPlay,
  deleteGame as repoDeleteGame,
  deletePlay as repoDeletePlay,
  LibraryError,
  ratePlay as repoRatePlay,
  setGameStatus,
  updateGame,
  updatePlay,
} from './library.js';

/**
 * Resultado de un comando del motor: éxito o error de biblioteca.
 * @typedef {{ ok: true } | { ok: false, error: LibraryError }} Result
 */

/**
 * Envuelve una promesa del repositorio en un Result: el motor nunca lanza.
 * @param {Promise<unknown>} promise
 * @returns {Promise<Result>}
 */
function toResult(promise) {
  return promise.then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error })
  );
}

/**
 * Id numérico estable derivado del nombre (géneros/plataformas de alta manual
 * carecen de id IGDB; el esquema solo exige un number).
 * @param {string} name
 * @returns {number}
 */
function idFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return (hash % 2147483646) + 1;
}

/**
 * @param {string} s
 */
function norm(s) {
  return s.trim().toLowerCase();
}

/**
 * Lista {id,name} desde texto separado por comas; conserva el id de las
 * entradas cuyo nombre ya existía y genera uno estable para las nuevas.
 * @param {{id:number,name:string}[]} current
 * @param {string} text
 * @returns {{id:number,name:string}[]}
 */
function namedListFromText(current, text) {
  /** @type {{id:number,name:string}[]} */
  const out = [];
  for (const name of splitCommaList(text)) {
    if (out.some((item) => norm(item.name) === norm(name))) continue;
    const existing = current.find((item) => norm(item.name) === norm(name));
    out.push(existing ? { id: existing.id, name } : { id: idFromName(norm(name)), name });
  }
  return out;
}

/**
 * Lista vacía → campo ausente (spec §4: los arrays vacíos se omiten).
 * @template T
 * @param {T[]} list
 * @returns {T[]|undefined}
 */
function undefinedIfEmpty(list) {
  return list.length === 0 ? undefined : list;
}

/**
 * Parser de URLs de capturas desde texto separado por comas (recorta cada
 * entrada).
 * @param {string} value
 * @returns {string[]}
 */
function urlsFromText(value) {
  return splitCommaList(value);
}

/**
 * @param {import('../domain/schema.js').Doc|null} doc
 * @param {string} gameId
 * @returns {import('../domain/schema.js').Game|undefined}
 */
function findGame(doc, gameId) {
  return doc?.games.find((g) => g.id === gameId);
}

/**
 * Guarda el título recortado. La obligatoriedad se valida aquí: vacío o solo
 * espacios devuelve error sin tocar el repositorio (la regla deja de vivir
 * en la vista).
 * @param {string} gameId
 * @param {string} rawText
 * @returns {Promise<Result>}
 */
export function commitTitle(gameId, rawText) {
  const title = rawText.trim();
  if (!title) {
    return Promise.resolve({
      ok: false,
      error: new LibraryError('El título es obligatorio', 'BAD_SHAPE'),
    });
  }
  return toResult(updateGame(gameId, { title }));
}

/**
 * Guarda un campo compartido editado como texto (spec §8.5). La lista vacía
 * deja el campo ausente; géneros y plataformas conservan el id de las
 * entradas cuyo nombre ya existía.
 * @param {string} gameId
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @param {string} rawText
 * @returns {Promise<Result>}
 */
export function commitSharedField(gameId, name, rawText) {
  switch (name) {
    case 'description':
      return toResult(updateGame(gameId, { description: rawText.trim() || undefined }));
    case 'coverUrl':
      return toResult(updateGame(gameId, { coverUrl: rawText.trim() || undefined }));
    case 'genres': {
      const current = findGame(store.get().doc, gameId)?.genres ?? [];
      return toResult(
        updateGame(gameId, { genres: undefinedIfEmpty(namedListFromText(current, rawText)) })
      );
    }
    case 'platforms': {
      const current = findGame(store.get().doc, gameId)?.platforms ?? [];
      return toResult(
        updateGame(gameId, { platforms: undefinedIfEmpty(namedListFromText(current, rawText)) })
      );
    }
    case 'screenshots':
      return toResult(updateGame(gameId, { screenshots: undefinedIfEmpty(urlsFromText(rawText)) }));
    default:
      return Promise.resolve({
        ok: false,
        error: new LibraryError(`Campo compartido desconocido: «${name}»`, 'BAD_FIELD'),
      });
  }
}

/**
 * Añade una etiqueta propia al final de la lista, sin deduplicar (igual que
 * el editor previo: la deduplicación no es una regla de la Ficha).
 * @param {string} gameId
 * @param {string} name
 * @returns {Promise<Result>}
 */
export function addTag(gameId, name) {
  const game = findGame(store.get().doc, gameId);
  if (!game) {
    return Promise.resolve({
      ok: false,
      error: new LibraryError('Juego no encontrado', 'NOT_FOUND'),
    });
  }
  const tags = game.tags ?? [];
  return toResult(updateGame(gameId, { tags: [...tags, name] }));
}

/**
 * Quita una etiqueta propia; la lista resultante se escribe tal cual (la lista
 * vacía se persiste como `[]`, igual que el editor previo).
 * @param {string} gameId
 * @param {string} name
 * @returns {Promise<Result>}
 */
export function removeTag(gameId, name) {
  const game = findGame(store.get().doc, gameId);
  if (!game) {
    return Promise.resolve({
      ok: false,
      error: new LibraryError('Juego no encontrado', 'NOT_FOUND'),
    });
  }
  const tags = game.tags ?? [];
  return toResult(updateGame(gameId, { tags: tags.filter((t) => t !== name) }));
}

/**
 * Cambia el Estado del juego: opera sobre la jugada más reciente y nunca crea
 * ni borra jugadas (spec §8.5). El Estado se valida aquí, antes de llegar al
 * repositorio; inválido devuelve error sin tocar nada. Al pasar a Jugando
 * sugiere `startedAt` y a Terminado `finishedAt`, solo si están vacíos, con
 * el «hoy» derivado de `now` (por defecto el reloj real).
 * @param {string} gameId
 * @param {import('../domain/schema.js').Status} status
 * @param {Date} [now]
 * @returns {Promise<Result>}
 */
export function setStatus(gameId, status, now = new Date()) {
  if (!STATUSES.includes(status)) {
    return Promise.resolve({
      ok: false,
      error: new LibraryError('Estado de jugada inválido', 'BAD_SHAPE'),
    });
  }
  return toResult(setGameStatus(gameId, status, todayFrom(now)));
}

/**
 * Valora (o quita la valoración de) una jugada concreta: cada tarjeta pasa
 * su id; el héroe usa {@link rateHero}.
 * @param {string} gameId
 * @param {string} playId
 * @param {number|null} rating 1–5 o null para quitar
 * @returns {Promise<Result>}
 */
export function ratePlay(gameId, playId, rating) {
  return toResult(repoRatePlay(gameId, playId, rating));
}

/**
 * Valora (o quita la valoración de) la jugada más reciente del juego: el
 * héroe no pasa id, la regla vive en el motor (mismo criterio que
 * `latestPlay`: máximo `addedAt`, desempate por posición en el array).
 * @param {string} gameId
 * @param {number|null} rating 1–5 o null para quitar
 * @returns {Promise<Result>}
 */
export function rateHero(gameId, rating) {
  const game = findGame(store.get().doc, gameId);
  if (!game) {
    return Promise.resolve({
      ok: false,
      error: new LibraryError('Juego no encontrado', 'NOT_FOUND'),
    });
  }
  return toResult(repoRatePlay(gameId, latestPlay(game).id, rating));
}

/**
 * Añade una jugada (rejugada): nace Jugando con la plataforma de la jugada
 * más reciente si la tenía (regla de herencia del motor, spec §8.5). El
 * «hoy» se deriva de `now` (por defecto el reloj real).
 * @param {string} gameId
 * @param {Date} [now]
 * @returns {Promise<Result>}
 */
export function addPlay(gameId, now = new Date()) {
  const game = findGame(store.get().doc, gameId);
  const inherited = game ? latestPlay(game).platform : null;
  return toResult(
    repoAddPlay(gameId, {
      status: 'playing',
      today: todayFrom(now),
      ...(inherited ? { platform: inherited } : {}),
    })
  );
}

/**
 * Fecha de jugada (inicio o fin): cadena vacía borra el campo.
 * @param {string} gameId
 * @param {string} playId
 * @param {'startedAt'|'finishedAt'} kind
 * @param {string} value
 * @returns {Promise<Result>}
 */
export function setPlayDate(gameId, playId, kind, value) {
  if (kind === 'startedAt') {
    return toResult(updatePlay(gameId, playId, { startedAt: value || undefined }));
  }
  if (kind === 'finishedAt') {
    return toResult(updatePlay(gameId, playId, { finishedAt: value || undefined }));
  }
  return Promise.resolve({
    ok: false,
    error: new LibraryError(`Campo de fecha desconocido: «${kind}»`, 'BAD_FIELD'),
  });
}

/**
 * Plataforma efectiva de una jugada: una {id,name} del catálogo del juego,
 * una propia ({id:null,name}) o null/undefined para borrarla.
 * @param {string} gameId
 * @param {string} playId
 * @param {import('../domain/schema.js').Platform|null|undefined} platform
 * @returns {Promise<Result>}
 */
export function setPlayPlatform(gameId, playId, platform) {
  return toResult(updatePlay(gameId, playId, { platform: platform ?? undefined }));
}

/**
 * Notas de una jugada: cadena vacía borra el campo.
 * @param {string} gameId
 * @param {string} playId
 * @param {string} value
 * @returns {Promise<Result>}
 */
export function setPlayNotes(gameId, playId, value) {
  return toResult(updatePlay(gameId, playId, { notes: value === '' ? undefined : value }));
}

/**
 * Borra una jugada; el mínimo de una por juego lo bloquea el repositorio
 * (error de biblioteca LAST_PLAY, que llega como Result).
 * @param {string} gameId
 * @param {string} playId
 * @returns {Promise<Result>}
 */
export function deletePlay(gameId, playId) {
  return toResult(repoDeletePlay(gameId, playId));
}

/**
 * Borra un juego y todas sus jugadas; la vista encadena la reposición a la
 * estantería tras el éxito (src/navigation.js).
 * @param {string} gameId
 * @returns {Promise<Result>}
 */
export function deleteGame(gameId) {
  return toResult(repoDeleteGame(gameId));
}