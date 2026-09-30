import { describe, expect, it } from 'vitest';
import { formatAvg, formatClock, formatRoundedHours, parseClock } from './format.js';

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

describe('parseClock', () => {
  it('acepta H:MM:SS, H:MM, segundos sueltos y componentes ≥ 60 normalizados', () => {
    /** @type {[unknown, number|null][]} */
    const cases = [
      ['12:34:00', 45240],
      ['0:05:30', 330],
      ['1:2:3', 3723],
      ['90', 90],
      ['  1:30  ', 5400],
      ['1:30', 5400],
      ['0:00', 0],
      [' 90 ', 90],
      ['000:000:000', 0],
      ['1:90:00', 9000],
    ];
    for (const [input, expected] of cases) {
      expect(parseClock(input)).toBe(expected);
    }
  });

  it('rechaza entradas que no son un tiempo válido', () => {
    /** @type {unknown[]} */
    const cases = [
      '',
      '   ',
      'abc',
      'a:30',
      '1:a',
      '-5',
      '-1:00',
      '1:-2',
      '1.5:00',
      '0:5.5',
      '.5:00',
      '12:34:56:78',
      '1:',
      ':30',
      '1::30',
      null,
      undefined,
      90,
      '1 30',
    ];
    for (const input of cases) {
      expect(parseClock(input)).toBeNull();
    }
  });
});
