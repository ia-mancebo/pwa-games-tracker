import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounce } from './debounce.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('ejecuta una sola vez tras 150 ms pese a 5 llamadas rápidas', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 150);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('pasa los argumentos de la última llamada', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b', 2);
    debounced('c');
    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('relanza el reloj con cada llamada nueva (trailing real)', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 150);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
