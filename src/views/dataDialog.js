/**
 * Diálogo «Datos» (ticket 19, spec §5.6): agrupa conexión/importación,
 * exportación verificada, «Compartir copia», restauración de copias OPFS y
 * almacenamiento persistente. Es un adaptador de la hoja profunda
 * (src/ui/sheet.js): el módulo pinta la capa y es dueño de ✕/fondo/Escape;
 * aquí solo viven el contenido y los repintados del .sheet-body.
 */
import { html, qs, qsa, raw } from '../lib/dom.js';
import { store } from '../app.js';
import { validateDoc } from '../domain/validate.js';
import { DEFAULT_EXPORT_NAME, importDoc, markSaved, saveExportName } from '../data/library.js';
import { pickAndConnect } from '../data/filelink.js';
import { listBackups, readBackup } from '../data/opfs.js';
import { persistenceStatusLine, requestPersistOnce } from '../data/persist.js';
import { assertWritable } from '../data/tablock.js';
import { sha256Hex } from '../services/hash.js';
import { igdb } from '../services/igdb.js';
import { saveWorkerUrl } from '../data/library.js';
import { openSheet, SHEET_BODY_SELECTOR } from '../ui/sheet.js';

/** @typedef {import('../data/opfs.js').BackupInfo} BackupInfo */

/** Contenido vivo del diálogo; cada repaint lo fusiona con los resultados async.
 * @typedef {{
 *   note?: string,
 *   error?: string,
 *   backups?: BackupInfo[] | null,
 *   persist?: string,
 * }} DataView
 */

const fmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

/** Hoja del módulo de hojas actualmente abierta (el .add-sheet). @type {HTMLElement | null} */
let layer = null;

/** Cierre de la hoja del módulo. @type {(() => void)|null} */
let closeSheet = null;

/** @type {DataView} */
let view = {};

export function isDataOpen() {
  return layer !== null;
}

export function closeDataDialog() {
  closeSheet?.();
  closeSheet = null;
  layer = null;
}

export function openDataDialog() {
  closeDataDialog();
  const handle = openSheet({
    title: 'Datos',
    closeAttr: 'data-close',
    backdropAttr: 'data-close',
    closeClass: 'tag-x',
    onClose: closeDataDialog,
    content: '',
  });
  layer = handle.layer;
  closeSheet = handle.close;
  view = {};
  paint();
  void loadBackups();
  void loadPersistLine();
}

async function loadBackups() {
  const backups = await listBackups();
  if (!layer) return;
  paint({ backups });
}

async function loadPersistLine() {
  const line = await persistenceStatusLine();
  if (!layer || line === '') return;
  paint({ persist: line });
}

function suggestedName() {
  return store.get().meta.exportFileName || DEFAULT_EXPORT_NAME;
}

function connectionStatusHtml() {
  const { file, meta } = store.get();
  if (file.status === 'connected') {
    return html`Conectada al archivo «${file.name ?? meta.connectedFileName ?? '—'}».`;
  }
  if (file.status === 'error') {
    return html`Problema con el archivo: ${file.error ?? '—'}`;
  }
  return 'Sin archivo conectado: la biblioteca vive solo en este dispositivo.';
}

