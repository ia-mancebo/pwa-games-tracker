/**
 * Diálogo de conflicto real (ticket 18, spec §5.5): tres opciones explícitas
 * con la fecha de ambas versiones; jamás sobrescribe en silencio. Es un
 * adaptador de la hoja profunda (src/ui/sheet.js): el módulo pinta la capa,
 * el fondo y la cabecera, y es dueño de ✕/fondo/Escape; aquí solo viven el
 * contenido y los repintados del .sheet-body.
 */
import { html, qs } from '../lib/dom.js';
import { store } from '../app.js';
import { resolveConflict } from '../data/filelink.js';
import { openSheet, SHEET_BODY_SELECTOR } from './sheet.js';

/** Hoja del módulo de hojas actualmente abierta (el .add-sheet). @type {HTMLElement | null} */
let layer = null;

/** Cierre de la hoja del módulo. @type {(() => void)|null} */
let closeSheet = null;

export function isConflictOpen() {
  return layer !== null;
}

export function closeConflict() {
  closeSheet?.();
  closeSheet = null;
  layer = null;
}

/** Fecha legible y estable (sin depender de locale) para el campo updatedAt.
 * @param {string|null} iso
 * @returns {string}
 */
function stamp(iso) {
  return typeof iso === 'string' ? iso.replace('T', ' ').slice(0, 16) : '—';
}

/**
 * Abre el diálogo para el doc leído del archivo; la versión local se toma del
 * store en el momento de abrir.
 * @param {import('../domain/schema.js').Doc} fileDoc
 */
export function openConflict(fileDoc) {
  closeConflict();
  if (!store.get().doc) return;
  const handle = openSheet({
    title: 'Conflicto de versiones',
    closeAttr: 'data-close',
    backdropAttr: 'data-close',
    closeClass: 'tag-x',
    sheetClass: 'conflict-sheet',
    onClose: closeConflict,
    content: '',
  });
  layer = handle.layer;
  closeSheet = handle.close;
  paint(fileDoc);
}

/**
 * @param {import('../domain/schema.js').Doc} fileDoc
 * @param {{ armed?: boolean, note?: string, error?: string }} [opts]
 */
function paint(fileDoc, { armed = false, note = '', error = '' } = {}) {
  const layerEl = layer;
  if (!layerEl) return;
  const localUpdatedAt = store.get().doc?.updatedAt ?? null;
  const actions = armed
    ? html`<div class="conflict-confirm">
        <p class="p-confirm">¿Seguro? Se descartarán tus cambios locales.</p>
        <button type="button" class="chip danger" data-confirm="yes">Sí, usar el archivo</button>
        <button type="button" class="chip" data-confirm="no">No, volver</button>
      </div>`
    : html`<div class="conflict-actions">
        <button type="button" class="chip danger" data-choice="file">Usar la versión del archivo</button>
        <button type="button" class="btn-primary" data-choice="local">Mantener mis cambios</button>
        <button type="button" class="chip" data-choice="download">Descargar copia local</button>
      </div>`;
  const body = qs(SHEET_BODY_SELECTOR, layerEl);
  if (body) {
    body.innerHTML = html`<p class="conflict-intro">
        El archivo cambió fuera de la app y además hay cambios sin volcar. Elige qué
        versión conservar; no se pierde nada sin tu confirmación.
      </p>
      <div class="conflict-versions">
        <div class="cardbox tight">
          <span class="lbl">Tu versión local</span>
          <b class="mono">${stamp(localUpdatedAt)}</b>
        </div>
        <div class="cardbox tight">
          <span class="lbl">Versión del archivo</span>
          <b class="mono">${stamp(fileDoc.updatedAt)}</b>
        </div>
      </div>
      ${actions}
      ${note ? html`<p class="conflict-note">${note}</p>` : ''}
      ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}`;
  }
  wire(layerEl, fileDoc);
}

/** Resuelve y cierra; los fallos se muestran inline sin cerrar.
 * @param {'file' | 'local'} choice
 * @param {import('../domain/schema.js').Doc} fileDoc
 * @returns {Promise<void>}
 */
async function finish(choice, fileDoc) {
  const res = await resolveConflict(choice);
  if (res.status === 'error') {
    paint(fileDoc, { error: res.error ?? 'No se pudo resolver el conflicto.' });
    return;
  }
  closeConflict();
}

/**
 * @param {HTMLElement} layerEl
 * @param {import('../domain/schema.js').Doc} fileDoc
 */
function wire(layerEl, fileDoc) {
  qs('[data-choice="file"]', layerEl)?.addEventListener('click', () => paint(fileDoc, { armed: true }));
  qs('[data-choice="local"]', layerEl)?.addEventListener('click', () => void finish('local', fileDoc));
  qs('[data-choice="download"]', layerEl)?.addEventListener('click', () => {
    void resolveConflict('download').then((res) => {
      if (res.status === 'error') {
        paint(fileDoc, { error: res.error ?? 'No se pudo descargar la copia.' });
        return;
      }
      // No resuelve: sigue abierta para que elija tras comparar (spec §5.5).
      paint(fileDoc, { note: 'Copia local descargada. Compárala y vuelve a elegir.' });
    });
  });
  qs('[data-confirm="yes"]', layerEl)?.addEventListener('click', () => void finish('file', fileDoc));
  qs('[data-confirm="no"]', layerEl)?.addEventListener('click', () => paint(fileDoc));
}
