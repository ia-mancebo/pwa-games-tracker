/**
 * Stub de `virtual:pwa-register` para vitest: el plugin PWA no corre en el
 * entorno de tests y el import de src/boot.js necesita resolverse (alias en
 * vitest.config.js). La suite de boot lo sustituye con vi.mock en runtime.
 */
export function registerSW() {
  return () => {};
}