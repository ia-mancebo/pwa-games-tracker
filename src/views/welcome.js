/**
 * Bienvenida del primer arranque (spec §5.2): importar un game-tracker.json
 * válido o empezar una biblioteca nueva. createApp solo la renderiza cuando
 * `ready && !doc`; con biblioteca cargada esta vista nunca aparece.
 */
import { html, qs, raw } from '../lib/dom.js';
import { store } from '../app.js';
import { importDoc, newLibrary } from '../data/library.js';
import { sha256Hex } from '../services/hash.js';
import { hasFsa, pickJsonText } from '../services/fsa.js';

/** Motivo del último intento fallido; se pinta inline hasta el próximo intento. @type {string|null} */
let importError = null;

/** Contenedor del último render, para repintar tras un fallo sin cambiar estado. @type {Element|null} */
let currentContainer = null;

function repaint() {
  // Solo repinta si la bienvenida sigue siendo la vista activa (sin doc):
  // evita pisar la vista de pestañas tras un import/new ya resuelto.
  if (currentContainer && !store.get().doc) render(currentContainer, store);
}

/** Limpia el estado de módulo (aislación entre escenarios en pruebas). */
export function resetWelcome() {
  importError = null;
  currentContainer = null;
}

/**
 * Importa un texto JSON como documento. Los fallos se muestran inline y no
 * tocan el estado actual (validateDoc decide antes de escribir nada).
 * @param {string} text
 * @param {string|null} fileName
 * @returns {Promise<boolean>} true si importó
 */
export async function handleImportText(text, fileName) {
  importError = null;
  try {
    const hash = await sha256Hex(text);
    await importDoc(text, { hash, fileName });
    return true;
  } catch (err) {
    importError = err instanceof Error ? err.message : 'No se pudo importar el archivo.';
    repaint();
    return false;
  }
}

/**
 * Empieza una biblioteca nueva: nace dirty; el primer vuelco/export creará
 * el archivo más adelante (spec §5.2 camino 2).
 * @returns {Promise<void>}
 */
export async function handleNewLibrary() {
  importError = null;
  await newLibrary(new Date());
}

/**
 * Camino FSA: picker nativo → hash → importDoc. Cancelar (`AbortError`) es
 * silencioso; cualquier otro fallo del picker se muestra inline.
 * @returns {Promise<void>}
 */
export async function handleImportPick() {
  if (!hasFsa()) return;
  importError = null;
  try {
    const picked = await pickJsonText();
    if (!picked) return;
    await handleImportText(picked.text, picked.name);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    importError = err instanceof Error ? err.message : 'No se pudo abrir el archivo.';
    repaint();
  }
}

/**
 * @param {Element} container
 * @param {import('../app.js').Store} _store
 */
export function render(container, _store) {
  currentContainer = container;
  const fsa = hasFsa();
  container.innerHTML = html`<div class="welcome fade">
    <header class="welcome-head">
      <div class="logo logo-big" aria-hidden="true">GT</div>
      <h1>Game Tracker</h1>
      <p class="sub">Tu biblioteca, en un archivo que es tuyo.</p>
    </header>
    <div class="welcome-options">
      <button type="button" class="cardbox opt" data-action="import">
        <span class="opt-badge">Recomendado</span>
        <h2>Importar mi game-tracker.json</h2>
        <p>Importa tu archivo existente; valida antes de tocar nada.</p>
      </button>
      <button type="button" class="cardbox opt" data-action="new">
        <h2>Empezar biblioteca nueva</h2>
        <p>Empieza de cero; el primer vuelco/export creará el archivo más adelante.</p>
      </button>
    </div>
    ${importError ? raw(html`<p class="form-error" role="alert">${importError}</p>`) : ''}
    ${fsa
      ? ''
      : raw(html`<input type="file" accept=".json,application/json" hidden data-import-input />`)}
  </div>`;
  wire(container, fsa);
}

/**
 * @param {Element} container
 * @param {boolean} fsa
 */
function wire(container, fsa) {
  const importBtn = qs('[data-action="import"]', container);
  const newBtn = qs('[data-action="new"]', container);
  const input = /** @type {HTMLInputElement|null} */ (qs('input[data-import-input]', container));
  newBtn?.addEventListener('click', () => {
    void handleNewLibrary();
  });
  if (fsa) {
    importBtn?.addEventListener('click', () => {
      void handleImportPick();
    });
  } else if (importBtn && input) {
    importBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => handleImportText(text, file.name));
    });
  }
}
