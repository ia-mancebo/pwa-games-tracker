import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showOfflineToast, showUpdateToast, resetToasts } from '../src/ui/toasts.js';
import config, { pwaOptions } from '../vite.config.js';

describe('toasts PWA', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToasts();
  });

  afterEach(() => {
    resetToasts();
    vi.useRealTimers();
  });

  /** @returns {HTMLElement | null} */
  function toast() {
    return document.querySelector('.toast');
  }

  it('el aviso offline aparece y se autodescarta a los ~4 s', () => {
    showOfflineToast();

    expect(toast()?.textContent).toBe('La app ya funciona sin conexión');
    expect(document.querySelector('[data-toast="offline"]')).not.toBeNull();

    vi.advanceTimersByTime(4000);
    expect(toast()).toBeNull();
  });

  it('el contenedor de toasts es aria-live polite', () => {
    showOfflineToast();
    expect(document.querySelector('.toasts')?.getAttribute('aria-live')).toBe('polite');
  });

  it('el aviso de update persiste y Recargar llama al callback inyectado', () => {
    const onReload = vi.fn();
    showUpdateToast(onReload);

    const el = toast();
    expect(el?.textContent).toContain('Nueva versión disponible');

    vi.advanceTimersByTime(60_000);
    expect(toast()).not.toBeNull();

    /** @type {HTMLButtonElement} */ (document.querySelector('.toast button'))?.click();

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(toast()).toBeNull();
  });

  it('el aviso offline no reemplaza a uno de update ya visible', () => {
    showUpdateToast(vi.fn());
    showOfflineToast();

    expect(document.querySelector('[data-toast="update"]')).not.toBeNull();
    expect(document.querySelector('[data-toast="offline"]')).toBeNull();
  });
});

describe('configuración PWA del build (vite.config)', () => {
  it('expone pwaOptions con la forma esperada', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.injectRegister).toBeNull();
    expect(pwaOptions.devOptions?.enabled).toBe(false);
    expect(pwaOptions.includeAssets).toEqual(['favicon-64.png', 'robots.txt']);
  });

  it('el manifest cumple §10: identidad, colores e iconos maskable separados', () => {
    const manifest = /** @type {Record<string, any>} */ (pwaOptions.manifest ?? {});
    expect(manifest.name).toBe('Game Tracker');
    expect(manifest.short_name).toBe('GameTracker');
    expect(manifest.lang).toBe('es');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#151210');
    expect(manifest.background_color).toBe('#151210');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.description?.length).toBeGreaterThan(0);

    const icons = /** @type {any[]} */ (manifest.icons ?? []);
    expect(icons).toHaveLength(4);
    const purposes = icons.map((icon) => icon.purpose ?? 'any');
    expect(purposes).toEqual(['any', 'any', 'maskable', 'maskable']);
    for (const icon of icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true);
      expect(icon.type).toBe('image/png');
    }
    expect(icons.map((icon) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '192x192',
      '512x512',
    ]);
    expect(icons[2]?.src).toBe('/icons/icon-maskable-192.png');
    expect(icons[3]?.src).toBe('/icons/icon-maskable-512.png');
  });

  it('workbox precachea woff2 con límite 2 MiB, navigateFallback y cleanupOutdatedCaches', () => {
    const workbox = /** @type {Record<string, any>} */ (pwaOptions.workbox ?? {});
    expect(workbox.globPatterns).toEqual([
      '**/*.{js,css,html,svg,png,ico,webmanifest,woff2}',
    ]);
    expect(workbox.globPatterns.join(',')).toContain('woff2');
    expect(workbox.maximumFileSizeToCacheInBytes).toBe(2 * 1024 * 1024);
    expect(workbox.navigateFallback).toBe('index.html');
    expect(workbox.cleanupOutdatedCaches).toBe(true);
  });

  it('la ruta runtime de carátulas escribe covers-v1 solo para images.igdb.com', () => {
    const workbox = /** @type {Record<string, any>} */ (pwaOptions.workbox ?? {});
    const runtimeCaching = workbox.runtimeCaching ?? [];
    expect(runtimeCaching).toHaveLength(1);

    const route = runtimeCaching[0];
    expect(route.handler).toBe('StaleWhileRevalidate');
    expect(route.options.cacheName).toBe('covers-v1');
    expect(route.options.cacheableResponse).toEqual({ statuses: [0, 200] });
    expect(route.options.expiration.maxEntries).toBe(500);
    expect(route.options.expiration.maxAgeSeconds).toBe(365 * 24 * 3600);

    const pattern = route.urlPattern;
    expect(pattern).toBeInstanceOf(RegExp);
    expect(
      pattern.test('https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg'),
    ).toBe(true);
    expect(pattern.test('https://evil.example.com/a.jpg')).toBe(false);
    expect(pattern.test('https://api.igdb.com/v4/games')).toBe(false);
  });

  it('defineConfig mantiene el build previo y monta el plugin PWA', async () => {
    const viteConfig = await Promise.resolve(config);
    expect(viteConfig.build?.target).toBe('es2022');
    expect(Array.isArray(viteConfig.plugins)).toBe(true);
    expect(viteConfig.plugins).toHaveLength(1);
  });
});
