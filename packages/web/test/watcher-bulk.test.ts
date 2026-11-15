import { describe, expect, it } from 'vitest';
import { bulkFields, commonValues, devicesOf, formValues, MIXED, resetField, toBulkPatch, valueText } from '../src/lib/watcher-bulk';
import type { WatcherItem } from '../src/lib/watcher-types';
import { emptyForm, fromWatcher } from '../src/lib/watchers';

const w = (id: string, over: Record<string, unknown> = {}): WatcherItem =>
  ({
    id,
    name: 'Batterie schwach',
    active: true,
    status: 'ok',
    trigger: { entityId: `sensor.${id}`, kind: 'below', to: null, value: 20, forMin: 10, count: 1 },
    card: { boardId: 'b1', columnId: 'c1', title: 'Batterie wechseln', description: null, categoryIds: [], priority: null, due: { kind: 'none' } },
    assign: { mode: 'rotation_present', personIds: [], fallback: 'next', waitFallback: 'none', fallbackPersonId: null },
    done: { entityId: `sensor.${id}`, kind: 'above', to: null, value: 50 },
    cooldownMin: 10,
    dedupe: true,
    nudge: null,
    category: null,
    countsForFairness: true,
    entityUnit: '%',
    ...over,
  }) as unknown as WatcherItem;
const calendar = (id: string) =>
  w(id, { trigger: { entityId: `calendar.${id}`, kind: 'calendar_event', to: null, value: null, forMin: 0, count: 1, leadMin: 720 }, done: null, entityUnit: null });

describe('bulkFields', () => {
  it('zwei Schwellen mit gleicher Einheit: Auslöser-Felder dabei', () => {
    const f = bulkFields([w('a'), w('b')]);
    expect(f).toContain('threshold');
    expect(f).toContain('forMin');
    expect(f).toContain('count');
    expect(f).toContain('doneValue');
    expect(f).not.toContain('lead');
  });

  it('Schwelle und Kalender gemischt: keine Auslöser-Felder, aber die gemeinsamen', () => {
    const f = bulkFields([w('a'), calendar('b')]);
    expect(f).not.toContain('threshold');
    expect(f).not.toContain('forMin');
    expect(f).not.toContain('doneValue');
    expect(f).toEqual(expect.arrayContaining(['assign', 'board', 'due', 'priority', 'nudge', 'cooldown', 'dedupe', 'fairness', 'active', 'category']));
  });

  it('verschiedene Einheit zählt als gemischt', () => {
    expect(bulkFields([w('a'), w('b', { entityUnit: 'W' })])).not.toContain('threshold');
  });

  it('Kalender: Vorlauf; Vorhersage: Stunden; „von selbst erledigt ab“ nur, wenn alle eine solche Bedingung haben', () => {
    expect(bulkFields([calendar('a'), calendar('b')])).toContain('lead');
    const fc = (id: string) =>
      w(id, { trigger: { entityId: 'weather.x', kind: 'forecast', to: null, value: null, forMin: 0, count: 1, forecast: { condition: 'rain', hours: 3 } }, done: null, entityUnit: null });
    expect(bulkFields([fc('a'), fc('b')])).toContain('forecastHours');
    expect(bulkFields([w('a'), w('b', { done: null })])).not.toContain('doneValue');
  });
});

describe('commonValues', () => {
  it('gleiche Werte kommen heraus, verschiedene sind MIXED', () => {
    const v = commonValues([w('a'), w('b', { card: { boardId: 'b2', columnId: 'c2', title: 'x', description: null, categoryIds: [], priority: null, due: { kind: 'none' } } })]);
    expect(v.board).toBe(MIXED);
    expect(v.threshold).toBe(20);
    expect(v.cooldown).toBe(10);
    expect(v.active).toBe(true);
    expect(v.assign).toMatchObject({ mode: 'rotation_present' });
  });

  it('Objekte werden nach Inhalt verglichen', () => {
    const fixed = (p: string) => ({ mode: 'fixed', personIds: [p], fallback: 'next', waitFallback: 'none', fallbackPersonId: null });
    const a = w('a', { assign: fixed('p1') });
    const b = w('b', { assign: fixed('p1') });
    const c = w('c', { assign: fixed('p2') });
    expect(commonValues([a, b]).assign).toMatchObject({ personIds: ['p1'] });
    expect(commonValues([a, c]).assign).toBe(MIXED);
  });
});

