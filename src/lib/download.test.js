import { describe, expect, it, vi } from 'vitest';
import { downloadTextBlob } from './download.js';

describe('downloadTextBlob', () => {
  it('crea un <a> con URL de blob, el nombre dado y lo clica', () => {
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    const createdBlobs = /** @type {Blob[]} */ ([]);
    urlApi.createObjectURL = (/** @type {Blob} */ blob) => {
      createdBlobs.push(blob);
      return 'blob:test-url';
    };
    urlApi.revokeObjectURL = () => {};
    const anchors = /** @type {HTMLElement[]} */ ([]);
    const originalAppend = document.body.appendChild.bind(document.body);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLElement && el.tagName === 'A') anchors.push(el);
      return originalAppend(el);
    });
    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    try {
      downloadTextBlob('{"a":1}', 'copia.json');

      expect(createdBlobs).toHaveLength(1);
      expect(createdBlobs[0]).toBeInstanceOf(Blob);
      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute('href')).toBe('blob:test-url');
      expect(anchors[0].getAttribute('download')).toBe('copia.json');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(anchors[0].isConnected).toBe(false);
    } finally {
      appendSpy.mockRestore();
      clickSpy.mockRestore();
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });

  it('libera la URL del blob al terminar el turno', async () => {
    const urlApi = /** @type {any} */ (globalThis.URL);
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    urlApi.createObjectURL = () => 'blob:test-url';
    const revoke = vi.fn();
    urlApi.revokeObjectURL = revoke;
    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    try {
      downloadTextBlob('x', 'a.json');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(revoke).toHaveBeenCalledWith('blob:test-url');
    } finally {
      clickSpy.mockRestore();
      if (prevCreate) urlApi.createObjectURL = prevCreate;
      else delete urlApi.createObjectURL;
      if (prevRevoke) urlApi.revokeObjectURL = prevRevoke;
      else delete urlApi.revokeObjectURL;
    }
  });
});