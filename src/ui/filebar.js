/**
 * Pastilla permanente del enlace de archivo (ticket 18): parte del chrome de
 * la app, encima de cualquier vista. Estados desconectado/conectado/error y
 * pista estática cuando el navegador no tiene File System Access. En segunda
 * pestaña (ticket 19) muestra el banner de solo lectura y bloquea escrituras.
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
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function renderFilebar(container, _store) {
  const { file, meta } = store.get();
  const ro = readOnly();
  const banner = ro ? bannerHtml() : '';
  if (!hasFsa()) {
    // Sin File System Access no hay .json enlazado, pero el espejo IndexedDB
    // guarda cada cambio al momento (library.mutate): la pastilla informa,
    // no alerta. Exportar en Datos sigue como copia manual.
    container.innerHTML = html`${banner}<div class="filebar">
      <span class="pill st-playing">Guardado automático en este navegador</span>${raw(DATOS_BTN)}
    </div>`;
    return;
  }
  if (file.status === 'connected') {
    // Mientras corre el vuelco la pastilla informa del estado en vivo; al
    // terminar con éxito `markSaved` limpia `dirty` y desaparece sola.
    const dirtyPill = meta.dirty
      ? file.saving
        ? '<span class="file-dirty mono">● volcando…</span>'
        : '<span class="file-dirty mono">● cambios sin volcar</span>'
      : '';
    container.innerHTML = html`${banner}<div class="filebar">
      <span class="file-name">Archivo: ${file.name ?? meta.connectedFileName ?? '—'}</span>
      ${raw(dirtyPill)}
      ${ro ? raw(RO_PILL) : raw('<button type="button" class="chip chip-xs" data-save-now>Guardar ahora</button>')}
      ${raw(DATOS_BTN)}
    </div>`;
  } else if (file.status === 'error') {
    container.innerHTML = html`${banner}<div class="filebar">
      <span class="pill-btn">${file.error ?? 'No se pudo escribir el archivo.'}</span>
      ${ro ? raw(RO_PILL) : raw('<button type="button" class="chip chip-xs" data-retry>Reintentar</button>')}
      ${raw(DATOS_BTN)}
    </div>`;
  } else {
    container.innerHTML = html`${banner}<div class="filebar">
      ${ro ? raw(RO_PILL) : raw('<button type="button" class="pill-btn" data-connect>Archivo no conectado — Reconectar</button>')}
      ${raw(DATOS_BTN)}
    </div>`;
  }

  qs('[data-become-primary]', container)?.addEventListener('click', () => {
    void onLockReleased(() => store.set({ tabRole: 'primary' }));
  });
  if (ro) return;
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
