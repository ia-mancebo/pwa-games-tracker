const RAW_KEY = '__gt_raw__';

/**
 * Cadena de HTML de confianza, no escapada por `html`.
 * @typedef {{ __gt_raw__: true, value: string }} RawValue
 */

/**
 * Valor simple interpolable en una plantilla `html`.
 * @typedef {string | number | boolean | null | undefined | RawValue} Atom
 */

/**
 * Valor interpolable: un átomo o una lista de átomos.
 * @typedef {Atom | Atom[]} Interpolable
 */

/**
 * Escapa un valor para inserción segura como texto/atributo HTML.
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
 * Marca una cadena como HTML de confianza: `html` la inyecta sin escapar.
 * @param {string} value
 * @returns {RawValue}
 */
export function raw(value) {
  return /** @type {RawValue} */ ({ [RAW_KEY]: true, value });
}

/**
 * @param {Interpolable} value
 * @returns {string}
 */
function stringify(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const candidate = /** @type {Partial<RawValue>} */ (value);
    if (candidate.__gt_raw__ === true) return candidate.value ?? '';
  }
  return esc(value);
}

/**
 * Tagged template que devuelve un STRING con cada valor interpolado auto-escapado.
 * Los arrays se concatenan; null/undefined/boolean se vuelven cadena vacía.
 * Usa {@link raw} para inyectar marcado de confianza; un resultado de `html`
 * anidado cuenta como texto ajeno y debe envolverse con raw() al componer.
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
  return out;
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
