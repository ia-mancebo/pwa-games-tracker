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
  it('acepta H:MM:SS con dígitos sin relleno obligatorio', () => {
    expect(parseClock('12:34:00')).toBe(45240);
    expect(parseClock('0:05:30')).toBe(330);
    expect(parseClock('1:2:3')).toBe(3723);
    expect(parseClock('0:00:00')).toBe(0);
  });

  it('dos componentes son horas:minutos, nunca minutos:segundos (ADR-0012)', () => {
    expect(parseClock('1:30')).toBe(5400);
    expect(parseClock('0:05')).toBe(300);
  });

  it('un número suelto son segundos', () => {
    expect(parseClock('90')).toBe(90);
    expect(parseClock('0')).toBe(0);
    expect(parseClock('5')).toBe(5);
  });

  it('recorta los espacios exteriores', () => {
    expect(parseClock('  45  ')).toBe(45);
    expect(parseClock('5 ')).toBe(5);
    expect(parseClock(' 1:30 ')).toBe(5400);
  });

  it('rechaza vacío y solo espacios', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('   ')).toBeNull();
  });

  it('rechaza lo no numérico, negativos y decimales', () => {
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('-5')).toBeNull();
    expect(parseClock('1.5:00')).toBeNull();
    expect(parseClock('12:34:56:78')).toBeNull();
  });

  it('rechaza decimales sueltos con coma o punto', () => {
    expect(parseClock('1,5')).toBeNull();
    expect(parseClock('1.5')).toBeNull();
  });

  it('rechaza componentes vacíos: ni :30 ni 12:', () => {
    expect(parseClock(':30')).toBeNull();
    expect(parseClock('12:')).toBeNull();
  });

  it('solo dígitos puros por componente: sin espacios interiores, signos ni notación', () => {
    // Decisiones: los espacios se recortan solo en los extremos del texto, y un
    // número suelto son dígitos (ni '+5', ni '1e3', ni '0x10').
    expect(parseClock('1 : 30')).toBeNull();
    expect(parseClock('1: 30')).toBeNull();
    expect(parseClock('+5')).toBeNull();
    expect(parseClock('1e3')).toBeNull();
    expect(parseClock('0x10')).toBeNull();
  });

  it('sin tope de rango: minutos y segundos se suman tal cual', () => {
    // Decisión: no es un reloj de pared; 0:90 son 90 min y no se rechaza.
    expect(parseClock('0:90')).toBe(5400);
    expect(parseClock('1:00:90')).toBe(3690);
  });

  it('desbordes no enteros seguros se rechazan', () => {
    expect(parseClock('9'.repeat(300))).toBeNull();
  });
});
