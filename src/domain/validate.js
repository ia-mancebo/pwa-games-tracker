/**
 * Validación de documentos de entrada (importar, conectar, export).
 * Política forward-only (spec §4.4): comprueba schema, version y tipos ANTES
 * de tocar nada. Nunca muta el input: `ok.doc` es una copia normalizada.
 */
import { SCHEMA_ID, DOC_VERSION, validateGameShape, isDateTime } from './schema.js';

/**
 * @typedef {'BAD_JSON'|'BAD_SCHEMA'|'FUTURE_VERSION'|'BAD_TYPE'|'BAD_SHAPE'} ValidationCode
 */

/**
 * Resultado de validación: doc válido o motivo con código.
 * @typedef {object} ValidationOk
 * @property {true} ok
 * @property {import('./schema.js').Doc} doc
 * @typedef {object} ValidationFail
 * @property {false} ok
 * @property {string} reason
 * @property {ValidationCode} code
 * @typedef {ValidationOk | ValidationFail} ValidationResult
 */

/**
 * Valida un candidato a documento (ya parseado o no). Nunca lanza.
 * @param {unknown} candidate
 * @returns {ValidationResult}
 */
export function validateDoc(candidate) {
  let root = candidate;
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return { ok: false, code: 'BAD_JSON', reason: 'El archivo no contiene JSON válido.' };
    }
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { ok: false, code: 'BAD_SCHEMA', reason: 'El archivo no tiene la estructura esperada.' };
  }
  const obj = /** @type {Record<string, unknown>} */ (root);
  const known = ['schema', 'version', 'updatedAt', 'games'];
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      return { ok: false, code: 'BAD_SHAPE', reason: `Campo desconocido en la raíz: «${key}»` };
    }
  }
  if (obj.schema !== SCHEMA_ID) {
    return {
      ok: false,
      code: 'BAD_SCHEMA',
      reason: 'Este archivo no es un game-tracker.json válido.',
    };
  }
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) {
    return { ok: false, code: 'BAD_TYPE', reason: 'Versión del documento inválida.' };
  }
  if (obj.version > DOC_VERSION) {
    return {
      ok: false,
      code: 'FUTURE_VERSION',
      reason: `Este archivo usa una versión más nueva (v${obj.version}). Actualiza la app.`,
    };
  }
  if (!isDateTime(obj.updatedAt)) {
    return { ok: false, code: 'BAD_TYPE', reason: 'Fecha de actualización inválida.' };
  }
  if (!Array.isArray(obj.games)) {
    return { ok: false, code: 'BAD_TYPE', reason: 'La lista de juegos es inválida.' };
  }
  for (const game of obj.games) {
    const res = validateGameShape(game);
    if (!res.ok) {
      return { ok: false, code: 'BAD_SHAPE', reason: res.reason ?? 'Juego inválido.' };
    }
  }
  return { ok: true, doc: /** @type {import('./schema.js').Doc} */ (structuredClone(obj)) };
}

/**
 * Valida y lanza LibraryError-compatible Error si es inválido.
 * @param {unknown} candidate
 * @returns {import('./schema.js').Doc}
 */
export function parseDoc(candidate) {
  const res = validateDoc(candidate);
  if (!res.ok) {
    const err = /** @type {Error & { code?: ValidationCode }} */ (new Error(res.reason));
    err.code = res.code;
    throw err;
  }
  return res.doc;
}
