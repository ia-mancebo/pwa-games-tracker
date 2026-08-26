/**
 * Modal de arranque sin enlace de archivo: sin el .json conectado nada se
 * vuelca a él y los cambios viven solo en este navegador. Se abre UNA vez por
 * sesión desde main.js cuando hay biblioteca en el espejo pero el archivo no
 * está conectado, y ofrece reconectar (con gesto, para pedir permiso),
 * conectar otro .json, empezar biblioteca nueva o seguir por ahora.
 */
import { html, qs } from '../lib/dom.js';
import { store } from '../app.js';
import { newLibrary } from '../data/library.js';
import { pickAndConnect, reconnect } from '../data/filelink.js';

/** Capa abierta actualmente. @type {HTMLElement|null} */
let layer = null;

/** @type {(() => boolean)|null} */
let unsubscribe = null;

/** Evita apilar el modal si la app arranca dos veces en la misma sesión. */
export function closeReconnectModal() {
  unsubscribe?.();
  unsubscribe = null;
  layer?.remove();
  layer = null;
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
  layer = document.createElement('div');
  layer.className = 'add-layer fade reconnect-layer';
  document.body.appendChild(layer);
  layer.innerHTML = html`<div class="add-backdrop" data-close-reconnect></div>
    <section
      class="add-sheet reconnect-sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reconnect-title"
    >
      <header class="add-head">
        <h2 id="reconnect-title">Biblioteca cargada · Archivo no conectado</h2>
      </header>
      <p class="reconnect-lead">
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
      </footer>
    </section>`;
  wire();
  // Cierre automático en cuanto la sesión quede conectada de cualquier forma.
  unsubscribe = store.subscribe((state) => {
    if (state.file.status === 'connected') closeReconnectModal();
  });
  return closeReconnectModal;
}

function wire() {
  const layerNow = layer;
  if (!layerNow) return;
  qs('[data-close-reconnect]', layerNow)?.addEventListener('click', closeReconnectModal);
  qs('[data-dismiss-reconnect]', layerNow)?.addEventListener('click', closeReconnectModal);
  qs('[data-reconnect-now]', layerNow)?.addEventListener('click', () => {
    void reconnect();
  });
  qs('[data-connect-other]', layerNow)?.addEventListener('click', () => {
    void pickAndConnect();
  });
  qs('[data-new-library]', layerNow)?.addEventListener('click', () => {
    void newLibrary(new Date()).then(() => closeReconnectModal());
  });
}

/** Limpieza total para pruebas. */
export function resetReconnectModal() {
  closeReconnectModal();
}
