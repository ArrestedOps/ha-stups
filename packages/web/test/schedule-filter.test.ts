import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  boardCounts,
  DEFAULT_FILTER,
  effectiveFilter,
  extraFilterCount,
  filterSchedule,
  isFiltered,
  parseScheduleFilter,
  personCounts,
  sortCards,
  whenCounts,
  whenOf,
  type FilterContext,
  type ScheduleCard,
  type ScheduleFilter,
} from '../src/lib/schedule';
import { groupTasks } from '../src/lib/tasks';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 04.11.2026, 11:00 Berlin
const ctx: FilterContext = { meId: 'anna', nowMs: NOW, tz: TZ };

const mk = (id: string, dueAt: string | null, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({
    id,
    boardId: 'b1',
    boardName: 'Haushalt',
    boardColor: null,
    title: id,
    dueAt,
    completedAt: null,
    assigneeIds: [],
    priority: null,
    watcherId: null,
    openNudges: [],
    createdAt: '2026-10-01T08:00:00Z',
    ...extra,
  }) as unknown as ScheduleCard;
const f = (extra: Partial<ScheduleFilter>): ScheduleFilter => ({ ...DEFAULT_FILTER, ...extra });
const ids = (list: ScheduleCard[]) => list.map((c) => c.id);

// Mi 04.11. 11:00 Berlin; die Woche endet So 08.11.
const cards = [
  mk('alt', '2026-11-03T09:00:00Z', { assigneeIds: ['anna'], priority: 'high', createdAt: '2026-10-05T08:00:00Z' }), // überfällig
  mk('frueh', '2026-11-04T07:00:00Z', { assigneeIds: ['ben'], priority: 'low', createdAt: '2026-10-04T08:00:00Z' }), // heute, vorbei: überfällig
  mk('abend', '2026-11-04T17:00:00Z', { assigneeIds: ['anna'], priority: 'medium', openNudges: [{ id: 'n1', fromId: 'ben', toId: 'anna', delivered: true }], createdAt: '2026-10-09T08:00:00Z' }), // heute
  mk('freitag', '2026-11-06T09:00:00Z', { assigneeIds: ['anna', 'ben'], watcherId: 'w1', boardId: 'b2', createdAt: '2026-10-03T08:00:00Z' }), // diese Woche
  mk('naechste', '2026-11-12T09:00:00Z', { boardId: 'b2', priority: 'high', createdAt: '2026-10-07T08:00:00Z' }), // später
  mk('ohne', null, { assigneeIds: ['ben'], createdAt: '2026-10-08T08:00:00Z' }), // ohne Termin
  mk('fertig-heute', '2026-11-04T08:00:00Z', { assigneeIds: ['anna'], completedAt: '2026-11-04T08:30:00Z', priority: 'high' }), // heute erledigt
  mk('fertig-gestern', '2026-11-03T08:00:00Z', { assigneeIds: ['anna'], completedAt: '2026-11-03T08:30:00Z' }),
];
const run = (extra: Partial<ScheduleFilter>) => ids(filterSchedule(cards, f(extra), ctx));

describe('whenOf: in welche Gruppe fällt eine Karte', () => {
  it('Überfällig, Heute, Diese Woche, Später, Ohne Termin (Grenze 00:00 in der Zeitzone)', () => {
    const by = Object.fromEntries(cards.map((c) => [c.id, whenOf(c, NOW, TZ)]));
    expect(by).toMatchObject({ alt: 'overdue', frueh: 'overdue', abend: 'today', freitag: 'week', naechste: 'later', ohne: 'undated' });
  });

  it('Erledigte zählen nach dem Tag des Termins: heute ja, davor in keiner Gruppe', () => {
    expect(whenOf(cards[6]!, NOW, TZ)).toBe('today');
    expect(whenOf(cards[7]!, NOW, TZ)).toBeNull();
  });

  it('Mitternacht gehört schon zum nächsten Tag (Winterzeit)', () => {
    expect(whenOf(mk('x', '2026-11-04T23:00:00Z'), NOW, TZ)).toBe('week'); // Do 00:00 Berlin
    expect(whenOf(mk('y', '2026-11-04T22:59:00Z'), NOW, TZ)).toBe('today');
    expect(whenOf(mk('z', '2026-11-08T22:59:00Z'), NOW, TZ)).toBe('week'); // So 23:59
    expect(whenOf(mk('w', '2026-11-08T23:00:00Z'), NOW, TZ)).toBe('later'); // Mo 00:00
  });
});

describe('filterSchedule: jede Filterart einzeln', () => {
  it('Standard: offene Karten mit Termin, nichts ohne Termin, nichts Erledigtes', () => {
    expect(run({})).toEqual(['alt', 'frueh', 'abend', 'freitag', 'naechste']);
  });

  it('Wer (auch Niemand)', () => {
    expect(run({ personIds: ['ben'] })).toEqual(['frueh', 'freitag']);
    expect(run({ personIds: ['anna'], unassigned: true })).toEqual(['alt', 'abend', 'freitag', 'naechste']);
  });

  it('Wann: eine oder mehrere Gruppen', () => {
    expect(run({ when: ['overdue'] })).toEqual(['alt', 'frueh']);
    expect(run({ when: ['today'] })).toEqual(['abend']);
    expect(run({ when: ['today', 'week'] })).toEqual(['abend', 'freitag']);
    expect(run({ when: ['later'] })).toEqual(['naechste']);
  });

  it('Wann „Ohne Termin" holt Karten ohne Termin dazu (sonst nie)', () => {
    expect(run({ when: ['undated'] })).toEqual(['ohne']);
    expect(run({ when: ['undated', 'later'] })).toEqual(['naechste', 'ohne']);
  });

  it('Boards', () => {
    expect(run({ boardIds: ['b2'] })).toEqual(['freitag', 'naechste']);
  });

  it('Priorität: genau diese; Karten ohne Priorität nur bei „Alle"', () => {
    expect(run({ priority: 'high' })).toEqual(['alt', 'naechste']);
    expect(run({ priority: 'medium' })).toEqual(['abend']);
    expect(run({ priority: 'low' })).toEqual(['frueh']);
  });

  it('nur mit offenem Stups an mich', () => {
    expect(run({ nudged: true })).toEqual(['abend']);
    expect(ids(filterSchedule(cards, f({ nudged: true }), { ...ctx, meId: 'ben' }))).toEqual([]);
    expect(ids(filterSchedule(cards, f({ nudged: true }), { ...ctx, meId: null }))).toEqual([]);
  });

  it('nur von Wächtern', () => {
    expect(run({ watcherOnly: true })).toEqual(['freitag']);
  });

  it('Erledigte anzeigen: auch erledigte Karten; mit Wann nur die, die in eine Gruppe fallen', () => {
    expect(run({ showDone: true })).toEqual(['alt', 'frueh', 'abend', 'freitag', 'naechste', 'fertig-heute', 'fertig-gestern']);
    expect(run({ showDone: true, when: ['today'] })).toEqual(['abend', 'fertig-heute']);
    expect(run({ showDone: true, when: ['overdue'] })).toEqual(['alt', 'frueh']);
  });
});

describe('filterSchedule: kombiniert', () => {
  it('Wer und Wann und Priorität', () => {
    expect(run({ personIds: ['anna'], when: ['overdue', 'today'], priority: 'high' })).toEqual(['alt']);
    expect(run({ personIds: ['anna'], when: ['overdue', 'today'] })).toEqual(['alt', 'abend']);
  });

  it('Boards und Wächter und Erledigte', () => {
    expect(run({ boardIds: ['b2'], watcherOnly: true, showDone: true })).toEqual(['freitag']);
  });

  it('alles zusammen, ohne Treffer', () => {
    expect(run({ personIds: ['ben'], when: ['today'], boardIds: ['b1'], priority: 'high', nudged: true, watcherOnly: true, showDone: true })).toEqual([]);
  });

  it('Aufruf ohne Kontext funktioniert (Standardwerte), wenn nichts von Zeit oder Person abhängt', () => {
    expect(ids(filterSchedule(cards, f({ boardIds: ['b2'] })))).toEqual(['freitag', 'naechste']);
  });
});

describe('Rolle Kind: effectiveFilter', () => {
  it('ohne Wer und ohne „nur von Wächtern", der Rest bleibt', () => {
    const k = effectiveFilter(f({ personIds: ['ben'], unassigned: true, watcherOnly: true, priority: 'high', when: ['today'], showDone: true }), true);
    expect(k).toMatchObject({ personIds: [], unassigned: false, watcherOnly: false, priority: 'high', when: ['today'], showDone: true });
  });

  it('Erwachsene: unverändert', () => {
    const e = f({ personIds: ['ben'], watcherOnly: true });
    expect(effectiveFilter(e, false)).toBe(e);
  });
});

describe('Sortierung', () => {
  const list = [cards[0]!, cards[1]!, cards[2]!, cards[3]!, cards[4]!, cards[5]!];
  it('Fälligkeit: nach Termin, ohne Termin zuletzt, bei Gleichstand nach Nummer', () => {
    expect(ids(sortCards([...list].reverse(), 'due'))).toEqual(['alt', 'frueh', 'abend', 'freitag', 'naechste', 'ohne']);
    expect(ids(sortCards([mk('b', '2026-11-05T09:00:00Z'), mk('a', '2026-11-05T09:00:00Z')], 'due'))).toEqual(['a', 'b']);
  });
  it('Priorität: hoch vor mittel vor niedrig vor ohne, darin nach Termin', () => {
    expect(ids(sortCards(list, 'priority'))).toEqual(['alt', 'naechste', 'abend', 'frueh', 'freitag', 'ohne']);
  });
  it('Neueste: zuletzt angelegt zuerst', () => {
    expect(ids(sortCards(list, 'newest'))).toEqual(['abend', 'ohne', 'naechste', 'alt', 'frueh', 'freitag']);
  });
  it('verändert die Eingabe nicht', () => {
    const before = ids(list);
    sortCards(list, 'priority');
    expect(ids(list)).toEqual(before);
  });
});

describe('groupTasks mit Sortierung und „Ohne Termin"', () => {
  it('sortiert in jeder Gruppe nach Wahl; Karten ohne Termin bilden eine eigene Gruppe vor „Erledigt"', () => {
    const g = groupTasks(cards, NOW, TZ, { sort: 'priority', withDone: true });
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'week', 'later', 'undated', 'done']);
    expect(ids(g[0]!.cards)).toEqual(['alt', 'frueh']);
    expect(ids(g[4]!.cards)).toEqual(['ohne']);
    expect(ids(g[5]!.cards)).toEqual(['fertig-heute', 'fertig-gestern']);
    expect(ids(groupTasks([cards[0]!, cards[1]!], NOW, TZ, { sort: 'newest' })[0]!.cards)).toEqual(['alt', 'frueh']);
  });
});

