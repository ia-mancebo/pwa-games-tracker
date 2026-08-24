import * as library from './library.js';
import * as novedades from './novedades.js';
import * as stats from './stats.js';

/**
 * Vista registrada para una pestaña.
 * @typedef {{ render: (container: Element, store: import('../app.js').Store) => void }} View
 */

/** @type {Record<string, View>} */
export const views = {
  biblioteca: library,
  novedades,
  estadisticas: stats,
};
