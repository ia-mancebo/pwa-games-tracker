/**
 * Marcado HTML de confianza.
 *
 * En ejecución es una subclase de String: hereda .length/.trim()/.includes()
 * y se coacciona a primitivo en concatenaciones, plantillas y asignaciones a
 * innerHTML. `stringify` lo reconoce e inyecta sin escapar; cualquier átomo
 * simple (string, number) se escapa siempre, venga de donde venga.
 *
 * El tipo declarado de html/raw es `string` a propósito: así ningún call site
 * necesita anotaciones nuevas. La contrapartida (documentada en
 * docs/adr/0001) es que comparaciones de identidad contra primitivos sobre
 * una salida de html son siempre falsas; para un primitivo puro, String(x).
 */
class Markup extends String {}

/**
 * Valor simple interpolable en una plantilla `html`.
 * @typedef {string | number | boolean | null | undefined} Atom
 */

/**
 * Valor interpolable: un átomo o una lista de átomos.
 * @typedef {Atom | Atom[]} Interpolable
 */

/**
 * Escapa un valor para inserción segura como texto/atributo HTML.
 * Recibe incluso marcado de confianza: esc() escapa SIEMPRE.
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Marca texto ajeno como HTML de confianza: `html` lo inyecta sin escapar.
 * Reservado para literales genuinos fuera del sistema de plantillas;
 * los resultados de `html` ya llegan marcados por sí solos.
 * @param {string} value
 * @returns {string}
 */
export function raw(value) {
  return /** @type {string} */ (new Markup(value));
}

/**
 * Los valores marcados atraviesan sin escapar; el resto se escapa.
 * @param {Interpolable} value
 * @returns {string}
 */
function stringify(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (value instanceof Markup) return /** @type {string} */ (value.valueOf());
  return esc(value);
}

/**
 * Tagged template: cada valor interpolado simple se auto-escapa; arrays se
 * concatenan; null/undefined/boolean se vuelven cadena vacía. Los resultados
 * de `html` anidados componen sin escaparse ni envoltura alguna.
 * @param {TemplateStringsArray} strings
 * @param {...Interpolable} values
 * @returns {string}
 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) {
      const value = values[i];
      out += Array.isArray(value) ? value.map(stringify).join('') : stringify(value);
    }
  });
  return /** @type {string} */ (new Markup(out));
}

/**
 * Vuelca una cadena HTML dentro de un elemento.
 * @param {Element} parent
 * @param {string} markup
 * @returns {void}
 */
export function renderEl(parent, markup) {
  parent.innerHTML = markup;
}

/**
 * @param {string} sel
 * @param {Document | Element} [root]
 * @returns {Element | null}
 */
export function qs(sel, root = document) {
  return root.querySelector(sel);
}

/**
 * @param {string} sel
 * @param {Document | Element} [root]
 * @returns {Element[]}
 */
export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}
