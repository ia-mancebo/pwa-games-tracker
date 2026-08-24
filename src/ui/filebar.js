/**
 * Pastilla permanente del enlace de archivo (ticket 18): parte del chrome de
 * la app, encima de cualquier vista. Estados desconectado/conectado/error y
 * pista estática cuando el navegador no tiene File System Access.
 */
import { html, qs, raw } from '../lib/dom.js';
import { store } from '../app.js';
import { getHandle, hasFsa } from '../services/fsa.js';
import { openConflict } from './conflictDialog.js';
import { pickAndConnect, reconnect, saveNow, setConflictHandler } from '../data/filelink.js';

// Los conflictos detectados en segundo plano (foco, ocultar pestaña,
// autoguardado) también abren el diálogo aquí.
setConflictHandler((info) => openConflict(info.fileDoc));

/** @param {import('../data/filelink.js').LinkResult | undefined} res */
function surfaceConflict(res) {
  if (res?.status === 'conflict' && res.fileDoc) openConflict(res.fileDoc);
}

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function renderFilebar(container, _store) {
  const { file, meta } = store.get();
  if (!hasFsa()) {
    container.innerHTML = html`<div class="filebar">
      <span class="pill st-backlog">Sin acceso a archivos — usa Exportar en Datos</span>
    </div>`;
    return;
  }
  if (file.status === 'connected') {
    container.innerHTML = html`<div class="filebar">
      <span class="file-name">Archivo: ${file.name ?? meta.connectedFileName ?? '—'}</span>
      ${raw(meta.dirty ? '<span class="file-dirty mono">● cambios sin volcar</span>' : '')}
      <button type="button" class="chip chip-xs" data-save-now>Guardar ahora</button>
    </div>`;
  } else if (file.status === 'error') {
    container.innerHTML = html`<div class="filebar">
      <span class="pill-btn">${file.error ?? 'No se pudo escribir el archivo.'}</span>
      <button type="button" class="chip chip-xs" data-retry>Reintentar</button>
    </div>`;
  } else {
    container.innerHTML = html`<div class="filebar">
      <button type="button" class="pill-btn" data-connect>Archivo no conectado — Reconectar</button>
    </div>`;
  }

  qs('[data-connect]', container)?.addEventListener('click', () => {
    const operation = getHandle() ? reconnect() : pickAndConnect();
    void operation.then(surfaceConflict);
  });
  qs('[data-save-now]', container)?.addEventListener('click', () => {
    void saveNow().then(surfaceConflict);
  });
  // Reintento manual tras un fallo de escritura; el espejo sigue intacto.
  qs('[data-retry]', container)?.addEventListener('click', () => {
    void saveNow();
  });
}
