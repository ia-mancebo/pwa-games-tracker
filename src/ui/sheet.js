/**
 * Hoja profunda (ticket 2, spec Q12): una única capa .add-layer con fondo,
 * hoja y cuerpo repintable ([data-sheet-body]). El módulo es DUEÑO de todos
 * los caminos de cierre iniciados por el usuario — ✕ de cabecera, clic en el
 * fondo, Escape y botón atrás del sistema vía closeTopSheet (backnav) — y de
 * la trampa de Tab/foco; los adaptadores solo describen el contenido y un
 * onClose. Abrir una hoja reemplaza la anterior SIN llamar a su onClose; el
 * close() devuelto está ligado a su sesión (una sesión reemplazada es no-op).
 *
 * Botón atrás del sistema a profundidad 0 (Ficha del tablón, Alta, diálogos):
 * sin entrada de historial propia no hay popstate y el atrás no cerraría la
 * hoja. Al abrir, el módulo pide a backnav una entrada centinela
 * (ensureSheetSentinel); al cerrar por cualquier vía que no sea el atrás
 * (✕, fondo, Escape, cierre programático) la consume (consumeSheetSentinel:
 * consumo diferido, la próxima operación de historial la retira). El cierre
 * por atrás del sistema NO consume: el popstate de la centinela ya la consumió.
 */
import { html, qs, qsa } from '../lib/dom.js';
import { registerSheetCloser, ensureSheetSentinel, consumeSheetSentinel } from '../backnav.js';

/** Selector del cuerpo repintable de la hoja; lo usan los adaptadores. */
export const SHEET_BODY_SELECTOR = '[data-sheet-body]';

/** Selector de elementos enfocables dentro de la hoja. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Sesión de la hoja abierta actualmente.
 * @typedef {{
 *   layer: HTMLElement,
 *   sheet: HTMLElement,
 *   onClose: (() => void)|null,
 *   focusTarget: Element|null,
 * }} SheetSession
 */

/** @type {SheetSession|null} */
let current = null;

/** Listener global de teclado (Escape + trampa de Tab) mientras hay hoja.
 * @type {((e: KeyboardEvent) => void)|null} */
let keyHandler = null;

/**
 * ¿El cierre en curso viene del botón atrás del sistema (closeTopSheet)? El
 * popstate de la centinela ya la consumió: el cierre no debe retroceder de
 * nuevo (doble pulsación de atrás).
 * @type {boolean}
 */
let closingViaBack = false;

/** @param {HTMLElement} sheet @returns {HTMLElement[]} */
function focusables(sheet) {
  return qsa(FOCUSABLE_SELECTOR, sheet).filter((el) => el instanceof HTMLElement);
}

/**
 * Retira la capa de la sesión, limpia el estado y restaura el foco recordado.
 * Solo actúa si la sesión sigue siendo la hoja abierta (idempotente y a
 * prueba de sesiones ya reemplazadas).
 * @param {SheetSession} session
 */
function tearDown(session) {
  if (current !== session) return;
  current = null;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  session.layer.remove();
  if (
    session.focusTarget &&
    document.contains(session.focusTarget) &&
    session.focusTarget instanceof HTMLElement
  ) {
    session.focusTarget.focus();
  }
}

/**
 * Cierre de una sesión por vía de usuario o programática: retira la capa y
 * consume la centinela si la hoja se abrió a profundidad 0. El cierre por
 * botón atrás del sistema (closeTopSheet) no consume: el popstate de la
 * centinela ya la consumió.
 * @param {SheetSession} session
 */
function closeSession(session) {
  tearDown(session);
  if (!closingViaBack) consumeSheetSentinel();
}

/**
 * Cierre por vía iniciada por el usuario: corre onClose y retira la capa.
 * Idempotente; también la usa closeTopSheet para el botón atrás del sistema.
 * El onClose corre primero porque puede repintar la superficie (p. ej. cerrar
 * la Ficha de Novedades re-renderiza el tablón): la restauración de foco del
 * tearDown ya comprueba que el elemento recordado siga conectado.
 */
function closeUserPath() {
  if (!current) return;
  const session = current;
  const onClose = session.onClose;
  try {
    onClose?.();
  } finally {
    closeSession(session);
  }
}

/**
 * Listener único de teclado: Escape cierra por vía de usuario; Tab avanza en
 * ciclo por los enfocables de la hoja (nunca escapa al body ni al documento).
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeUserPath();
    return;
  }
  if (e.key !== 'Tab' || !current) return;
  const list = focusables(current.sheet);
  if (list.length === 0) return;
  e.preventDefault();
  const active = /** @type {Element|null} */ (document.activeElement);
  const index = active instanceof HTMLElement ? list.indexOf(active) : -1;
  const next = e.shiftKey
    ? list[(index - 1 + list.length) % list.length]
    : list[(index + 1) % list.length];
  next.focus();
}

