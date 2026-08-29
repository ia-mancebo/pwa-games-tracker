/**
 * Composition root (ADR-0010): el arranque deja de ser un efecto de import.
 * `start(root)` posee los diez pasos del arranque en orden, con los mismos
 * try/catch y comentarios que el main.js tribal que sustituye; los módulos ya
 * no se auto-registran al importarse (sheet.js, conflictDialog.js) y el boot
 * los cablea explícitamente en el orden correcto. `resetBoot()` es el teardown
 * único para tests: compone los resets de los módulos con estado que el
 * arranque cablea.
 */
import { createApp, store } from './app.js';
import { initLibrary } from './data/library.js';
import {
  restoreSavedLink,
  setConflictHandler,
  startAutosave,
  resetFilelink,
} from './data/filelink.js';
import { requestPersistOnce } from './data/persist.js';
import { acquireTabLock, onLockReleased, resetTablock } from './data/tablock.js';
import { initCoverSeeding, resetCoverSeeding } from './data/covers.js';
import { initNovedadesRetry, resetNovedadesRefresh } from './data/novedades.js';
import { hasFsa } from './services/fsa.js';
import { openReconnectModal, resetReconnectModal } from './ui/reconnectModal.js';
import { openConflict, initConflictDialog, resetConflictDialog } from './ui/conflictDialog.js';
import { initSheet, resetSheet } from './ui/sheet.js';
import { resetBackNav } from './backnav.js';
import { registerSW } from 'virtual:pwa-register';
import { showOfflineToast, showUpdateToast } from './ui/toasts.js';

/**
 * Arranca la app: los diez pasos del arranque en orden. Sin `stop()` ni
 * soporte de arranques repetidos: el coste (SW, IDB, Web Locks, listeners) no
 * paga su benefit (ADR-0010).
 * @param {HTMLElement | null} root
 */
export async function start(root) {
  if (root) {
    // El closer de la hoja se registra ANTES de createApp: el popstate del
    // historial (installBackNav) ya puede consultarlo desde la primera
    // entrada; sin esto, el botón atrás del móvil no cerraría la hoja.
    initSheet();
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
    initConflictDialog();
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
}

/**
 * Teardown único para tests: compone los resets de los módulos con estado que
 * el arranque cablea. Las suites de módulo aislado siguen usando sus resets
 * propios; este es el seam del arranque completo.
 */
export function resetBoot() {
  resetFilelink();
  resetConflictDialog();
  resetSheet();
  resetBackNav();
  resetCoverSeeding();
  resetTablock();
  resetNovedadesRefresh();
  resetReconnectModal();
}