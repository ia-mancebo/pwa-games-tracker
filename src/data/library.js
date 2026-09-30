/**
 * Repositorio de la biblioteca: la ÚNICA vía de lectura/escritura del
 * documento (spec §5.1). IndexedDB es espejo de trabajo; el archivo .json es
 * la verdad a largo plazo. Toda mutación reemplaza `state.doc` atómicamente,
 * marca `dirty` y valida el resultado antes de persistir.
 */
import {
  createDoc,
  createGame,
  createPlay,
  newId,
  normalizeWorkerUrl,
  todayFrom,
} from '../domain/schema.js';
import { validateDoc } from '../domain/validate.js';
import { counterElapsedSeconds, latestPlay } from '../domain/selectors.js';
import { getState, getMeta, putMeta, putStateAndMeta } from './db.js';
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

/** Nombre sugerido de exportación por defecto (spec §5.6). */
export const DEFAULT_EXPORT_NAME = 'game-tracker.json';

/**
 * Carga el espejo (doc + meta) desde IndexedDB al store.
 * @returns {Promise<void>}
 */
export async function initLibrary() {
  const [doc, meta] = await Promise.all([getState(), getMeta()]);
  store.set({
    doc,
    meta: meta ?? {
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
    await putStateAndMeta(doc, meta, { strict: false });
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
  return mutate(
    (doc) => {
      doc.games.push(createGame(input));
    },
    { now: new Date(`${input.today}T12:00:00Z`) }
  );
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
  return mutate(
    (doc) => {
      const game = findGame(doc, gameId);
      applyPatch(game, patch);
    },
    { now: new Date() }
  );
}

/**
 * Borrado en cascada: el juego y todas sus jugadas (spec §8.5). Si el
 * Contador estaba anclado al juego se borra el ancla sin Tramo (poda mínima).
 * @param {string} gameId
 */
export function deleteGame(gameId) {
  return mutate(
    (doc) => {
      const idx = doc.games.findIndex((g) => g.id === gameId);
      if (idx === -1) throw new LibraryError('Juego no encontrado', 'NOT_FOUND');
      doc.games.splice(idx, 1);
      if (doc.counter?.gameId === gameId) delete doc.counter;
    },
    { now: new Date() }
  );
}

/**
 * Añade una jugada (rejugada). Nace Jugando por defecto, plataforma heredable.
 * Auto-pausa el Contador del juego (una de las cuatro formas de pausa), en el
 * instante de la operación; `addedAt` y `updatedAt` usan el «hoy» sintético.
 * @param {string} gameId
 * @param {{ status?: import('../domain/schema.js').Status, today: string, now?: Date, platform?: import('../domain/schema.js').Platform, notes?: string }} input
 */
export function addPlay(gameId, input) {
  const today = new Date(`${input.today}T12:00:00Z`);
  const pauseNow = input.now ?? new Date();
  return mutate(
    (doc) => {
      if (doc.counter?.gameId === gameId) pauseAnchor(doc, pauseNow);
      const game = findGame(doc, gameId);
      game.plays.push(
        createPlay({
          status: input.status ?? 'playing',
          today: input.today,
          platform: input.platform,
          notes: input.notes,
        })
      );
    },
    { now: today }
  );
}

/**
 * Edición en línea de una jugada (fechas, plataforma efectiva, notas, estado…).
 * @param {string} gameId
 * @param {string} playId
 * @param {Partial<import('../domain/schema.js').Play>} patch
 */
export function updatePlay(gameId, playId, patch) {
  return mutate(
    (doc) => {
      const play = findPlay(doc, gameId, playId);
      applyPatch(play, patch);
    },
    { now: new Date() }
  );
}

/**
 * Borra una jugada respetando el mínimo de una por juego (spec §8.5). Si el
 * Contador estaba anclado a la jugada se borra el ancla sin Tramo (poda mínima).
 * @param {string} gameId
 * @param {string} playId
 */
export function deletePlay(gameId, playId) {
  return mutate(
    (doc) => {
      const game = findGame(doc, gameId);
      if (game.plays.length <= 1) {
        throw new LibraryError('Un juego necesita al menos una jugada', 'LAST_PLAY');
      }
      const idx = game.plays.findIndex((p) => p.id === playId);
      if (idx === -1) throw new LibraryError('Jugada no encontrada', 'NOT_FOUND');
      game.plays.splice(idx, 1);
      if (doc.counter?.gameId === gameId && doc.counter?.playId === playId) delete doc.counter;
    },
    { now: new Date() }
  );
}

/**
 * Cambia el Estado del juego: opera sobre la jugada más reciente; nunca crea
 * ni borra jugadas (spec §8.5). Al pasar a Jugando sugiere `startedAt` y al
 * pasar a Terminado sugiere `finishedAt` (spec §4.3), solo si están vacíos.
 * Marcar Terminado/Abandonado auto-pausa el Contador del juego; los demás
 * estados lo dejan en marcha.
 * @param {string} gameId
 * @param {import('../domain/schema.js').Status} status
 * @param {string} today
 */
export function setGameStatus(gameId, status, today) {
  const now = new Date();
  return mutate(
    (doc) => {
      if ((status === 'finished' || status === 'abandoned') && doc.counter?.gameId === gameId) {
        pauseAnchor(doc, now);
      }
      const play = latestPlay(findGame(doc, gameId));
      if (status === 'playing') openPlayAsPlaying(play, today);
      else play.status = status;
      if (status === 'finished' && play.finishedAt == null) play.finishedAt = today;
    },
    { now }
  );
}

/**
 * Valora (o quita la valoración de) una jugada.
 * @param {string} gameId
 * @param {string} playId
 * @param {number|null} rating 1–5 o null para quitar
 */
export function ratePlay(gameId, playId, rating) {
  return mutate(
    (doc) => {
      const play = findPlay(doc, gameId, playId);
      if (rating === null) delete play.rating;
      else play.rating = rating;
    },
    { now: new Date() }
  );
}

/**
 * Semántica compartida de «pasar la Jugada a Jugando»: el Estado cambia y
 * `startedAt` se sugiere SOLO si faltaba (spec §4.3). La usa setGameStatus
 * (al marcar Jugando) y startCounter (al reabrir Terminadas/Abandonadas).
 * @param {import('../domain/schema.js').Play} play
 * @param {string} today fecha YYYY-MM-DD del día de la operación
 */
function openPlayAsPlaying(play, today) {
  play.status = 'playing';
  if (play.startedAt == null) play.startedAt = today;
}

/**
 * Pausa el ancla del Contador del draft: el tiempo transcurrido queda como
 * Tramo pendiente de la jugada anclada y el ancla se borra. Poda mínima: si el
 * juego o la jugada ya no existen, solo se borra el ancla.
 * @param {import('../domain/schema.js').Doc} draft
 * @param {Date} now
 */
function pauseAnchor(draft, now) {
  const counter = draft.counter;
  if (!counter) return;
  delete draft.counter;
  const play = draft.games
    .find((g) => g.id === counter.gameId)
    ?.plays.find((p) => p.id === counter.playId);
  if (!play) return;
  const seconds = counterElapsedSeconds(counter, now);
  play.pendingSegments = [...(play.pendingSegments ?? []), { id: newId(), seconds }];
}

/**
 * Arranca el Contador de un juego sobre su jugada más reciente: el ancla se
 * escribe al instante (permite contar con la app cerrada) y la jugada pasa a
 * Jugando con {@link openPlayAsPlaying}; así se reabren también
 * Terminadas/Abandonadas. Si ya había otro Contador en marcha, se pausa antes
 * dejando su tiempo a salvo.
 * @param {string} gameId
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function startCounter(gameId, now) {
  return mutate(
    (doc) => {
      if (doc.counter) pauseAnchor(doc, now);
      const play = latestPlay(findGame(doc, gameId));
      doc.counter = { gameId, playId: play.id, startedAt: now.toISOString() };
      if (play.status !== 'playing') openPlayAsPlaying(play, todayFrom(now));
    },
    { now }
  );
}

/**
 * Pausa el Contador en marcha: deja el tramo transcurrido como Tramo pendiente
 * de la jugada anclada y limpia el ancla.
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function pauseCounter(now) {
  return mutate(
    (doc) => {
      if (!doc.counter) throw new LibraryError('No hay contador en marcha', 'NO_COUNTER');
      pauseAnchor(doc, now);
    },
    { now }
  );
}

/**
 * Quita un Tramo pendiente de la jugada del draft y lo devuelve; si la lista
 * queda vacía se borra el campo (spec §4: los arrays vacíos se omiten).
 * @param {import('../domain/schema.js').Play} play
 * @param {string} segmentId
 * @returns {import('../domain/schema.js').Segment}
 */
function dropSegment(play, segmentId) {
  const segments = play.pendingSegments ?? [];
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) throw new LibraryError('Tramo pendiente no encontrado', 'NOT_FOUND');
  const [segment] = segments.splice(idx, 1);
  if (segments.length === 0) delete play.pendingSegments;
  return segment;
}

/**
 * Confirma un Tramo pendiente: consolida su duración —la prefillada o la
 * sustituta `secondsOverride`— en el Tiempo jugado de la Jugada y lo quita de
 * pendientes. Duración 0 equivale a descartar: quita el Tramo sin sumar. Un
 * `secondsOverride` que no sea entero ≥ 0 devuelve error sin tocar nada.
 * @param {string} gameId
 * @param {string} playId
 * @param {string} segmentId
 * @param {number|null|undefined} secondsOverride duración sustituta; null/undefined = prefillada
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function confirmSegment(gameId, playId, segmentId, secondsOverride, now) {
  return mutate(
    (doc) => {
      if (secondsOverride != null && (!Number.isInteger(secondsOverride) || secondsOverride < 0)) {
        throw new LibraryError('La duración debe ser un entero de segundos', 'BAD_SHAPE');
      }
      const play = findPlay(doc, gameId, playId);
      const segment = dropSegment(play, segmentId);
      const duration = secondsOverride != null ? secondsOverride : segment.seconds;
      if (duration > 0) play.playedSeconds = (play.playedSeconds ?? 0) + duration;
    },
    { now }
  );
}

/**
 * Descarta un Tramo pendiente: lo elimina sin rastro —ni en pendientes ni en
 * el consolidado—, sin tocar el Tiempo jugado.
 * @param {string} gameId
 * @param {string} playId
 * @param {string} segmentId
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function discardSegment(gameId, playId, segmentId, now) {
  return mutate(
    (doc) => {
      dropSegment(findPlay(doc, gameId, playId), segmentId);
    },
    { now }
  );
}

/**
 * Corrección manual del Tiempo jugado (ADR-0012): un set absoluto del campo
 * `playedSeconds` —no una resta—, entero ≥ 0. Si el Contador está anclado a
 * esa jugada se auto-pausa antes (igual que addPlay); los Tramos pendientes
 * quedan intactos y la consolidación posterior suma sobre la base corregida.
 * El 0 deja el campo ausente (spec §4: los campos vacíos se omiten).
 * @param {string} gameId
 * @param {string} playId
 * @param {number} seconds
 * @param {Date} now
 * @returns {Promise<import('../domain/schema.js').Doc>}
 */
export function setPlayTime(gameId, playId, seconds, now) {
  return mutate(
    (doc) => {
      if (!Number.isInteger(seconds) || seconds < 0) {
        throw new LibraryError('El tiempo jugado debe ser un entero de segundos', 'BAD_SHAPE');
      }
      const play = findPlay(doc, gameId, playId);
      // Auto-pausa igual que addPlay, pero solo si el ancla es de ESTA jugada.
      if (doc.counter?.gameId === gameId && doc.counter?.playId === playId) pauseAnchor(doc, now);
      if (seconds > 0) play.playedSeconds = seconds;
      else delete play.playedSeconds;
    },
    { now }
  );
}

/**
 * Reabrir con la app cerrada (ticket 05, ADR-0011): si el Doc trae el ancla de
 * un Contador en marcha, el tiempo transcurrido mientras la app estaba cerrada
 * se deja como Tramo pendiente prefillado en la jugada anclada y el ancla se
 * deshace. Es tiempo de pared (ahora − instante de inicio), SIN tope ni
 * corrección: el usuario revisa el Tramo y decide. Sin doc o sin ancla no toca
 * nada; la poda mínima de `pauseAnchor` cubre anclas huérfanas.
 * @param {Date} [now] instante de reapertura (tiempo de pared)
 * @returns {Promise<import('../domain/schema.js').Doc | null>}
 */
export async function resumeCounter(now = new Date()) {
  const doc = store.get().doc;
  if (!doc?.counter) return doc ?? null;
  return pauseCounter(now);
}

/**
 * Vuelco verificado: limpia `dirty` y fija el hash del archivo (ticket 18).
 * Si el documento cambió DURANTE el vuelco (mutación intercalada en el hueco
 * asíncrono), NO limpia `dirty`: el vuelco escribió una versión anterior y el
 * pendiente se retoma con el siguiente autoguardado. Sin esto, el indicador
 * «cambios sin volcar» desaparecería con el archivo desactualizado. Toda
 * mutación reemplaza el doc por una referencia nueva (mutate clona), así que
 * la comparación por identidad detecta cualquier cambio intercalado.
 * @param {{ hash: string|null, now: Date, doc: import('../domain/schema.js').Doc }} input
 */
export async function markSaved({ hash, now, doc }) {
  const current = store.get();
  const meta = {
    ...current.meta,
    dirty: current.meta.dirty && current.doc !== doc,
    lastSavedFileHash: hash,
    updatedAt: now.toISOString(),
  };
  await putMeta(meta, { strict: true });
  store.set({ meta });
}

/**
 * Preferencia local del dispositivo: nombre sugerido al exportar (ticket 19).
 * Vive en meta y NO viaja dentro del .json. Vacío ⇒ valor por defecto.
 * @param {string} name
 * @returns {Promise<string>} nombre normalizado guardado
 */
export async function saveExportName(name) {
  const trimmed = name.trim();
  const meta = {
    ...store.get().meta,
    exportFileName: trimmed.length > 0 ? trimmed : DEFAULT_EXPORT_NAME,
  };
  await putMeta(meta);
  store.set({ meta });
  return meta.exportFileName;
}

/**
 * Guarda la Conexión del doc (CONTEXT.md): la URL del proxy IGDB viaja DENTRO
 * del .json y llega a cualquier dispositivo que cargue ese archivo. Vacío ⇒
 * sin conexión. Nunca contiene credenciales (esas viven solo en el Worker).
 * @param {string} url
 * @returns {Promise<string>} URL normalizada guardada ('' si se quitó)
 */
export function saveWorkerUrl(url) {
  const cleaned = normalizeWorkerUrl(url);
  return mutate(
    (doc) => {
      if (cleaned === '') {
        if (doc.connection) {
          delete doc.connection.workerUrl;
          if (Object.keys(doc.connection).length === 0) delete doc.connection;
        }
        return;
      }
      doc.connection = { ...doc.connection, workerUrl: cleaned };
    },
    { now: new Date() }
  ).then(() => cleaned);
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
