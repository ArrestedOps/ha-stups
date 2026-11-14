import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { applyBulkPatch, commonFamily, parseBulkPatch } from '../src/watcher-bulk.js';
import type { WatchTrigger, WatcherConfig } from '../src/watcher-types.js';

const trigger = (extra: Partial<WatchTrigger> = {}): WatchTrigger => ({ entityId: 'sensor.knopf_batterie', kind: 'below', to: null, value: 20, forMin: 10, count: 1, ...extra });
const config = (extra: Partial<WatcherConfig> = {}): WatcherConfig => ({
  name: 'Batterie schwach',
  active: true,
  trigger: trigger(),
  card: { boardId: 'b1', columnId: 'c1', title: 'Batterie wechseln: Knopf', description: 'Neue Zellen im Schrank', categoryIds: [], priority: null, due: { kind: 'none' }, icon: 'battery' },
  assign: { mode: 'rotation_present', personIds: [], fallback: 'next', waitFallback: 'none', fallbackPersonId: null },
  done: { entityId: 'sensor.knopf_batterie', kind: 'above', to: null, value: 50 },
  cooldownMin: 10,
  dedupe: true,
  nudge: null,
  category: null,
  countsForFairness: true,
  ...extra,
});

describe('applyBulkPatch', () => {
  it('Board und Spalte ändern, Titel, Beschreibung und Symbol der Karte bleiben', () => {
    const out = applyBulkPatch(config(), { card: { boardId: 'b2', columnId: 'c2' } });
    expect(out.card).toMatchObject({ boardId: 'b2', columnId: 'c2', title: 'Batterie wechseln: Knopf', description: 'Neue Zellen im Schrank', icon: 'battery' });
  });

  it('die Schwelle ändert den Wert, die Entität bleibt', () => {
    const out = applyBulkPatch(config(), { trigger: { value: 15 } });
    expect(out.trigger).toMatchObject({ value: 15, entityId: 'sensor.knopf_batterie', forMin: 10 });
  });

  it('verändert die Eingabe nicht', () => {
    const c = config();
    applyBulkPatch(c, { trigger: { value: 15 }, card: { boardId: 'b2' }, done: null });
    expect(c.trigger.value).toBe(20);
    expect(c.card.boardId).toBe('b1');
    expect(c.done).not.toBeNull();
  });

  it('done: null schaltet „von selbst erledigen" aus; ein Wert ändert nur eine vorhandene Bedingung', () => {
    expect(applyBulkPatch(config(), { done: null }).done).toBeNull();
    expect(applyBulkPatch(config(), { done: { value: 60 } }).done).toMatchObject({ value: 60, entityId: 'sensor.knopf_batterie' });
    expect(applyBulkPatch(config({ done: null }), { done: { value: 60 } }).done).toBeNull();
  });

  it('Zuteilung wird ganz ersetzt, Vorlauf und Vorhersage-Stunden werden gesetzt', () => {
    const assign = { mode: 'fixed' as const, personIds: ['p1'], fallback: 'next' as const, waitFallback: 'none' as const, fallbackPersonId: null };
    expect(applyBulkPatch(config(), { assign }).assign).toEqual(assign);
    const cal = config({ trigger: trigger({ kind: 'calendar_event', leadMin: 720 }) });
    expect(applyBulkPatch(cal, { trigger: { leadMin: 60 } }).trigger.leadMin).toBe(60);
    const fc = config({ trigger: trigger({ kind: 'forecast', forecast: { condition: 'rain', hours: 3 } }) });
    expect(applyBulkPatch(fc, { trigger: { forecastHours: 6 } }).trigger.forecast).toEqual({ condition: 'rain', hours: 6 });
  });
});

describe('commonFamily', () => {
  const w = (kind: WatchTrigger['kind'], unit: string | null = null) => ({ trigger: trigger({ kind }), unit });
  it('gleiche Art und Einheit: die Art', () => {
    expect(commonFamily([w('below', '%'), w('below', '%')])).toBe('below');
    expect(commonFamily([w('state'), w('state', 'x')])).toBe('state');
  });
  it('verschiedene Einheit oder Art: gemischt', () => {
    expect(commonFamily([w('below', '%'), w('below', 'W')])).toBeNull();
    expect(commonFamily([w('below', '%'), w('calendar_event')])).toBeNull();
    expect(commonFamily([w('below', '%'), w('above', '%')])).toBeNull();
    expect(commonFamily([])).toBeNull();
  });
});

describe('parseBulkPatch', () => {
  it('Auslöser-Felder bei gemischter Auswahl: Fehler', () => {
    expect(() => parseBulkPatch({ trigger: { value: 10 } }, null)).toThrow(ValidationError);
    expect(() => parseBulkPatch({ done: { value: 10 } }, null)).toThrow(ValidationError);
  });
  it('Felder einer anderen Art: Fehler', () => {
    expect(() => parseBulkPatch({ trigger: { leadMin: 10 } }, 'below')).toThrow(ValidationError);
    expect(() => parseBulkPatch({ trigger: { value: 10 } }, 'calendar_event')).toThrow(ValidationError);
  });
  it('unbekannte Schlüssel: Fehler (Name, Entität, Kartentitel sind nie dabei)', () => {
    expect(() => parseBulkPatch({ name: 'x' }, 'below')).toThrow(ValidationError);
    expect(() => parseBulkPatch({ trigger: { entityId: 'sensor.x' } }, 'below')).toThrow(ValidationError);
    expect(() => parseBulkPatch({ card: { title: 'x' } }, 'below')).toThrow(ValidationError);
    expect(() => parseBulkPatch('x', 'below')).toThrow(ValidationError);
  });
  it('gemeinsame Felder gehen auch bei gemischter Auswahl, done: null ebenso', () => {
    expect(parseBulkPatch({ active: false, card: { boardId: 'b' }, done: null }, null)).toEqual({ active: false, card: { boardId: 'b' }, done: null });
    expect(parseBulkPatch({ trigger: { value: 10, forMin: 5 } }, 'below')).toEqual({ trigger: { value: 10, forMin: 5 } });
  });
});