/**
 * Abre la hoja (reemplazando cualquier hoja abierta, sin llamar a su onClose).
 * Devuelve { close, layer } para que el adaptador cablee su contenido con qsa
 * sobre `layer` (el .add-sheet) y repinte solo el .sheet-body.
 * @param {{
 *   title?: string,
 *   content: string,
 *   onClose?: (() => void)|null,
 *   role?: string,
 *   titleId?: string,
 *   closeAttr?: string,
 *   backdropAttr?: string,
 *   layerClass?: string,
 *   sheetClass?: string,
 *   closeClass?: string,
 * }} opts
 * @returns {{ close: () => void, layer: HTMLElement }}
 */
export function openSheet({
  title,
  content,
  onClose = null,
  role = 'dialog',
  titleId = 'sheet-title',
  closeAttr = '',
  backdropAttr = '',
  layerClass = '',
  sheetClass = '',
  closeClass = 'chip',
}) {
  if (current) tearDown(current);
  const focusTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const layer = document.createElement('div');
  layer.className = `add-layer fade${layerClass ? ` ${layerClass}` : ''}`;
  const head = title
    ? html`<header class="add-head">
        <h2 id="${titleId}">${title}</h2>
        <button
          type="button"
          class="${closeClass}"
          data-sheet-close${closeAttr ? ` ${closeAttr}` : ''}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </header>`
    : '';
  layer.innerHTML = html`<div
    class="add-backdrop"
    data-sheet-backdrop${backdropAttr ? ` ${backdropAttr}` : ''}
  ></div>`;
  const sheet = document.createElement('section');
  sheet.className = `add-sheet${sheetClass ? ` ${sheetClass}` : ''}`;
  sheet.setAttribute('role', role);
  sheet.setAttribute('aria-modal', 'true');
  if (title) sheet.setAttribute('aria-labelledby', titleId);
  sheet.innerHTML = `${head}<div class="sheet-body" data-sheet-body>${content}</div>`;
  layer.appendChild(sheet);
  document.body.appendChild(layer);

  layer.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-sheet-backdrop]')) {
      closeUserPath();
    }
  });
  qs('[data-sheet-close]', layer)?.addEventListener('click', () => closeUserPath());

  const session = /** @type {SheetSession} */ ({ layer, sheet, onClose, focusTarget });
  current = session;
  document.addEventListener('keydown', onKeyDown);
  keyHandler = onKeyDown;
  // A profundidad 0 el atrás del sistema no tiene entrada que poppear: la
  // centinela le da una (la consume el popstate al cerrar la hoja).
  ensureSheetSentinel();

  // Foco inicial: primer elemento enfocable del contenido; sin ninguno, el ✕.
  const firstFocusable = focusables(sheet)[0];
  const initial = firstFocusable ?? qs('[data-sheet-close]', layer) ?? sheet;
  if (initial instanceof HTMLElement) initial.focus();

  return { close: () => closeSession(session), layer: sheet };
}

/**
 * Cierre de hoja para el botón atrás del sistema (backnav): corre onClose y
 * retira la capa. Devuelve true si había hoja abierta y se cerró. No consume
 * la centinela: el popstate que disparó el cierre ya la consumió.
 * @returns {boolean}
 */
export function closeTopSheet() {
  if (!current) return false;
  closingViaBack = true;
  try {
    closeUserPath();
  } finally {
    closingViaBack = false;
  }
  return true;
}

/** El closer ya se registró en backnav (initSheet idempotente). */
let closerRegistered = false;

/**
 * Registra el cierre de hoja en backnav (ticket 1): el botón atrás del móvil
 * cierra la hoja primero, sin cambiar de pantalla; backnav re-empuja la
 * instantánea al consumir la pulsación. Lo llama el arranque (src/boot.js)
 * ANTES de createApp, para que el popstate del historial pueda consultarlo
 * desde la primera entrada. Idempotente: una sola vez por página.
 */
export function initSheet() {
  if (closerRegistered) return;
  closerRegistered = true;
  registerSheetCloser(closeTopSheet);
}

/**
 * Limpieza total para pruebas: cierra la hoja (sin onClose) y re-registra el
 * closer en backnav, que resetBackNav anula.
 */
export function resetSheet() {
  if (current) tearDown(current);
  closerRegistered = false;
  initSheet();
}