/**
 * Descarga de texto como archivo (Blob + a[download]).
 *
 * Vía manual sin FSA: la copia local del conflicto del Enlace de archivo y la
 * exportación del diálogo Datos comparten esta única implementación.
 */

/**
 * Vuelca texto a un archivo descargable con el nombre dado.
 * @param {string} text
 * @param {string} name
 */
export function downloadTextBlob(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en el mismo tick (setTimeout 0) puede cancelar la descarga antes
  // de que el navegador la inicie (Chrome Android PWA). Se difiere: el blob
  // queda vivo de sobra y el navegador lo libera solo al cerrar la página.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}