describe('toBulkPatch', () => {
  const form = () => ({ ...fromWatcher(w('a')), personIds: ['p1'], assignMode: 'fixed' as const, value: '15', cooldownMin: '30' });

  it('nur angefasste Felder gehen in den Patch', () => {
    expect(toBulkPatch(form(), new Set(['assign']))).toEqual({ assign: { mode: 'fixed', personIds: ['p1'], fallback: 'next', waitFallback: 'none', fallbackPersonId: null } });
    expect(toBulkPatch(form(), new Set())).toEqual({});
  });

  it('Schwelle, Sperrzeit und „von selbst erledigt ab“', () => {
    const p = toBulkPatch({ ...form(), doneValue: '60' }, new Set(['threshold', 'cooldown', 'doneValue']));
    expect(p).toEqual({ trigger: { value: 15 }, cooldownMin: 30, done: { value: 60 } });
  });

  it('Board setzt Spalte und leert die Kategorien der Aufgabe (sie gehören dem alten Board)', () => {
    const f = { ...form(), boardId: 'b2', columnId: 'c2', categoryIds: ['x'] };
    expect(toBulkPatch(f, new Set(['board']))).toEqual({ card: { boardId: 'b2', columnId: 'c2', categoryIds: [] } });
  });

  it('Fälligkeit, Priorität, Stupsen, Doppelaufgaben, Fairness, aktiv, Kategorie', () => {
    const f = { ...form(), dueKind: 'in' as const, dueMinutes: '45', priority: 'high' as const, nudgeAfter: '60', dedupe: false, countsForFairness: false, active: false, category: ' Akkus ' };
    const p = toBulkPatch(f, new Set(['due', 'priority', 'nudge', 'dedupe', 'fairness', 'active', 'category']));
    expect(p).toEqual({
      card: { due: { kind: 'in', minutes: 45 }, priority: 'high' },
      nudge: { afterMin: 60, everyMin: null, max: 1 },
      dedupe: false,
      countsForFairness: false,
      active: false,
      category: 'Akkus',
    });
  });

  it('Vorlauf des Kalenders und Stunden der Vorhersage', () => {
    const f = { ...emptyForm('b', 'c'), kind: 'calendar_event' as const, leadHours: '6', forecastHours: '5' };
    expect(toBulkPatch(f, new Set(['lead']))).toEqual({ trigger: { leadMin: 360 } });
    expect(toBulkPatch({ ...f, kind: 'forecast' as const }, new Set(['forecastHours']))).toEqual({ trigger: { forecastHours: 5 } });
  });

  it('Dauer und Anzahl', () => {
    const f = { ...form(), forMin: '5', count: '3' };
    expect(toBulkPatch(f, new Set(['forMin', 'count']))).toEqual({ trigger: { forMin: 5, count: 3 } });
  });
});

describe('devicesOf', () => {
  it('entfernt doppelte Entitäten und behält die Reihenfolge', () => {
    const hits = [{ entityId: 'sensor.b' }, { entityId: 'sensor.a', name: 'A' }, { entityId: 'sensor.b' }, { entityId: 'sensor.c' }];
    expect(devicesOf(hits)).toEqual([{ entityId: 'sensor.b' }, { entityId: 'sensor.a' }, { entityId: 'sensor.c' }]);
  });
});

describe('formValues, valueText, resetField', () => {
  const ctx = { personName: (id: string) => (id === 'p1' ? 'Anna' : '?'), boardName: (id: string) => `Board ${id}`, unit: '%' };

  it('formValues liefert dieselbe Form wie commonValues', () => {
    const items = [w('a'), w('b')];
    const form = fromWatcher(items[0]!);
    expect(formValues(form)).toEqual(commonValues(items));
  });

  it('valueText: verschieden, Zahlen mit Einheit, Zuteilung, Board', () => {
    expect(valueText('board', MIXED, ctx)).toBe('verschieden');
    expect(valueText('threshold', 20, ctx)).toBe('20 %');
    expect(valueText('cooldown', 10, ctx)).toBe('10 Min.');
    expect(valueText('assign', { mode: 'fixed', personIds: ['p1'] }, ctx)).toBe('Anna');
    expect(valueText('board', { boardId: 'b1', columnId: 'c1' }, ctx)).toBe('Board b1');
    expect(valueText('due', { kind: 'none' }, ctx)).toBe('ohne Termin');
    expect(valueText('active', false, ctx)).toBe('pausiert');
    expect(valueText('lead', 720, ctx)).toBe('12 Stunden');
  });

  it('resetField setzt nur die Felder des einen Feldes zurück', () => {
    const initial = fromWatcher(w('a'));
    const changed = { ...initial, assignMode: 'fixed' as const, personIds: ['p1'], cooldownMin: '99' };
    const back = resetField(changed, initial, 'assign');
    expect(back.assignMode).toBe('rotation_present');
    expect(back.personIds).toEqual([]);
    expect(back.cooldownMin).toBe('99');
  });
});
