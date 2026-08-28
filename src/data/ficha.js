/**
 * Motor de la Ficha: interface de comandos con identidad explícita para las
 * mutaciones de la Ficha (spec §8.5). Cada comando recibe `gameId`/`playId`
 * por parámetros y compone la interface del repositorio de la Biblioteca
 * (src/data/library.js), que no cambia: la semántica «undefined borra», la
 * regla de plataforma propia, los parsers de listas/URLs y la herencia de
 * plataforma son conocimiento interno del motor, no de la vista.
 */
import { store } from '../app.js';
import { splitCommaList } from '../lib/list.js';
import { latestPlay } from '../domain/selectors.js';
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
 * Guarda el título recortado. El título obligatorio se valida en la vista
 * (aviso inline «El título es obligatorio»), que no llama aquí con vacío.
 * @param {string} gameId
 * @param {string} title
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setTitle(gameId, title) {
  return updateGame(gameId, { title: title.trim() });
}

/**
 * Guarda un campo compartido editado como texto (spec §8.5). La lista vacía
 * deja el campo ausente; géneros y plataformas conservan el id de las
 * entradas cuyo nombre ya existía.
 * @param {string} gameId
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @param {string} value
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setSharedField(gameId, name, value) {
  switch (name) {
    case 'description':
      return updateGame(gameId, { description: value.trim() || undefined });
    case 'coverUrl':
      return updateGame(gameId, { coverUrl: value.trim() || undefined });
    case 'genres': {
      const current = findGame(store.get().doc, gameId)?.genres ?? [];
      return updateGame(gameId, { genres: undefinedIfEmpty(namedListFromText(current, value)) });
    }
    case 'platforms': {
      const current = findGame(store.get().doc, gameId)?.platforms ?? [];
      return updateGame(gameId, { platforms: undefinedIfEmpty(namedListFromText(current, value)) });
    }
    case 'screenshots':
      return updateGame(gameId, { screenshots: undefinedIfEmpty(urlsFromText(value)) });
    default:
      throw new LibraryError(`Campo compartido desconocido: «${name}»`, 'BAD_FIELD');
  }
}

/**
 * Añade una etiqueta propia al final de la lista, sin deduplicar (igual que
 * el editor previo: la deduplicación no es una regla de la Ficha).
 * @param {string} gameId
 * @param {string} name
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function addTag(gameId, name) {
  const game = findGame(store.get().doc, gameId);
  if (!game) throw new LibraryError('Juego no encontrado', 'NOT_FOUND');
  const tags = game.tags ?? [];
  return updateGame(gameId, { tags: [...tags, name] });
}

/**
 * Quita una etiqueta propia; la lista resultante se escribe tal cual (la lista
 * vacía se persiste como `[]`, igual que el editor previo).
 * @param {string} gameId
 * @param {string} name
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function removeTag(gameId, name) {
  const game = findGame(store.get().doc, gameId);
  if (!game) throw new LibraryError('Juego no encontrado', 'NOT_FOUND');
  const tags = game.tags ?? [];
  return updateGame(gameId, { tags: tags.filter((t) => t !== name) });
}

/**
 * Cambia el Estado del juego: opera sobre la jugada más reciente y nunca crea
 * ni borra jugadas (spec §8.5). Al pasar a Jugando sugiere `startedAt` y a
 * Terminado `finishedAt`, solo si están vacíos.
 * @param {string} gameId
 * @param {import('../domain/schema.js').Status} status
 * @param {string} today
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setStatus(gameId, status, today) {
  return setGameStatus(gameId, status, today);
}

/**
 * Valora (o quita la valoración de) una jugada: el héroe valora la más
 * reciente y cada tarjeta la suya — la vista pasa los ids.
 * @param {string} gameId
 * @param {string} playId
 * @param {number|null} rating 1–5 o null para quitar
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function ratePlay(gameId, playId, rating) {
  return repoRatePlay(gameId, playId, rating);
}

/**
 * Añade una jugada (rejugada): nace Jugando con la plataforma de la jugada
 * más reciente si la tenía (regla de herencia del motor, spec §8.5).
 * @param {string} gameId
 * @param {string} today
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function addPlay(gameId, today) {
  const game = findGame(store.get().doc, gameId);
  const inherited = game ? latestPlay(game).platform : null;
  return repoAddPlay(gameId, {
    status: 'playing',
    today,
    ...(inherited ? { platform: inherited } : {}),
  });
}

/**
 * Fecha de jugada (inicio o fin): cadena vacía borra el campo.
 * @param {string} gameId
 * @param {string} playId
 * @param {'startedAt'|'finishedAt'} kind
 * @param {string} value
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setPlayDate(gameId, playId, kind, value) {
  if (kind === 'startedAt') {
    return updatePlay(gameId, playId, { startedAt: value || undefined });
  }
  if (kind === 'finishedAt') {
    return updatePlay(gameId, playId, { finishedAt: value || undefined });
  }
  throw new LibraryError(`Campo de fecha desconocido: «${kind}»`, 'BAD_FIELD');
}

/**
 * Plataforma efectiva de una jugada: una {id,name} del catálogo del juego,
 * una propia ({id:null,name}) o null/undefined para borrarla.
 * @param {string} gameId
 * @param {string} playId
 * @param {import('../domain/schema.js').Platform|null|undefined} platform
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setPlayPlatform(gameId, playId, platform) {
  return updatePlay(gameId, playId, { platform: platform ?? undefined });
}

/**
 * Notas de una jugada: cadena vacía borra el campo.
 * @param {string} gameId
 * @param {string} playId
 * @param {string} value
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setPlayNotes(gameId, playId, value) {
  return updatePlay(gameId, playId, { notes: value === '' ? undefined : value });
}

/**
 * Borra una jugada; el mínimo de una por juego lo bloquea el repositorio
 * (error de biblioteca LAST_PLAY, que llega a la vista).
 * @param {string} gameId
 * @param {string} playId
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function deletePlay(gameId, playId) {
  return repoDeletePlay(gameId, playId);
}

/**
 * Borra un juego y todas sus jugadas; la vista encadena la reposición a la
 * estantería tras el éxito (src/navigation.js).
 * @param {string} gameId
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function deleteGame(gameId) {
  return repoDeleteGame(gameId);
}