describe('Zahlen: gegen die Auswahl gerechnet, nicht gegen Alle', () => {
  it('Wann: so viele blieben, wenn man genau diese Gruppe wählt (andere Filter gelten mit)', () => {
    expect(whenCounts(cards, DEFAULT_FILTER, ctx)).toEqual({ overdue: 2, today: 1, week: 1, later: 1, undated: 1 });
    expect(whenCounts(cards, f({ personIds: ['anna'] }), ctx)).toEqual({ overdue: 1, today: 1, week: 1, later: 0, undated: 0 });
    // die eigene Wann-Auswahl zählt nicht mit
    expect(whenCounts(cards, f({ when: ['today'] }), ctx)).toEqual(whenCounts(cards, DEFAULT_FILTER, ctx));
  });

  it('Wer und Boards rechnen die Wann-Auswahl und die Priorität mit', () => {
    expect(personCounts(cards, f({ when: ['overdue'] }), ctx)).toEqual({ byPerson: { anna: 1, ben: 1 }, unassigned: 0 });
    expect(boardCounts(cards, f({ priority: 'high' }), ctx)).toEqual({ b1: 1, b2: 1 });
  });
});

describe('Merkzettel', () => {
  const known = { personIds: ['anna', 'ben'], boardIds: ['b1', 'b2'] };
  it('Standardwerte und Zähler', () => {
    expect(DEFAULT_FILTER).toEqual({ personIds: [], unassigned: false, boardIds: [], showDone: false, when: [], priority: null, nudged: false, watcherOnly: false, sort: 'due' });
    expect(isFiltered(DEFAULT_FILTER)).toBe(false);
    expect(activeFilterCount(DEFAULT_FILTER)).toBe(0);
    expect(activeFilterCount(f({ personIds: ['anna'], when: ['today'], boardIds: ['b1'], priority: 'low', nudged: true, watcherOnly: true, showDone: true, sort: 'newest' }))).toBe(8);
    // die Personen-Chips über der Liste zeigen „Wer" schon: der Zähler am Knopf lässt es weg
    expect(extraFilterCount(f({ personIds: ['anna'] }))).toBe(0);
    expect(extraFilterCount(f({ personIds: ['anna'], unassigned: true, sort: 'priority' }))).toBe(2);
  });

  it('ohne Merkzettel oder mit Müll: null beziehungsweise Standard', () => {
    expect(parseScheduleFilter(null, known)).toBeNull();
    expect(parseScheduleFilter('', known)).toBeNull();
    expect(parseScheduleFilter('{kaputt', known)).toEqual(DEFAULT_FILTER);
    expect(parseScheduleFilter('42', known)).toEqual(DEFAULT_FILTER);
    expect(parseScheduleFilter('[]', known)).toEqual(DEFAULT_FILTER);
  });

  it('ältere Fassung (vier Felder) liest weiter, neue Felder bekommen Standardwerte', () => {
    const old = JSON.stringify({ personIds: ['anna'], unassigned: true, boardIds: ['b2'], showDone: true });
    expect(parseScheduleFilter(old, known)).toEqual({ ...DEFAULT_FILTER, personIds: ['anna'], unassigned: true, boardIds: ['b2'], showDone: true });
  });

  it('unbekannte Personen und Boards fallen weg, ebenso ungültige Werte', () => {
    const raw = JSON.stringify({ personIds: ['anna', 'weg', 3], boardIds: ['gelöscht'], when: ['today', 'gestern', 5], priority: 'dringend', sort: 'zufall', nudged: 'ja', watcherOnly: 1 });
    expect(parseScheduleFilter(raw, known)).toEqual({ ...DEFAULT_FILTER, personIds: ['anna'], when: ['today'] });
  });

  it('volle neue Fassung bleibt erhalten (Hin und Zurück)', () => {
    const full = f({ personIds: ['ben'], unassigned: true, boardIds: ['b1'], showDone: true, when: ['overdue', 'undated'], priority: 'high', nudged: true, watcherOnly: true, sort: 'newest' });
    expect(parseScheduleFilter(JSON.stringify(full), known)).toEqual(full);
  });

  it('Kind: Wer und „nur von Wächtern" fallen weg', () => {
    const raw = JSON.stringify(f({ personIds: ['ben'], unassigned: true, watcherOnly: true, priority: 'low' }));
    expect(parseScheduleFilter(raw, known, { isChild: true })).toEqual({ ...DEFAULT_FILTER, priority: 'low' });
  });
});
