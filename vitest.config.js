import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      // El plugin PWA no corre en tests: el import de src/boot.js se resuelve
      // contra un stub (la suite de boot lo sustituye con vi.mock).
      'virtual:pwa-register': fileURLToPath(
        new URL('./tests/support/virtual-pwa-register.js', import.meta.url),
      ),
    },
  },
});