/** @returns {boolean} */
function canShareFiles() {
  const nav = /** @type {any} */ (navigator);
  if (typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
  try {
    return nav.canShare({ files: [new File([], 'x.json', { type: 'application/json' })] }) === true;
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function hasSavePicker() {
  return typeof self !== 'undefined' && 'showSaveFilePicker' in self;
}

/** @param {unknown} err @returns {boolean} */
function isAbortError(err) {
  return err instanceof Error && err.name === 'AbortError';
}

/** @param {unknown} err @returns {string} */
function message(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Descarga universal (Blob + a[download]): la vía manual sin FSA (spec §5.6).
 * @param {string} text
 * @param {string} name
 */
function downloadText(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Doc actual serializado y validado, o motivo de error. @returns {{ ok: true, text: string } | { ok: false, reason: string }} */
function serializeDoc() {
  const { doc } = store.get();
  if (!doc) return { ok: false, reason: 'No hay biblioteca que exportar.' };
  const res = validateDoc(doc);
  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true, text: JSON.stringify(res.doc) };
}

async function doConnect() {
  const res = await pickAndConnect();
  if (res.status === 'cancelled') {
    // AbortError silencioso: ni nota ni error.
    paint({ note: '', error: '' });
    return;
  }
  if (res.status === 'error') {
    paint({ note: '', error: res.error ?? 'No se pudo importar el archivo.' });
    return;
  }
  paint({
    note:
      res.status === 'imported'
        ? 'Archivo importado: la biblioteca local fue sustituida por su contenido.'
        : `Sesión conectada al archivo «${res.name ?? '—'}».`,
    error: '',
  });
}

async function doExport() {
  const serialized = serializeDoc();
  if (!serialized.ok) {
    paint({ note: '', error: serialized.reason });
    return;
  }
  const text = serialized.text;
  const name = suggestedName();
  let written = false;
  if (hasSavePicker()) {
    try {
      const picker = /** @type {(opts?: unknown) => Promise<any>} */ (/** @type {any} */ (self).showSaveFilePicker);
      const handle = await picker.call(self, {
        suggestedName: name,
        types: [{ description: 'Game Tracker', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      written = true;
    } catch (err) {
      if (isAbortError(err)) {
        paint({ note: '', error: '' });
        return;
      }
      // Picker roto o permiso fallido: cae al vuelco universal por descarga.
    }
  }
  if (!written) downloadText(text, name);

  // El export manual cuenta como vuelco verificado (spec §5.6): marca limpio.
  if (!assertWritable()) {
    paint({ note: `Copia exportada como «${name}» (pestaña en solo lectura).`, error: '' });
    return;
  }
  try {
    await markSaved({ hash: await sha256Hex(text), now: new Date() });
    void requestPersistOnce();
  } catch (err) {
    paint({ note: '', error: `Copia exportada como «${name}», pero no se pudo registrar el vuelco: ${message(err)}` });
    return;
  }
  paint({ note: `Copia exportada como «${name}»: vuelco verificado registrado.`, error: '' });
}

async function doShare() {
  const serialized = serializeDoc();
  if (!serialized.ok) {
    paint({ note: '', error: serialized.reason });
    return;
  }
  const file = new File([serialized.text], suggestedName(), { type: 'application/json' });
  try {
    await /** @type {any} */ (navigator).share({ files: [file] });
    paint({ note: 'Copia compartida.', error: '' });
  } catch (err) {
    if (isAbortError(err)) return;
    paint({ note: '', error: `No se pudo compartir: ${message(err)}` });
  }
}

/** @param {Element | null} input */
async function doSaveName(input) {
  const value = input instanceof HTMLInputElement ? input.value : '';
  try {
    const saved = await saveExportName(value);
    paint({ note: `Nombre sugerido guardado: «${saved}».`, error: '' });
  } catch (err) {
    paint({ note: '', error: message(err) });
  }
}

/**
 * Guarda la Conexión (URL del proxy IGDB) dentro del doc; vacío la quita.
 * Una URL no http(s) se revierte y se avisa, como hacía la hoja de Alta.
 * @param {Element | null} input
 */
async function doSaveWorkerUrl(input) {
  const value = input instanceof HTMLInputElement ? input.value : '';
  if (!assertWritable()) {
    paint({ note: '', error: 'Pestaña en solo lectura: la conexión solo puede editarse en la pestaña activa.' });
    return;
  }
  try {
    const saved = await saveWorkerUrl(value);
    if (saved !== '' && !igdb.isConfigured()) {
      await saveWorkerUrl('');
      paint({ note: '', error: 'URL no válida — pega la https://… del Worker' });
      return;
    }
    paint({
      note: saved === '' ? 'Conexión quitada.' : `Conexión guardada: «${saved}».`,
      error: '',
    });
  } catch (err) {
    paint({ note: '', error: message(err) });
  }
}

/** @param {string} name */
async function doRestore(name) {
  try {
    const backup = await readBackup(name);
    if (!backup) throw new Error('No hay copias disponibles.');
    // Restaurar es una elección deliberada: sustituye el espejo tras validar.
    const text = JSON.stringify(backup.doc);
    await importDoc(text, { hash: await sha256Hex(text), fileName: null });
    closeDataDialog();
  } catch (err) {
    paint({ note: '', error: `No se pudo restaurar la copia: ${message(err)}` });
  }
}

function backupsSectionHtml() {
  let body;
  if (view.backups === undefined) {
    body = raw('<p class="datos-hint">Buscando copias de seguridad…</p>');
  } else if (view.backups === null || view.backups.length === 0) {
    body = raw(
      '<p class="datos-empty datos-hint">Todavía no hay copias de seguridad: se crean solas tras cada vuelco exitoso.</p>',
    );
  } else {
    const items = view.backups
      .map((b) =>
        html`<li>
          <span class="mono">${fmt.format(new Date(b.savedAt))}</span>
          <button type="button" class="chip chip-xs" data-restore="${b.name}">Restaurar</button>
        </li>`,
      )
      .join('');
    body = raw(`<ul class="datos-backups">${items}</ul>`);
  }
  return html`<section class="datos-sec">
    <h3>Restaurar copia</h3>
    <p class="datos-hint">Últimos 3 vuelcos exitosos guardados por la propia app en este dispositivo.</p>
    ${body}
  </section>`;
}

function bodyHtml() {
  const nameInput = /** @type {string} */ (store.get().meta.exportFileName || DEFAULT_EXPORT_NAME);
  const shareBtn = canShareFiles() ? raw('<button type="button" class="chip" data-share>Compartir copia</button>') : '';
  return html`<section class="datos-sec">
        <h3>Conectar / Importar</h3>
        <p class="datos-hint">
          Elegir un .json es una decisión deliberada: tras validar, su contenido SUSTITUYE la biblioteca local. Sin
          lógica de conflicto.
        </p>
        <p class="datos-status mono">${connectionStatusHtml()}</p>
        <button type="button" class="btn-primary" data-conectar>Conectar o importar .json…</button>
      </section>

      <section class="datos-sec">
        <h3>Exportar</h3>
        <p class="datos-hint">
          Vuelca el documento completo validado. Un export manual cuenta como vuelco verificado y limpia los cambios
          pendientes.
        </p>
        <div class="datos-actions">
          <button type="button" class="btn-primary" data-export>Exportar copia completa</button>
          ${shareBtn}
        </div>
      </section>

      <section class="datos-sec">
        <h3>Nombre sugerido</h3>
        <label class="lbl" for="datos-name-input">Nombre para guardar o compartir copias</label>
        <input id="datos-name-input" class="datos-name mono" type="text" value="${nameInput}" data-export-name />
        <button type="button" class="chip" data-save-name>Guardar nombre</button>
      </section>

      <section class="datos-sec">
        <h3>Conexión</h3>
        <p class="datos-hint">
          URL del proxy IGDB (Cloudflare Worker) que alimenta «Buscar online» y Novedades. Se guarda dentro de tu
          .json y viaja con la biblioteca; las credenciales viven solo en el Worker.
        </p>
        <label class="lbl" for="datos-worker-input">URL del proxy IGDB</label>
        <input
          id="datos-worker-input"
          class="datos-name mono"
          type="text"
          value="${igdb.workerUrl()}"
          placeholder="https://tu-worker.workers.dev"
          data-worker-url
        />
        <button type="button" class="chip" data-save-worker>Guardar conexión</button>
      </section>

      ${backupsSectionHtml()}

      <section class="datos-sec">
        <h3>Almacenamiento</h3>
        <p class="datos-hint" data-persist-status>${view.persist ?? ''}</p>
      </section>

      ${view.note ? html`<p class="datos-note">${view.note}</p>` : ''}
      ${view.error ? html`<p class="form-error" role="alert">${view.error}</p>` : ''}`;
}

function paint(/** @type {DataView} */ patch = {}) {
  view = { ...view, ...patch };
  const layerEl = layer;
  if (!layerEl) return;
  const body = qs(SHEET_BODY_SELECTOR, layerEl);
  if (body) body.innerHTML = bodyHtml();
  wire(layerEl);
}

/**
 * @param {HTMLElement} layerEl
 */
function wire(layerEl) {
  qs('[data-conectar]', layerEl)?.addEventListener('click', () => void doConnect());
  qs('[data-export]', layerEl)?.addEventListener('click', () => void doExport());
  qs('[data-share]', layerEl)?.addEventListener('click', () => void doShare());
  qs('[data-save-name]', layerEl)?.addEventListener('click', () => {
    void doSaveName(qs('[data-export-name]', layerEl));
  });
  qs('[data-save-worker]', layerEl)?.addEventListener('click', () => {
    void doSaveWorkerUrl(qs('[data-worker-url]', layerEl));
  });
  for (const restoreBtn of qsa('[data-restore]', layerEl)) {
    restoreBtn.addEventListener('click', () => {
      const name = restoreBtn.getAttribute('data-restore');
      if (name) void doRestore(name);
    });
  }
}
