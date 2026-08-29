import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { start } from './boot.js';

const root = document.querySelector('#app');
await start(/** @type {HTMLElement | null} */ (root));