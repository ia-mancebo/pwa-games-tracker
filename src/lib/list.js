/**
 * Listas separadas por comas.
 *
 * Primitiva compartida por la entrada de etiquetas del Alta y por los campos
 * de la Ficha (géneros, plataformas, capturas); el armado de listas de nivel
 * superior (ids, dedupe) vive en cada consumidor.
 */

/**
 * Parte un texto separado por comas: recorta cada elemento y descarta los
 * vacíos.
 * @param {string} text
 * @returns {string[]}
 */
export function splitCommaList(text) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}