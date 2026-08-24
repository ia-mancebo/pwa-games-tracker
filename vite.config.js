import { defineConfig } from 'vite';

// vite-plugin-pwa (manifest + generateSW) lands in ticket 25.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
