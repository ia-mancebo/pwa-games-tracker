/**
 * Repositorio de la biblioteca: la ÚNICA vía de lectura/escritura del
 * documento (spec §5.1). IndexedDB es espejo de trabajo; el archivo .json es
 * la verdad a largo plazo. Toda mutación reemplaza `state.doc` atómicamente,
 * marca `dirty` y valida el resultado antes de persistir.
 */
import { createDoc, createGame, createPlay } from '../domain/schema.js';
import { validateDoc } from '../domain/validate.js';
import { latestPlay } from '../domain/selectors.js';
import { getState, getMeta, putState, putMeta, putStateAndMeta } from './db.js';
import { store } from '../app.js';

/** Error de biblioteca con código para la UI. */
export class LibraryError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code = 'LIBRARY') {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
  }
}

/**
 * Carga el espejo (doc + meta) desde IndexedDB al store.
 * @returns {Promise<void>}
 */
export async function initLibrary() {
  const [doc, meta] = await Promise.all([getState(), getMeta()]);
  store.set({
    doc,
    meta:
      meta ?? {
        dirty: doc != null,
        updatedAt: doc?.updatedAt ?? null,
        lastSavedFileHash: null,
        connectedFileName: null,
      },
    ready: true,
  });
}

/**
 * Empieza una biblioteca nueva y vacía: nace `dirty` (ticket 13).
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export async function newLibrary(now) {
  const doc = createDoc({ now });
  const meta = {
    dirty: true,
    updatedAt: doc.updatedAt,
    lastSavedFileHash: null,
    connectedFileName: null,
  };
  await putStateAndMeta(doc, meta);
  store.set({ doc, meta });
  return doc;
}

/**
 * Importa un documento: valida → sustituye el espejo en transacción única
 * strict → fija hash base. Elección deliberada: SIN lógica de conflicto.
 * Un candidato inválido no toca nada.
 * @param {unknown} candidate JSON texto u objeto
 * @param {{ hash?: string|null, fileName?: string|null }} [where]
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export async function importDoc(candidate, where = {}) {
  const res = validateDoc(candidate);
  if (!res.ok) throw new LibraryError(res.reason, res.code);
  const doc = res.doc;
  const meta = {
    dirty: false,
    updatedAt: doc.updatedAt,
    lastSavedFileHash: where.hash ?? null,
    connectedFileName: where.fileName ?? null,
  };
  await putStateAndMeta(doc, meta);
  store.set({ doc, meta });
  return doc;
}

/**
 * Cola de escritura: las mutaciones se encadenan para que cada draft clone el
 * doc YA persistido por la anterior; sin esto, dos ediciones rápidas clonarían
 * el mismo estado y la última pisaría a la primera.
 * @type {Promise<unknown>}
 */
let writeQueue = Promise.resolve();

/**
 * Primitiva de mutación atómica y serializada: clona el doc, deja que `fn` lo
 * mute, valida el resultado y lo persiste. Si `fn` o la validación fallan, el
 * doc anterior queda intacto.
 * @param {(doc: import('../domain/schema.js').Doc) => void} fn
 * @param {{ now: Date }} when
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function mutate(fn, { now }) {
  const run = async () => {
    const current = store.get().doc;
    if (!current) throw new LibraryError('No hay biblioteca cargada', 'NO_DOC');
    const draft = /** @type {import('../domain/schema.js').Doc} */ (structuredClone(current));
    fn(draft);
    draft.updatedAt = now.toISOString();
    const res = validateDoc(draft);
    if (!res.ok) throw new LibraryError(res.reason, res.code);
    const doc = res.doc;
    const meta = { ...store.get().meta, dirty: true, updatedAt: doc.updatedAt };
    await putState(doc);
    await putMeta(meta);
    store.set({ doc, meta });
    return doc;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => {});
  return result;
}

/**
 * Alta manual: solo título obligatorio; primera jugada con estado elegible.
 * @param {{ title: string, status?: import('../domain/schema.js').Status, today: string, igdbId?: number, coverUrl?: string, description?: string, screenshots?: string[], genres?: {id:number,name:string}[], platforms?: {id:number,name:string}[], tags?: string[] }} input
 */
export function addGame(input) {
  return mutate((doc) => {
    doc.games.push(createGame(input));
  }, { now: new Date(`${input.today}T12:00:00Z`) });
}

/**
 * Aplica un parche: los valores definidos se asignan; los `undefined` BORRAN
 * el campo (campo ausente = desconocido, spec §4).
 * @template {object} T
 * @param {T} target
 * @param {Partial<T>} patch
 */
