import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { createApp, store } from './app.js';
import { initLibrary } from './data/library.js';
import { startAutosave } from './data/filelink.js';
import { requestPersistOnce } from './data/persist.js';
import { acquireTabLock, onLockReleased } from './data/tablock.js';
import { initCoverSeeding } from './data/covers.js';
import { initNovedadesRetry } from './data/novedades.js';
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
