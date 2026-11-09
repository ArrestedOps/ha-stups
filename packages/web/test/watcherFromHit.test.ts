import { describe, expect, it } from 'vitest';
import { defaultColumnId, watcherInputFromHit } from '../src/lib/watcherFromHit';
import type { TemplateDraft, WatcherSuggestion, WatcherTemplate } from '../src/lib/watcher-types';

const washerDraft: TemplateDraft = {
  name: 'Waschmaschine fertig',
  trigger: { kind: 'below', value: 5, forMin: 3 },
  card: { title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'rotation' },
  done: null,
};
const template = { id: 'washer', kind: 'watcher', title: 'Waschmaschine fertig', hint: '', domain: 'sensor', search: 'waschmaschine', draft: washerDraft, recurring: null, category: 'laundry' } as unknown as WatcherTemplate;
const hit: WatcherSuggestion = { templateId: 'washer', entityId: 'sensor.waschmaschine_leistung', name: 'Waschmaschine Leistung', reason: '', variant: 'power', unit: 'W' };

describe('Wächter aus einem Treffer', () => {
  it('Vorlage und Entität stehen drin; Zuständige: anwesende Personen reihum; Fairness nach dem Board', () => {
    const input = watcherInputFromHit({ template, hit, boardId: 'b1', columnId: 'c1', personIds: ['p1', 'p2'] });
    expect(input).toMatchObject({
      name: 'Waschmaschine fertig',
      active: true,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
      card: { boardId: 'b1', columnId: 'c1', title: 'Waschmaschine ausräumen', due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'rotation_present', personIds: ['p1', 'p2'], fallback: 'next' },
    });
    // ohne eigene Wahl entscheidet das Board (das Feld fehlt)
    expect('countsForFairness' in input).toBe(false);
  });

  it('der Treffer bringt seinen eigenen Entwurf mit (Programmstatus statt Leistung)', () => {
    const status: WatcherSuggestion = { ...hit, variant: 'status', draft: { ...washerDraft, trigger: { kind: 'state', to: 'finished', forMin: 0 } } };
    const input = watcherInputFromHit({ template, hit: status, boardId: 'b1', columnId: 'c1', personIds: ['p1'] });
    expect(input.trigger).toMatchObject({ kind: 'state', to: 'finished' });
  });

  it('ohne Personen bleibt die Zuteilung der Vorlage', () => {
    const input = watcherInputFromHit({ template, hit, boardId: 'b1', columnId: 'c1', personIds: [] });
    expect(input.assign.mode).toBe('rotation');
  });

  it('eine unfertige Eingabe wirft eine Meldung, statt etwas Halbes zu speichern', () => {
    expect(() => watcherInputFromHit({ template, hit, boardId: '', columnId: 'c1', personIds: ['p1'] })).toThrow();
  });

  it('die erste Spalte, die weder erledigt noch geplant ist', () => {
    expect(defaultColumnId([{ id: 'x', isDone: true, isPlanned: false }, { id: 'g', isDone: false, isPlanned: true }, { id: 'o', isDone: false, isPlanned: false }])).toBe('o');
    expect(defaultColumnId([{ id: 'x', isDone: true, isPlanned: false }])).toBe('x');
    expect(defaultColumnId([])).toBe('');
  });
});
