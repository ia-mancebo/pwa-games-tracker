/**
 * Modal de arranque sin enlace de archivo: sin el .json conectado nada se
 * vuelca a él y los cambios viven solo en este navegador. Se abre UNA vez por
 * sesión desde main.js cuando hay biblioteca en el espejo pero el archivo no
 * está conectado, y ofrece reconectar (con gesto, para pedir permiso),
 * conectar otro .json, empezar biblioteca nueva o seguir por ahora.
 *
 * Es un adaptador de la hoja profunda (src/ui/sheet.js): el módulo de hojas
 * pinta la capa y es dueño de ✕/fondo/Escape; aquí solo vive el contenido y
 * el cierre automático por suscripción al estado del enlace.
 */
import { html, qs } from '../lib/dom.js';
import { store } from '../app.js';
import { newLibrary } from '../data/library.js';
import { pickAndConnect, reconnect } from '../data/filelink.js';
import { openSheet } from './sheet.js';

/** Cierre de la hoja actual. @type {(() => void)|null} */
let closeSheet = null;

/** @type {(() => boolean)|null} */
let unsubscribe = null;

/** Evita apilar el modal si la app arranca dos veces en la misma sesión. */
export function closeReconnectModal() {
  unsubscribe?.();
  unsubscribe = null;
  closeSheet?.();
  closeSheet = null;
}

/**
 * Abre el modal grande de reconexión. No bloquea la app: «Seguir por ahora»
 * lo cierra y el pastillero del enlace sigue avisando.
 * @returns {() => void} función de cierre
 */
export function openReconnectModal() {
  closeReconnectModal();
  if (!store.get().doc) return closeReconnectModal;
  const name = store.get().meta.connectedFileName ?? 'tu game-tracker.json';
  const handle = openSheet({
    title: 'Biblioteca cargada · Archivo no conectado',
    titleId: 'reconnect-title',
    role: 'alertdialog',
    closeAttr: 'data-dismiss-reconnect',
    backdropAttr: 'data-close-reconnect',
    layerClass: 'reconnect-layer',
    sheetClass: 'reconnect-sheet',
    onClose: closeReconnectModal,
    content: html`<p class="reconnect-lead">
        La biblioteca del espejo local se abrió bien, pero <b>no está conectada al
        archivo «${name}»</b>: mientras siga así, tus cambios <b>se guardan solo en este
        navegador</b> y el autoguardado no puede volcarlos.
      </p>
      <div class="reconnect-actions">
        <button type="button" class="btn-primary" data-reconnect-now>
          Reconectar mi archivo
        </button>
        <button type="button" class="chip" data-connect-other>Conectar otro .json…</button>
        <button type="button" class="chip danger" data-new-library>
          Empezar biblioteca nueva
        </button>
      </div>
      <p class="datos-hint">
        «Empezar biblioteca nueva» descarta la biblioteca actual del navegador y nace vacía;
        úsalo solo si quieres empezar de cero. Para conservar lo que hay sin reconectar,
        exporta una copia completa desde <b>Datos</b>.
      </p>
      <footer class="add-foot">
        <button type="button" class="chip" data-dismiss-reconnect>Seguir por ahora</button>
      </footer>`,
  });
  closeSheet = handle.close;
  wire(handle.layer);
  // Cierre automático en cuanto la sesión quede conectada de cualquier forma.
  unsubscribe = store.subscribe((state) => {
    if (state.file.status === 'connected') closeReconnectModal();
  });
  return closeReconnectModal;
}

/**
 * @param {HTMLElement} layerEl
 */
function wire(layerEl) {
  qs('[data-reconnect-now]', layerEl)?.addEventListener('click', () => {
    void reconnect();
  });
  qs('[data-connect-other]', layerEl)?.addEventListener('click', () => {
    void pickAndConnect();
  });
  qs('[data-new-library]', layerEl)?.addEventListener('click', () => {
    void newLibrary(new Date()).then(() => closeReconnectModal());
  });
  // «Seguir por ahora» del pie; el ✕ de cabecera y el fondo los cierra el
  // módulo (data-dismiss-reconnect del ✕ es solo compatibilidad con tests).
  qs('.add-foot [data-dismiss-reconnect]', layerEl)?.addEventListener(
    'click',
    closeReconnectModal
  );
}

/** Limpieza total para pruebas. */
export function resetReconnectModal() {
  closeReconnectModal();
}