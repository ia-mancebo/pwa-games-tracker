import { describe, expect, it } from 'vitest';
import { formatAvg, formatClock, formatRoundedHours } from './format.js';

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

describe('formatClock', () => {
  it('H:MM:SS con horas sin rellenar', () => {
    expect(formatClock(3903)).toBe('1:05:03');
  });

  it('cero muestra 0:00:00 para el contador en vivo', () => {
    expect(formatClock(0)).toBe('0:00:00');
  });

  it('minutos y segundos siempre dos dígitos', () => {
    expect(formatClock(59)).toBe('0:00:59');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('no enteros se redondean hacia abajo', () => {
    expect(formatClock(3903.9)).toBe('1:05:03');
    expect(formatClock(0.9)).toBe('0:00:00');
  });

  it('negativos se tratan como 0', () => {
    expect(formatClock(-1)).toBe('0:00:00');
    expect(formatClock(-3903)).toBe('0:00:00');
  });
});

describe('formatRoundedHours', () => {
  it('horas y minutos', () => {
    expect(formatRoundedHours(45258)).toBe('12 h 34 min');
  });

  it('solo minutos', () => {
    expect(formatRoundedHours(300)).toBe('5 min');
    expect(formatRoundedHours(120)).toBe('2 min');
  });

  it('hora exacta sin minutos', () => {
    expect(formatRoundedHours(3600)).toBe('1 h');
    expect(formatRoundedHours(3599)).toBe('1 h');
  });

  it('menos de un minuto redondea a 0 min', () => {
    expect(formatRoundedHours(29)).toBe('0 min');
    expect(formatRoundedHours(0)).toBe('0 min');
  });

  it('segundos sueltos redondean al minuto', () => {
    expect(formatRoundedHours(30)).toBe('1 min');
    expect(formatRoundedHours(59)).toBe('1 min');
    expect(formatRoundedHours(3660)).toBe('1 h 1 min');
  });

  it('undefined/null → guión', () => {
    expect(formatRoundedHours(undefined)).toBe('—');
    expect(formatRoundedHours(null)).toBe('—');
  });

  it('no enteros se redondean hacia abajo', () => {
    expect(formatRoundedHours(3661.9)).toBe('1 h 1 min');
    expect(formatRoundedHours(29.9)).toBe('0 min');
  });

  it('negativos se tratan como 0', () => {
    expect(formatRoundedHours(-1)).toBe('0 min');
    expect(formatRoundedHours(-45258)).toBe('0 min');
  });
});
