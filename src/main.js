import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { createApp } from './app.js';
import { initLibrary } from './data/library.js';

const root = document.querySelector('#app');
if (root) {
  try {
    await initLibrary();
  } catch {
    // Sin espejo accesible: la app arranca igual; el bienvenida (ticket 13) toma el control.
  }
  createApp(/** @type {HTMLElement} */ (root));
}
