import { describe, expect, it } from 'vitest';
import {
  AGENDA_STEP_DAYS,
  agendaHorizonAfterLoad,
  boardColorKey,
  boardCounts,
  dayLabel,
  DEFAULT_FILTER,
  filterSchedule,
  groupByDay,
  isFiltered,
  personCounts,
  toggleId,
  type ScheduleCard,
  type ScheduleFilter,
} from '../src/lib/schedule';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 04.11., 11:00 Berlin

const mk = (id: string, dueAt: string, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({
    id,
    boardId: 'b1',
    boardName: 'Haushalt',
    boardColor: null,
    title: id,
    dueAt,
    completedAt: null,
    assigneeIds: [],
    ...extra,
  }) as unknown as ScheduleCard;

const cards = [
  mk('müll', '2026-11-04T07:15:00Z', { assigneeIds: ['anna'] }), // überfällig
  mk('steuer', '2026-11-04T17:00:00Z', { assigneeIds: ['ben'] }), // heute
  mk('fenster', '2026-11-05T09:00:00Z', { assigneeIds: ['anna', 'ben'] }), // morgen
  mk('elektriker', '2026-11-07T08:00:00Z', { boardId: 'b2', boardName: 'Umbau', assigneeIds: ['ben'] }),
  mk('papier', '2026-11-07T16:00:00Z', { assigneeIds: [] }),
  mk('altes', '2026-11-03T09:00:00Z', { assigneeIds: ['anna'], completedAt: '2026-11-03T10:00:00Z' }),
];
const f = (extra: Partial<ScheduleFilter>): ScheduleFilter => ({ ...DEFAULT_FILTER, ...extra });

describe('filterSchedule', () => {
  it('ohne Filter alles Offene, Erledigtes nur auf Wunsch', () => {
    expect(filterSchedule(cards, DEFAULT_FILTER).map((c) => c.id)).toEqual(['müll', 'steuer', 'fenster', 'elektriker', 'papier']);
    expect(filterSchedule(cards, f({ showDone: true }))).toHaveLength(6);
  });

  it('Personen: wer in der Auswahl vorkommt, auch bei mehreren Zuständigen', () => {
    expect(filterSchedule(cards, f({ personIds: ['anna'] })).map((c) => c.id)).toEqual(['müll', 'fenster']);
    expect(filterSchedule(cards, f({ personIds: ['anna', 'ben'] })).map((c) => c.id)).toEqual(['müll', 'steuer', 'fenster', 'elektriker']);
  });

  it('„Niemand zugewiesen" zeigt Karten ohne Zuständige, allein oder zusammen mit Personen', () => {
    expect(filterSchedule(cards, f({ unassigned: true })).map((c) => c.id)).toEqual(['papier']);
    expect(filterSchedule(cards, f({ personIds: ['anna'], unassigned: true })).map((c) => c.id)).toEqual(['müll', 'fenster', 'papier']);
  });

  it('Boards, kombinierbar mit Personen', () => {
    expect(filterSchedule(cards, f({ boardIds: ['b2'] })).map((c) => c.id)).toEqual(['elektriker']);
    expect(filterSchedule(cards, f({ boardIds: ['b1'], personIds: ['ben'] })).map((c) => c.id)).toEqual(['steuer', 'fenster']);
  });

  it('isFiltered erkennt jede Einschränkung', () => {
    expect(isFiltered(DEFAULT_FILTER)).toBe(false);
    expect(isFiltered(f({ personIds: ['a'] }))).toBe(true);
    expect(isFiltered(f({ unassigned: true }))).toBe(true);
    expect(isFiltered(f({ boardIds: ['b'] }))).toBe(true);
    expect(isFiltered(f({ showDone: true }))).toBe(true);
  });
});

describe('Zahlen an den Chips', () => {
  it('Personen: Karten je Person unter dem Board-Filter, „Niemand" extra', () => {
    expect(personCounts(cards, DEFAULT_FILTER)).toEqual({ byPerson: { anna: 2, ben: 3 }, unassigned: 1 });
    expect(personCounts(cards, f({ boardIds: ['b2'] }))).toEqual({ byPerson: { ben: 1 }, unassigned: 0 });
  });

  it('Personen-Zahlen ändern sich nicht, wenn man gerade Personen wählt', () => {
    expect(personCounts(cards, f({ personIds: ['anna'] }))).toEqual(personCounts(cards, DEFAULT_FILTER));
  });

  it('Boards: Karten je Board unter dem Personen-Filter', () => {
    expect(boardCounts(cards, DEFAULT_FILTER)).toEqual({ b1: 4, b2: 1 });
    expect(boardCounts(cards, f({ personIds: ['ben'] }))).toEqual({ b1: 2, b2: 1 });
  });
});

describe('toggleId', () => {
  it('toggleId fügt hinzu und nimmt weg', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('groupByDay', () => {
  const open = filterSchedule(cards, DEFAULT_FILTER);
  const sections = groupByDay(open, NOW, TZ);

  it('Überfälliges zuerst, dann nur Tage mit Karten, nach Datum', () => {
    expect(sections.map((s) => [s.key, s.title, s.cards.map((c) => c.id)])).toEqual([
      ['overdue', 'Überfällig', ['müll']],
      ['2026-11-04', 'Heute', ['steuer']],
      ['2026-11-05', 'Morgen', ['fenster']],
      ['2026-11-07', 'Sa 7. Nov', ['elektriker', 'papier']],
    ]);
  });

  it('zweite Zeile mit Datum bei Heute und Morgen, sonst nur die Zahl', () => {
    expect(sections.map((s) => s.sub)).toEqual(['1 Karte', 'Mi 4. Nov · 1 Karte', 'Do 5. Nov · 1 Karte', '2 Karten']);
    expect(sections.find((s) => s.today)!.key).toBe('2026-11-04');
  });

  it('Erledigtes steht an seinem Tag, nicht unter Überfällig', () => {
    const withDone = groupByDay(filterSchedule(cards, f({ showDone: true })), NOW, TZ);
    expect(withDone.find((s) => s.overdue)!.cards.map((c) => c.id)).toEqual(['müll']);
    expect(withDone.find((s) => s.key === '2026-11-03')).toMatchObject({ title: 'Gestern', cards: [{ id: 'altes' }] });
  });

  it('Tage rechnen in der Ortszeit: kurz nach Mitternacht gehört zum neuen Tag', () => {
    const s = groupByDay([mk('nacht', '2026-11-04T23:30:00Z')], NOW, TZ); // 00:30 Berlin am 05.11.
    expect(s[0]!.title).toBe('Morgen');
  });

  it('ohne Karten gibt es keine Abschnitte', () => {
    expect(groupByDay([], NOW, TZ)).toEqual([]);
  });
});

describe('dayLabel und Boardfarbe', () => {
  it('nennt das Jahr nur, wenn es nicht das laufende ist', () => {
    expect(dayLabel('2026-12-24', '2026-11-04')).toBe('Do 24. Dez');
    expect(dayLabel('2027-01-02', '2026-11-04')).toBe('Sa 2. Jan 2027');
  });

  it('boardColorKey: eigene Farbe, sonst feste Reihenfolge', () => {
    expect(boardColorKey('blue', 3)).toBe('blue');
    expect(boardColorKey(null, 0)).toBe('orange');
    expect(boardColorKey(null, 1)).toBe('blue');
    expect(boardColorKey('quatsch', 2)).toBe('mint');
    expect(boardColorKey(null, 8)).toBe('orange'); // fängt wieder von vorn an
  });
});

describe('Zeitraum der Agenda', () => {
  it('ist nichts im Zeitraum, schaut die Agenda gleich ein Jahr voraus (sonst wäre die Liste leer, obwohl später Karten anstehen)', () => {
    expect(agendaHorizonAfterLoad(0, AGENDA_STEP_DAYS)).toBe(365);
  });

  it('sonst bleibt der Zeitraum, wie er ist', () => {
    expect(agendaHorizonAfterLoad(3, AGENDA_STEP_DAYS)).toBeNull();
    expect(agendaHorizonAfterLoad(0, 120)).toBeNull(); // schon erweitert
    expect(agendaHorizonAfterLoad(0, 365)).toBeNull();
  });
});