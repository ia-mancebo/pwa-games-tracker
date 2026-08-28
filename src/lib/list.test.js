import { describe, expect, it } from 'vitest';
import { splitCommaList } from './list.js';

describe('splitCommaList', () => {
  it('separa por comas y recorta', () => {
    expect(splitCommaList('rol, difícil, prestado')).toEqual(['rol', 'difícil', 'prestado']);
    expect(splitCommaList('  a  ,b')).toEqual(['a', 'b']);
  });

  it('descarta vacíos', () => {
    expect(splitCommaList('a,,b,')).toEqual(['a', 'b']);
    expect(splitCommaList(' , a, ')).toEqual(['a']);
  });

  it('cadena vacía o solo comas da lista vacía', () => {
    expect(splitCommaList('')).toEqual([]);
    expect(splitCommaList(',,')).toEqual([]);
  });
});