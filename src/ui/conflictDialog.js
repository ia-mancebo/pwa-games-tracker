/**
 * Diálogo de conflicto real (ticket 18, spec §5.5): tres opciones explícitas
 * con la fecha de ambas versiones; jamás sobrescribe en silencio. Render puro
 * del estado (ticket 03, ADR-0004): abre cuando `file.conflict` se fija y
 * cierra cuando desaparece, así que los conflictos en segundo plano (foco,
 * ocultar pestaña, autoguardado) abren solos vía suscripción al store. Es un
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
 * Abre el diálogo con el conflicto pendiente del estado; la versión local se
 * toma del store en el momento de pintar. Idempotente (cierra primero) y sin
 * efecto si no hay conflicto pendiente o no hay doc.
 */
export function openConflict() {
  closeConflict();
  const conflict = store.get().file.conflict ?? null;
  if (!conflict || !store.get().doc) return;
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
  paint(conflict);
}

/**
 * @param {import('../app.js').ConflictInfo} conflict
 * @param {{ armed?: boolean, note?: string, error?: string }} [opts]
 */
function paint(conflict, { armed = false, note = '', error = '' } = {}) {
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
          <b class="mono">${stamp(conflict.fileDoc.updatedAt)}</b>
        </div>
      </div>
      ${actions}
      ${note ? html`<p class="conflict-note">${note}</p>` : ''}
      ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}`;
  }
  wire(layerEl, conflict);
}

/** Resuelve y cierra; los fallos se muestran inline sin cerrar.
 * @param {'file' | 'local'} choice
 * @param {import('../app.js').ConflictInfo} conflict
 * @returns {Promise<void>}
 */
async function finish(choice, conflict) {
  const res = await resolveConflict(choice);
  if (res.status === 'error') {
    paint(conflict, { error: res.error ?? 'No se pudo resolver el conflicto.' });
    return;
  }
  closeConflict();
}

/**
 * @param {HTMLElement} layerEl
 * @param {import('../app.js').ConflictInfo} conflict
 */
function wire(layerEl, conflict) {
  qs('[data-choice="file"]', layerEl)?.addEventListener('click', () => paint(conflict, { armed: true }));
  qs('[data-choice="local"]', layerEl)?.addEventListener('click', () => void finish('local', conflict));
  qs('[data-choice="download"]', layerEl)?.addEventListener('click', () => {
    void resolveConflict('download').then((res) => {
      if (res.status === 'error') {
        paint(conflict, { error: res.error ?? 'No se pudo descargar la copia.' });
        return;
      }
      // No resuelve: sigue abierta para que elija tras comparar (spec §5.5).
      paint(conflict, { note: 'Copia local descargada. Compárala y vuelve a elegir.' });
    });
  });
  qs('[data-confirm="yes"]', layerEl)?.addEventListener('click', () => void finish('file', conflict));
  qs('[data-confirm="no"]', layerEl)?.addEventListener('click', () => paint(conflict));
}

// El diálogo sigue al estado (ADR-0004): abre cuando aparece un conflicto
// pendiente — también desde segundo plano, sin cableado por import — y cierra
// cuando se resuelve. La resolución de «file»/«local» borra el campo y la
// suscripción cierra; «download» no escribe estado y deja la hoja con la nota.
store.subscribe((state) => {
  const pending = state.file?.conflict ?? null;
  if (pending) {
    if (!isConflictOpen()) openConflict();
    return;
  }
  if (isConflictOpen()) closeConflict();
});
