import { describe, expect, it } from 'vitest';
import { formatAvg } from './format.js';

describe('formatAvg', () => {
  it('guión si no hay dato', () => {
    expect(formatAvg(null)).toBe('—');
  });

  it('enteros sin decimales', () => {
    expect(formatAvg(4)).toBe('4');
  });

  it('un decimal con coma', () => {
    expect(formatAvg(4.5)).toBe('4,5');
  });

  it('redondeo a un decimal con coma', () => {
    expect(formatAvg(3.6666)).toBe('3,7');
    expect(formatAvg(4.25)).toBe('4,3');
  });
});
