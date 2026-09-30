import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeTick } from './tick.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeTick', () => {
  it('suscribir llama al instante y luego cada segundo, con el reloj actual', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'));
    /** @type {string[]} */
    const seen = [];
    const off = subscribeTick((now) => seen.push(now.toISOString()));
    expect(seen).toEqual(['2026-08-24T10:00:00.000Z']);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual(['2026-08-24T10:00:00.000Z', '2026-08-24T10:00:01.000Z']);
    vi.advanceTimersByTime(2000);
    expect(seen).toHaveLength(4);
    off();
  });

  it('todos los suscriptores comparten un solo intervalo que muere con el último', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeTick(a);
    const offB = subscribeTick(b);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);

    offA();
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);

    offB();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
  });
});
