/**
 * Pastilla permanente del enlace de archivo (ticket 18): parte del chrome de
 * la app, encima de cualquier vista. Estados desconectado/conectado/error y
 * pista estática cuando el navegador no tiene File System Access. En segunda
 * pestaña (ticket 19) muestra el banner de solo lectura y bloquea escrituras.
 *
 * El render completo (innerHTML) solo corre cuando cambia la ESTRUCTURA
 * (estado, nombre, rol, banner); los cambios de guardado (meta.dirty,
 * file.saving) actualizan la pastilla `.file-dirty` en sitio, sin reescribir
 * el chrome: reescribir en cada vuelco re-dispara la animación `.fade` de la
 * vista y parpadea toda la pantalla. Los listeners viven en los nodos del
 * chrome y solo se re-atan tras un render completo (los nodos son nuevos).
 */
import { html, qs, raw } from '../lib/dom.js';
import { store } from '../app.js';
import { getHandle, hasFsa } from '../services/fsa.js';
import { pickAndConnect, reconnect, saveNow } from '../data/filelink.js';
import { onLockReleased } from '../data/tablock.js';

/** @returns {boolean} */
function readOnly() {
  return store.get().tabRole === 'secondary';
}

const DATOS_BTN = '<button type="button" class="chip chip-xs bar-datos" data-open-data>Datos</button>';

const RO_PILL = '<span class="pill st-backlog">Solo lectura</span>';

function bannerHtml() {
  return html`<div class="ro-banner" role="status">
    <span class="ro-banner-text">Otra pestaña tiene la biblioteca abierta. Estás en solo lectura.</span>
    <button type="button" class="chip chip-xs" data-become-primary>Hacerme activa</button>
  </div>`;
}

/**
 * Clave estructural del filebar: si no cambia entre renders, la pastilla
 * dirty se actualiza en sitio y el chrome queda intacto. Todo lo que pinta el
 * render completo (estado, nombre, error, rol, banner) entra en la clave;
 * `meta.dirty` y `file.saving` NO, porque solo afectan a la pastilla.
 * @returns {string}
 */
function structuralKey() {
  const { file, meta } = store.get();
  return [
    hasFsa(),
    file.status,
    file.name ?? meta.connectedFileName ?? '—',
    readOnly(),
    file.error ?? '',
  ].join('|');
}

/**
 * Marcado completo del filebar según el estado actual.
 * @returns {string}
 */
function filebarHtml() {
  const { file, meta } = store.get();
  const ro = readOnly();
  const banner = ro ? bannerHtml() : '';
  if (!hasFsa()) {
    // Sin File System Access no hay .json enlazado, pero el espejo IndexedDB
    // guarda cada cambio al momento (library.mutate): la pastilla informa,
    // no alerta. Exportar en Datos sigue como copia manual.
    return html`${banner}<div class="filebar">
      <span class="pill st-playing">Guardado automático en este navegador</span>${raw(DATOS_BTN)}
    </div>`;
  }
  if (file.status === 'connected') {
    // Mientras corre el vuelco la pastilla informa del estado en vivo; al
    // terminar con éxito `markSaved` limpia `dirty` y desaparece sola.
    const dirtyPill = meta.dirty
      ? file.saving
        ? '<span class="file-dirty mono">● volcando…</span>'
        : '<span class="file-dirty mono">● cambios sin volcar</span>'
      : '';
    return html`${banner}<div class="filebar">
      <span class="file-name">Archivo: ${file.name ?? meta.connectedFileName ?? '—'}</span>
      ${raw(dirtyPill)}
      ${ro ? raw(RO_PILL) : raw('<button type="button" class="chip chip-xs" data-save-now>Guardar ahora</button>')}
      ${raw(DATOS_BTN)}
    </div>`;
  }
  if (file.status === 'error') {
    return html`${banner}<div class="filebar">
      <span class="pill-btn">${file.error ?? 'No se pudo escribir el archivo.'}</span>
      ${ro ? raw(RO_PILL) : raw('<button type="button" class="chip chip-xs" data-retry>Reintentar</button>')}
      ${raw(DATOS_BTN)}
    </div>`;
  }
  return html`${banner}<div class="filebar">
    ${ro ? raw(RO_PILL) : raw('<button type="button" class="pill-btn" data-connect>Archivo no conectado — Reconectar</button>')}
    ${raw(DATOS_BTN)}
  </div>`;
}

/**
 * Actualiza en sitio la pastilla de estado de guardado (dirty/volcando) sin
 * tocar el resto del chrome: crea, reescribe o retira el nodo `.file-dirty`
 * en la misma posición que lo pinta el render completo (tras el nombre).
 * @param {Element} container
 */
function updateDirtyPill(container) {
  const { file, meta } = store.get();
  const pill = qs('.file-dirty', container);
  const text =
    file.status === 'connected' && meta.dirty
      ? file.saving
        ? '● volcando…'
        : '● cambios sin volcar'
      : '';
  if (!text) {
    pill?.remove();
    return;
  }
  if (pill) {
    pill.textContent = text;
    return;
  }
  const span = document.createElement('span');
  span.className = 'file-dirty mono';
  span.textContent = text;
  const name = qs('.file-name', container);
  if (name) name.after(span);
  else qs('.filebar', container)?.append(span);
}

/**
 * Re-ata los listeners del chrome. Solo tras un render completo: los nodos
 * son nuevos; el camino de pastilla en sitio no toca listeners.
 * @param {Element} container
 */
function wire(container) {
  qs('[data-become-primary]', container)?.addEventListener('click', () => {
    void onLockReleased(() => store.set({ tabRole: 'primary' }));
  });
  if (readOnly()) return;
  qs('[data-connect]', container)?.addEventListener('click', () => {
    if (getHandle()) void reconnect();
    else void pickAndConnect();
  });
  qs('[data-save-now]', container)?.addEventListener('click', () => {
    void saveNow();
  });
  // Reintento manual tras un fallo de escritura; el espejo sigue intacto.
  qs('[data-retry]', container)?.addEventListener('click', () => {
    void saveNow();
  });
}

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function renderFilebar(container, _store) {
  const slot = /** @type {HTMLElement} */ (container);
  const key = structuralKey();
  // Estructura intacta y chrome presente (la puerta de bienvenida vacía el
  // slot sin avisar): solo la pastilla dirty puede haber cambiado.
  if (slot.dataset.filebarKey === key && slot.firstElementChild) {
    updateDirtyPill(slot);
    return;
  }
  slot.dataset.filebarKey = key;
  slot.innerHTML = filebarHtml();
  wire(slot);
}