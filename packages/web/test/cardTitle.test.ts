import { describe, expect, it } from 'vitest';
import { cardTitleWithEntity } from '../src/lib/cardTitle';

// Gegenstück zu den Tests von cardTitleOf im Server (watcher-names-cleanup.test.ts): gleiche Regeln
describe('Titel der Karte mit dem Namen der Entität (Vorschau im Editor)', () => {
  it('hängt den Namen an', () => {
    expect(cardTitleWithEntity('Batterie wechseln', 'below', 'Nuki Türschloss')).toBe('Batterie wechseln: Nuki Türschloss');
    expect(cardTitleWithEntity(' Batterie wechseln ', 'state', 'sensor.nuki')).toBe('Batterie wechseln: sensor.nuki');
  });
  it('nichts Doppeltes', () => {
    expect(cardTitleWithEntity('Nuki Türschloss: Batterie wechseln', 'below', 'Nuki Türschloss')).toBe('Nuki Türschloss: Batterie wechseln');
    expect(cardTitleWithEntity('Batterie nuki wechseln', 'below', 'Nuki')).toBe('Batterie nuki wechseln');
    expect(cardTitleWithEntity(cardTitleWithEntity('Batterie wechseln', 'below', 'Nuki'), 'below', 'Nuki')).toBe('Batterie wechseln: Nuki');
  });
  it('Kalender, Vorhersage und fehlender Name: nichts anhängen', () => {
    expect(cardTitleWithEntity('Müll', 'calendar_event', 'Abfall')).toBe('Müll');
    expect(cardTitleWithEntity('Wäsche', 'forecast', 'Wetter')).toBe('Wäsche');
    expect(cardTitleWithEntity('Titel', 'below', ' ')).toBe('Titel');
    expect(cardTitleWithEntity('', 'below', 'Nuki')).toBe('');
  });
  it('zu lang: der Name wird gekürzt, nie der Titel', () => {
    const out = cardTitleWithEntity('Batterie wechseln', 'below', 'Ein ziemlich langer Name eines Geräts im Obergeschoss', 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.startsWith('Batterie wechseln: ')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(cardTitleWithEntity('Ein ziemlich langer Titel einer Karte', 'below', 'Flur', 40)).toBe('Ein ziemlich langer Titel einer Karte');
  });
});
