import { describe, expect, it } from 'vitest';
import { admit, withAllowedOrigin } from '../worker/admit.js';
import worker from '../worker/worker.js';

const APP = 'https://mi-usuario.github.io';
const OTHER = 'https://otra.pages.dev';
const ENV = { ALLOWED_ORIGINS: `${APP}, ${OTHER}/` };

/**
 * Stub estructural de Request: admit() solo lee url, method y headers.get('Origin').
 * @param {string} url
 * @param {{ origin?: string | null, method?: string }} [opts]
 * @returns {{ url: string, method: string, headers: { get(name: string): string | null } }}
 */
function req(url, opts = {}) {
  const { origin, method = 'GET' } = opts;
  return {
    url,
    method,
    headers: {
      get: (name) => (name.toLowerCase() === 'origin' ? (origin ?? null) : null),
    },
  };
}

const searchUrl = 'https://proxy.workers.dev/api/search?q=celeste';
const novedadesUrl = 'https://proxy.workers.dev/api/novedades';
const healthUrl = 'https://proxy.workers.dev/api/health';

describe('admit', () => {
  it('admite el origen configurado exacto', () => {
    expect(admit(req(searchUrl, { origin: APP }), ENV)).toBeNull();
  });

  it('normaliza espacios y barra final en ambos lados y no distingue mayúsculas', () => {
    expect(admit(req(searchUrl, { origin: `${OTHER}/` }), ENV)).toBeNull();
    expect(admit(req(searchUrl, { origin: APP }), { ALLOWED_ORIGINS: ` ${APP.toUpperCase()} ` })).toBeNull();
  });

  it('rechaza sin cabecera Origin (curl, scripts, barra del navegador)', async () => {
    const res = await admit(req(searchUrl), ENV);
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: 'Origen no autorizado.' });
  });

  it('rechaza orígenes ajenos con el mismo 403 uniforme', async () => {
    for (const origin of ['https://evil.com', 'http://mi-usuario.github.io']) {
      const res = await admit(req(novedadesUrl, { origin }), ENV);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: 'Origen no autorizado.' });
    }
  });

  it('no confunde prefijos, subdominios ni puertos', () => {
    /** @type {(origin: string) => { ALLOWED_ORIGINS?: string }} */
    const singles = (origin) => ({ ALLOWED_ORIGINS: origin });
    expect(admit(req('https://x.io/', { origin: 'https://app.io.evil.com' }), singles('https://app.io'))?.status).toBe(403);
    expect(admit(req('https://x.io/', { origin: 'https://app.io.evil.com' }), singles('app.io'))?.status).toBe(403);
    expect(admit(req('https://x.io/', { origin: 'https://app.io:8443' }), singles('https://app.io'))?.status).toBe(403);
  });

  it('falla cerrado si la secret falta o queda vacía', () => {
    for (const env of [{}, undefined, { ALLOWED_ORIGINS: '' }, { ALLOWED_ORIGINS: '  ,  ' }]) {
      expect(admit(req(searchUrl, { origin: APP }), env)?.status).toBe(403);
    }
  });

  it('exime /api/health incluso sin secret ni Origin', () => {
    expect(admit(req(healthUrl), {})).toBeNull();
    expect(admit(req(healthUrl), undefined)).toBeNull();
  });

  it('preflight desde origen válido: 204 con eco del origen', () => {
    const res = admit(req(searchUrl, { origin: APP, method: 'OPTIONS' }), ENV);
    expect(res?.status).toBe(204);
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(res?.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(Number(res?.headers.get('Access-Control-Max-Age'))).toBeGreaterThan(0);
  });

  it('preflight desde origen ajeno: el mismo 403', async () => {
    const res = admit(req(searchUrl, { origin: 'https://evil.com', method: 'OPTIONS' }), ENV);
    expect(res?.status).toBe(403);
  });
});

describe('withAllowedOrigin', () => {
  it('añade eco del Origin y Vary a la respuesta de salida', () => {
    const base = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    const stamped = withAllowedOrigin(req(novedadesUrl, { origin: APP }), base);
    expect(stamped.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(stamped.headers.get('Vary')).toContain('Origin');
    expect(stamped.status).toBe(200);
  });

  it('sin Origin devuelve la respuesta intacta', () => {
    const base = new Response('{}');
    expect(withAllowedOrigin(req(novedadesUrl), base)).toBe(base);
  });
});

describe('fetch del worker (humo integral)', () => {
  it('rechaza antes de tocar IGDB ni secretos: 403 aunque no haya nada configurado', async () => {
    const res = await worker.fetch(req(novedadesUrl), {});
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Origen no autorizado.' });
  });

  it('un origen válido atraviesa la puerta: search llega hasta assertConfigured y da 500 not-configured', async () => {
    const res = await worker.fetch(req(searchUrl, { origin: APP }), { ALLOWED_ORIGINS: APP });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('Worker not configured'),
    });
  });

  it('health sigue viva sin secret ni Origin y hace eco neutro del Origin', async () => {
    const ok = await worker.fetch(req(healthUrl), {});
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ ok: true });

    const stamped = await worker.fetch(req(healthUrl, { origin: 'https://random.site' }), {});
    expect(stamped.headers.get('Access-Control-Allow-Origin')).toBe('https://random.site');
  });

  it('OPTIONS desde origen válido responde preflight con eco; método POST válido pasa la puerta y cae en 404 de router', async () => {
    const pre = await worker.fetch(req(searchUrl, { origin: APP, method: 'OPTIONS' }), ENV);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(APP);

    const post = await worker.fetch(req(searchUrl, { origin: APP, method: 'POST' }), ENV);
    expect(post.status).toBe(404);
  });

  it('las respuestas de error internas llevan el eco del origen admitido', async () => {
    const res = await worker.fetch(req(searchUrl, { origin: APP }), { ALLOWED_ORIGINS: APP });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP);
  });
});
