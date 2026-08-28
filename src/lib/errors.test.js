import { describe, expect, it } from 'vitest';
import { formatError, isAbortError } from './errors.js';

describe('formatError', () => {
  it('mensaje de un Error', () => {
    expect(formatError(new Error('algo salió mal'))).toBe('algo salió mal');
  });

  it('no-Error se vuelve String', () => {
    expect(formatError('texto plano')).toBe('texto plano');
    expect(formatError(42)).toBe('42');
    expect(formatError(null)).toBe('null');
  });
});

describe('isAbortError', () => {
  it('true para AbortError', () => {
    const err = new Error('cancelado');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('false para otros errores y no-Error', () => {
    expect(isAbortError(new Error('otro'))).toBe(false);
    expect(isAbortError('cancelado')).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});