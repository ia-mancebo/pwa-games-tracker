/**
 * Formateo de errores y detección de cancelación compartidos.
 *
 * Antes vivían copiados en la Ficha, el Enlace de archivo, el diálogo Datos y
 * la bienvenida; aquí hay una única versión para toda la app.
 */

/**
 * Mensaje legible de un error: el `.message` si es un Error; cualquier otra
 * cosa se vuelve texto tal cual.
 * @param {unknown} err
 * @returns {string}
 */
export function formatError(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * ¿Es una cancelación deliberada del usuario (AbortError, p. ej. cerrar un
 * picker de archivos)? Estas cancelaciones son silenciosas en toda la app.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAbortError(err) {
  return err instanceof Error && err.name === 'AbortError';
}