import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { createApp } from './app.js';

const root = document.querySelector('#app');
if (root) createApp(/** @type {HTMLElement} */ (root));
