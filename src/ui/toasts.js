/**
 * Avisos PWA (ticket 25, spec §11): toasts fijos en la parte inferior.
 * «Nueva versión disponible» persiste hasta que el usuario recarga;
 * «sin conexión» es discreto y se autodescarta. Un solo toast visible:
 * el de update nunca es reemplazado por el offline.
 */

/** @type {HTMLElement | null} */
let host = null;

/** @type {ReturnType<typeof setTimeout> | undefined} */
let dismissTimer = undefined;

function mount() {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return /** @type {HTMLElement} */ (host);
}

function hide() {
  clearTimeout(dismissTimer);
  dismissTimer = undefined;
  host?.replaceChildren();
}

/**
 * @param {'update' | 'offline'} kind
 * @param {string} message
 * @param {{ action?: { label: string, onClick: () => void }, timeoutMs?: number }} [opts]
 */
function showToast(kind, message, opts = {}) {
  if (kind === 'offline' && mount().querySelector('[data-toast="update"]')) return;
  hide();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.toast = kind;
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  if (opts.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = opts.action.label;
    button.addEventListener('click', () => {
      const onClick = opts.action?.onClick;
      hide();
      onClick?.();
    });
    toast.appendChild(button);
  }
  if (typeof opts.timeoutMs === 'number') {
    dismissTimer = setTimeout(hide, opts.timeoutMs);
  }
  mount().appendChild(toast);
}

/**
 * Aviso persistente de nueva versión; Recargar aplica la espera del nuevo SW.
 * @param {() => void} onReload
 */
export function showUpdateToast(onReload) {
  showToast('update', 'Nueva versión disponible', { action: { label: 'Recargar', onClick: onReload } });
}

/** Aviso discreto de app lista para offline; se autodescarta a los ~4 s. */
export function showOfflineToast() {
  showToast('offline', 'La app ya funciona sin conexión', { timeoutMs: 4000 });
}

/** Limpia toasts y timers (aislación en pruebas). */
export function resetToasts() {
  host?.remove();
  host = null;
  clearTimeout(dismissTimer);
  dismissTimer = undefined;
}
