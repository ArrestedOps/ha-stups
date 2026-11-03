import { describe, expect, it } from 'vitest';
import { avatarUrl, squareCrop } from '../src/lib/avatar';

describe('avatarUrl', () => {
  it('null ohne Bild, sonst die Adresse mit der Fassung', () => {
    expect(avatarUrl({ id: 'u1', avatarRev: null })).toBeNull();
    expect(avatarUrl({ id: 'u1' })).toBeNull();
    expect(avatarUrl({ avatarRev: 3 })).toBeNull();
    expect(avatarUrl({ id: 'u1', avatarRev: 3 })).toBe('api/people/u1/avatar?rev=3');
  });
});

describe('squareCrop', () => {
  it('schneidet das Quadrat aus der Mitte', () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
    expect(squareCrop(300, 400)).toEqual({ sx: 0, sy: 50, size: 300 });
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
  });
});