function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete target[/** @type {string & keyof T} */ (key)];
    else target[/** @type {string & keyof T} */ (key)] = value;
  }
}

/**
 * @param {string} gameId
 * @param {Partial<import('../domain/schema.js').Game>} patch
 */
export function updateGame(gameId, patch) {
  return mutate((doc) => {
    const game = findGame(doc, gameId);
    applyPatch(game, patch);
  }, { now: new Date() });
}

/**
 * Borrado en cascada: el juego y todas sus jugadas (spec §8.5).
 * @param {string} gameId
 */
export function deleteGame(gameId) {
  return mutate((doc) => {
    const idx = doc.games.findIndex((g) => g.id === gameId);
    if (idx === -1) throw new LibraryError('Juego no encontrado', 'NOT_FOUND');
    doc.games.splice(idx, 1);
  }, { now: new Date() });
}

/**
 * Añade una jugada (rejugada). Nace Jugando por defecto, plataforma heredable.
 * @param {string} gameId
 * @param {{ status?: import('../domain/schema.js').Status, today: string, platform?: import('../domain/schema.js').Platform, notes?: string }} input
 */
export function addPlay(gameId, input) {
  return mutate((doc) => {
    const game = findGame(doc, gameId);
    game.plays.push(
      createPlay({ status: input.status ?? 'playing', today: input.today, platform: input.platform, notes: input.notes }),
    );
  }, { now: new Date(`${input.today}T12:00:00Z`) });
}

/**
 * Edición en línea de una jugada (fechas, plataforma efectiva, notas, estado…).
 * @param {string} gameId
 * @param {string} playId
 * @param {Partial<import('../domain/schema.js').Play>} patch
 */
export function updatePlay(gameId, playId, patch) {
  return mutate((doc) => {
    const play = findPlay(doc, gameId, playId);
    applyPatch(play, patch);
  }, { now: new Date() });
}

/**
 * Borra una jugada respetando el mínimo de una por juego (spec §8.5).
 * @param {string} gameId
 * @param {string} playId
 */
export function deletePlay(gameId, playId) {
  return mutate((doc) => {
    const game = findGame(doc, gameId);
    if (game.plays.length <= 1) {
      throw new LibraryError('Un juego necesita al menos una jugada', 'LAST_PLAY');
    }
    const idx = game.plays.findIndex((p) => p.id === playId);
    if (idx === -1) throw new LibraryError('Jugada no encontrada', 'NOT_FOUND');
    game.plays.splice(idx, 1);
  }, { now: new Date() });
}

/**
 * Cambia el Estado del juego: opera sobre la jugada más reciente; nunca crea
 * ni borra jugadas (spec §8.5).
 * @param {string} gameId
 * @param {import('../domain/schema.js').Status} status
 * @param {string} today
 */
export function setGameStatus(gameId, status, today) {
  return mutate((doc) => {
    const game = findGame(doc, gameId);
    latestPlay(game).status = status;
    void today;
  }, { now: new Date() });
}

/**
 * Valora (o quita la valoración de) una jugada.
 * @param {string} gameId
 * @param {string} playId
 * @param {number|null} rating 1–5 o null para quitar
 */
export function ratePlay(gameId, playId, rating) {
  return mutate((doc) => {
    const play = findPlay(doc, gameId, playId);
    if (rating === null) delete play.rating;
    else play.rating = rating;
  }, { now: new Date() });
}

/**
 * Vuelco verificado: limpia `dirty` y fija el hash del archivo (ticket 18).
 * @param {{ hash: string|null, now: Date }} input
 */
export async function markSaved({ hash, now }) {
  const meta = {
    ...store.get().meta,
    dirty: false,
    lastSavedFileHash: hash,
    updatedAt: now.toISOString(),
  };
  await putMeta(meta, { strict: true });
  store.set({ meta });
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @param {string} gameId
 * @returns {import('../domain/schema.js').Game}
 */
function findGame(doc, gameId) {
  const game = doc.games.find((g) => g.id === gameId);
  if (!game) throw new LibraryError('Juego no encontrado', 'NOT_FOUND');
  return game;
}

/**
 * @param {import('../domain/schema.js').Doc} doc
 * @param {string} gameId
 * @param {string} playId
 * @returns {import('../domain/schema.js').Play}
 */
function findPlay(doc, gameId, playId) {
  const play = findGame(doc, gameId).plays.find((p) => p.id === playId);
  if (!play) throw new LibraryError('Jugada no encontrada', 'NOT_FOUND');
  return play;
}
