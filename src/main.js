import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { createApp, store } from './app.js';
import { initLibrary } from './data/library.js';
import { startAutosave } from './data/filelink.js';
import { acquireTabLock, onLockReleased } from './data/tablock.js';
import { initCoverSeeding } from './data/covers.js';

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
    // Autoguardado + chequeos de foco/visibilidad (ticket 18).
    startAutosave();
  } catch {
    // Sin autoguardado la app sigue operativa; el vuelco manual persiste.
  }
}
