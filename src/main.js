import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { createApp, store } from './app.js';
import { initLibrary } from './data/library.js';
import { restoreSavedLink, setConflictHandler, startAutosave } from './data/filelink.js';
import { requestPersistOnce } from './data/persist.js';
import { acquireTabLock, onLockReleased } from './data/tablock.js';
import { initCoverSeeding } from './data/covers.js';
import { initNovedadesRetry } from './data/novedades.js';
import { hasFsa } from './services/fsa.js';
import { openReconnectModal } from './ui/reconnectModal.js';
import { openConflict } from './ui/conflictDialog.js';
import { registerSW } from 'virtual:pwa-register';
import { showOfflineToast, showUpdateToast } from './ui/toasts.js';

const root = document.querySelector('#app');
if (root) {
  try {
    await initLibrary();
  } catch {
    // Sin espejo accesible: la app arranca igual; el bienvenida (ticket 13) toma el control.
  }
  createApp(/** @type {HTMLElement} */ (root));
  // El diálogo de conflicto es render del estado (ADR-0004): el registro del
  // handler es explícito en el arranque, antes de cualquier reconexión que
  // pueda elevarlo; los conflictos en segundo plano (foco, ocultar pestaña,
  // autoguardado) abren el diálogo vía el slice `file.conflict`.
  setConflictHandler(() => openConflict());
  try {
    // Siembra offline de carátulas (ticket 22): observador fire-and-forget,
    // nunca bloquea el arranque ni la UI.
    initCoverSeeding();
  } catch {
    // Sin Cache Storage la app funciona igual; las carátulas quedan solo online.
  }
  try {
    // Segunda pestaña en solo lectura (ticket 19): sin lock, entra como
    // secundaria y se promociona sola cuando el lock quede libre.
    const primary = await acquireTabLock();
    if (!primary) {
      store.set({ tabRole: 'secondary' });
      void onLockReleased(() => {
        store.set({ tabRole: 'primary' });
      });
    }
  } catch {
    // Sin Web Locks la app funciona como pestaña única.
  }
  try {
    // Reintento silencioso de Novedades al volver la red (ticket 23, spec §7.3).
    initNovedadesRetry();
  } catch {
    // Sin listeners de red el refresco queda manual.
  }
  try {
    // Reconexión silenciosa del enlace al .json (autoguardado entre sesiones):
    // handle guardado en IDB + permiso vigente ⇒ conecta y vuelca pendientes
    // sin pedir nada. Con permiso caducado o sin enlace guardado, el modal
    // grande avisa: sin archivo conectado los cambios viven solo aquí.
    const restored = await restoreSavedLink();
    if (
      (restored === 'needs-gesture' || (restored === 'none' && hasFsa())) &&
      store.get().doc &&
      store.get().tabRole === 'primary'
    ) {
      openReconnectModal();
    }
  } catch {
    // El arranque nunca depende de la reconexión; la pastilla del enlace
    // informa y «Datos» permite conectar o exportar a mano.
  }
  try {
    // Autoguardado + chequeos de foco/visibilidad (ticket 18).
    startAutosave();
  } catch {
    // Sin autoguardado la app sigue operativa; el vuelco manual persiste.
  }
  if (store.get().doc) {
    // Con biblioteca en el espejo se pide persistencia UNA vez (ticket 19):
    // también sin FSA, para que el navegador no pudiera limpiar los datos.
    void requestPersistOnce();
  }
}

// Service worker (ticket 25, spec §11): prompt explícito; la recarga solo
// ocurre tras pulsar Recargar, para no perder texto en edición.
const updateSW = registerSW({
  onNeedRefresh() {
    showUpdateToast(() => void updateSW(true));
  },
  onOfflineReady() {
    showOfflineToast();
  },
  onRegisteredSW() {},
  onRegisterError() {},
});
