import { describe, expect, it } from 'vitest';
import { circleOf, orderView } from '../src/assignment-order.js';

const people = [{ id: 'conny' }, { id: 'ben' }, { id: 'rene' }];
const present = new Map<string, boolean | null>([['conny', true], ['ben', true], ['rene', false]]);

describe('Kreis', () => {
  it('die gewählten Personen in dieser Reihenfolge, ohne Unbekannte; leer = alle', () => {
    expect(circleOf({ personIds: ['rene', 'conny'] }, people)).toEqual(['rene', 'conny']);
    expect(circleOf({ personIds: ['rene', 'gibt-es-nicht'] }, people)).toEqual(['rene']);
    expect(circleOf({ personIds: [] }, people)).toEqual(['conny', 'ben', 'rene']);
  });
});

describe('Reihenfolge für die Oberfläche', () => {
  it('reihum: wer als Nächstes dran ist, steht vorn, die anderen folgen im Kreis', () => {
    const v = orderView({ rule: { mode: 'rotation_present', personIds: [] }, people, present, nextId: 'ben' });
    expect(v.circle.map((e) => e.id)).toEqual(['ben', 'rene', 'conny']);
    expect(v.circle.map((e) => e.next)).toEqual([true, false, false]);
    expect(v.circle.map((e) => e.present)).toEqual([true, false, true]);
    expect(v.ordered).toBe(true);
    expect(v.home).toBe(2);
  });

  it('ist niemand als Nächstes bestimmt, bleibt die Reihenfolge des Kreises und keiner ist markiert', () => {
    const v = orderView({ rule: { mode: 'rotation', personIds: ['rene', 'conny'] }, people, present, nextId: null });
    expect(v.circle.map((e) => e.id)).toEqual(['rene', 'conny']);
    expect(v.circle.some((e) => e.next)).toBe(false);
  });

  it('ohne Reihenfolge (alle, wer zuerst heimkommt, fest, niemand): kein Pfeil, keine Markierung', () => {
    for (const mode of ['all_present', 'first_home', 'fixed', 'suggest', 'none'] as const) {
      const v = orderView({ rule: { mode, personIds: [] }, people, present, nextId: 'ben' });
      expect(v.ordered).toBe(false);
      expect(v.circle.map((e) => e.id)).toEqual(['conny', 'ben', 'rene']);
      expect(v.circle.some((e) => e.next)).toBe(false);
    }
  });

  it('nicht zu erkennende Anwesenheit: present = null und home = null', () => {
    const v = orderView({ rule: { mode: 'rotation_present', personIds: [] }, people, present: new Map(), nextId: 'conny' });
    expect(v.circle.every((e) => e.present === null)).toBe(true);
    expect(v.home).toBeNull();
  });

  it('wer nicht im Kreis ist, kann nicht „als Nächstes" dran sein', () => {
    const v = orderView({ rule: { mode: 'rotation', personIds: ['conny'] }, people, present, nextId: 'ben' });
    expect(v.circle).toEqual([{ id: 'conny', present: true, next: false }]);
  });
});
