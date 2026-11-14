import { describe, expect, it } from 'vitest';
import type { ScheduleCard } from '../src/lib/schedule';
import { doneProgress, doneSheet, overdueSheet, overdueSince, shiftDue, timeOfDay, todaySheet } from '../src/lib/statsSheets';
import { taskStats } from '../src/lib/tasks';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 04.11.2026, 11:00 Berlin
const ME = 'me';

const mk = (id: string, dueAt: string | null, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({ id, boardId: 'b', boardName: 'B', boardColor: null, title: id, dueAt, completedAt: null, assigneeIds: [ME], categories: [], ...extra }) as unknown as ScheduleCard;
const ids = (list: ScheduleCard[]) => list.map((c) => c.id);

describe('todaySheet: Heute fällig', () => {
  const cards = [
    mk('abend', '2026-11-04T17:00:00Z'), // 18:00
    mk('nachmittag', '2026-11-04T15:30:00Z'), // 16:30
    mk('vorbei', '2026-11-04T07:00:00Z'), // 08:00, schon überfällig
    mk('morgen', '2026-11-05T09:00:00Z'),
    mk('erledigt-spaet', '2026-11-04T12:00:00Z', { completedAt: '2026-11-04T09:15:00Z' }),
    mk('erledigt-frueh', '2026-11-04T06:00:00Z', { completedAt: '2026-11-04T06:42:00Z' }),
    mk('erledigt-gestern', '2026-11-03T09:00:00Z', { completedAt: '2026-11-03T10:00:00Z' }),
    mk('erledigt-anderer-termin', '2026-11-08T09:00:00Z', { completedAt: '2026-11-04T08:00:00Z' }),
    mk('fremd', '2026-11-04T17:00:00Z', { assigneeIds: ['x'] }),
    mk('ohne', null),
  ];

  it('offen: nur noch heute fällige, nach Uhrzeit; erledigt: heute erledigt mit Termin heute, nach Erledigungszeit', () => {
    const s = todaySheet(cards, ME, NOW, TZ);
    expect(ids(s.open)).toEqual(['nachmittag', 'abend']);
    expect(ids(s.done)).toEqual(['erledigt-frueh', 'erledigt-spaet']);
    expect(s.total).toBe(4);
  });

  it('ohne ich nichts', () => {
    expect(todaySheet(cards, null, NOW, TZ)).toEqual({ open: [], done: [], total: 0 });
  });

  it('die offenen sind genau die Zahl „Heute fällig" der Leiste', () => {
    expect(todaySheet(cards, ME, NOW, TZ).open.length).toBe(taskStats(cards, ME, NOW, TZ).today);
  });

  it('Mitternacht: 23:59 Berlin ist noch heute, 00:00 schon morgen', () => {
    const now = Date.parse('2026-11-04T09:00:00Z');
    const c = [mk('a', '2026-11-04T22:59:00Z'), mk('b', '2026-11-04T23:00:00Z')];
    expect(ids(todaySheet(c, ME, now, TZ).open)).toEqual(['a']);
  });
});

describe('overdueSheet: Überfällig', () => {
  it('nur eigene offene Aufgaben mit vergangenem Termin, älteste zuerst', () => {
    const cards = [
      mk('gestern', '2026-11-03T09:00:00Z'),
      mk('vorgestern', '2026-11-02T09:00:00Z'),
      mk('heute-frueh', '2026-11-04T07:00:00Z'),
      mk('heute-spaet', '2026-11-04T17:00:00Z'),
      mk('erledigt', '2026-11-02T09:00:00Z', { completedAt: '2026-11-03T09:00:00Z' }),
      mk('fremd', '2026-11-02T09:00:00Z', { assigneeIds: ['x'] }),
    ];
    expect(ids(overdueSheet(cards, ME, NOW))).toEqual(['vorgestern', 'gestern', 'heute-frueh']);
    expect(overdueSheet(cards, ME, NOW).length).toBe(taskStats(cards, ME, NOW, TZ).overdue);
  });
});

describe('overdueSince: seit heute, gestern, N Tagen (nach Kalendertagen im Haushalt)', () => {
  it.each([
    ['2026-11-04T07:00:00Z', NOW, { kind: 'today' }],
    ['2026-11-03T17:00:00Z', NOW, { kind: 'yesterday' }],
    ['2026-11-02T09:00:00Z', NOW, { kind: 'days', n: 2 }],
    ['2026-10-25T09:00:00Z', NOW, { kind: 'days', n: 10 }],
    // 23:30 UTC ist in Berlin schon der nächste Tag: der Termin von 22:00 UTC (23:00 Berlin) liegt „heute", der von 22:00 am Vortag „gestern"
    ['2026-11-04T22:00:00Z', Date.parse('2026-11-04T23:30:00Z'), { kind: 'yesterday' }],
    ['2026-11-05T22:30:00Z', Date.parse('2026-11-06T09:00:00Z'), { kind: 'yesterday' }],
  ])('%s → %j', (due, now, want) => {
    expect(overdueSince(due, now, TZ)).toEqual(want);
  });
  it('über die Zeitumstellung zählen Kalendertage, nicht 24-Stunden-Blöcke', () => {
    // Termin Fr 23.10. 23:30 Berlin (21:30 UTC), jetzt Mo 26.10. 00:10 Berlin (= So 25.10. 23:10 UTC): 3 Tage
    expect(overdueSince('2026-10-23T21:30:00Z', Date.parse('2026-10-25T23:10:00Z'), TZ)).toEqual({ kind: 'days', n: 3 });
  });
});

describe('shiftDue: Termin verschieben, Uhrzeit bleibt (Ortszeit des Haushalts)', () => {
  it('auf morgen: gleiche Ortszeit am Folgetag (auch bei einem Termin von vorgestern)', () => {
    expect(shiftDue('2026-11-03T09:30:00.000Z', 'tomorrow', NOW, TZ)).toBe('2026-11-05T09:30:00.000Z');
    expect(shiftDue('2026-11-02T09:30:00.000Z', 'tomorrow', NOW, TZ)).toBe('2026-11-05T09:30:00.000Z');
  });

  it('auf heute: gleiche Uhrzeit, wenn sie noch kommt', () => {
    expect(shiftDue('2026-11-02T17:30:00.000Z', 'today', NOW, TZ)).toBe('2026-11-04T17:30:00.000Z');
  });

  it('auf heute: ist die Uhrzeit schon vorbei, die nächste volle Stunde (sonst bliebe die Aufgabe überfällig)', () => {
    expect(shiftDue('2026-11-02T07:00:00.000Z', 'today', NOW, TZ)).toBe('2026-11-04T11:00:00.000Z'); // jetzt 11:00 Berlin → 12:00
  });

  it('auf heute spät am Abend: 23:59, nicht erst morgen', () => {
    const now = Date.parse('2026-11-04T22:30:00Z'); // 23:30 Berlin
    expect(shiftDue('2026-11-02T07:00:00.000Z', 'today', now, TZ)).toBe('2026-11-04T22:59:00.000Z');
  });

  it('auf das Wochenende: der nächste Samstag, gleiche Uhrzeit', () => {
    expect(shiftDue('2026-11-03T09:30:00.000Z', 'weekend', NOW, TZ)).toBe('2026-11-07T09:30:00.000Z'); // Mi → Sa 07.11.
    const sat = Date.parse('2026-11-07T10:00:00Z');
    expect(shiftDue('2026-11-06T09:30:00.000Z', 'weekend', sat, TZ)).toBe('2026-11-14T09:30:00.000Z'); // am Samstag: der nächste
    const sun = Date.parse('2026-11-08T10:00:00Z');
    expect(shiftDue('2026-11-06T09:30:00.000Z', 'weekend', sun, TZ)).toBe('2026-11-14T09:30:00.000Z');
    const fri = Date.parse('2026-11-06T10:00:00Z');
    expect(shiftDue('2026-11-05T09:30:00.000Z', 'weekend', fri, TZ)).toBe('2026-11-07T09:30:00.000Z');
  });

  it('Mitternacht: kurz nach 00:00 in Berlin ist (UTC noch gestern) schon der neue Tag', () => {
    const now = Date.parse('2026-11-04T23:30:00Z'); // Do 05.11. 00:30 Berlin
    expect(shiftDue('2026-11-04T22:00:00.000Z', 'tomorrow', now, TZ)).toBe('2026-11-06T22:00:00.000Z'); // Fr 06.11. 23:00 Berlin
    expect(shiftDue('2026-11-04T22:00:00.000Z', 'today', now, TZ)).toBe('2026-11-05T22:00:00.000Z'); // Do 05.11. 23:00 Berlin
    expect(shiftDue('2026-11-04T23:10:00.000Z', 'today', now, TZ)).toBe('2026-11-05T00:00:00.000Z'); // 00:10 vorbei → 01:00 Berlin
  });

  it('Zeitumstellung im Herbst (So 25.10.2026): die Ortszeit bleibt, der UTC-Abstand ändert sich', () => {
    const now = Date.parse('2026-10-24T10:00:00Z'); // Sa 12:00 MESZ
    expect(shiftDue('2026-10-23T07:30:00.000Z', 'tomorrow', now, TZ)).toBe('2026-10-25T08:30:00.000Z'); // 09:30 MEZ
    const wed = Date.parse('2026-10-21T10:00:00Z');
    expect(shiftDue('2026-10-20T07:30:00.000Z', 'weekend', wed, TZ)).toBe('2026-10-24T07:30:00.000Z'); // Sa 09:30 MESZ
    const sun = Date.parse('2026-10-25T10:00:00Z');
    expect(shiftDue('2026-10-24T07:30:00.000Z', 'weekend', sun, TZ)).toBe('2026-10-31T08:30:00.000Z'); // Sa 09:30 MEZ
  });

  it('Zeitumstellung im Frühjahr (So 29.03.2026): die fehlende Stunde 02:30 rückt auf 03:30', () => {
    const now = Date.parse('2026-03-28T10:00:00Z');
    expect(shiftDue('2026-03-27T01:30:00.000Z', 'tomorrow', now, TZ)).toBe('2026-03-29T01:30:00.000Z'); // 03:30 MESZ
    expect(shiftDue('2026-03-27T08:00:00.000Z', 'tomorrow', now, TZ)).toBe('2026-03-29T07:00:00.000Z'); // 09:00 MESZ
  });

  it('Sekunden und Millisekunden des Termins bleiben', () => {
    expect(shiftDue('2026-11-03T09:30:15.250Z', 'tomorrow', NOW, TZ)).toBe('2026-11-05T09:30:15.250Z');
  });
});

describe('doneSheet und doneProgress: Heute erledigt', () => {
  const cards = [
    mk('spaet', '2026-11-04T17:00:00Z', { completedAt: '2026-11-04T09:30:00Z' }),
    mk('frueh', null, { completedAt: '2026-11-04T06:42:00Z' }),
    mk('gestern', '2026-11-03T09:00:00Z', { completedAt: '2026-11-03T21:59:00Z' }),
    mk('grenze', '2026-11-03T09:00:00Z', { completedAt: '2026-11-03T23:00:00Z' }), // 00:00 Berlin: schon heute
    mk('fremd', null, { completedAt: '2026-11-04T08:00:00Z', assigneeIds: ['x'] }),
    mk('offen', '2026-11-04T17:00:00Z'),
  ];
  it('heute erledigte eigene Aufgaben, nach Erledigungszeit', () => {
    expect(ids(doneSheet(cards, ME, NOW, TZ))).toEqual(['grenze', 'frueh', 'spaet']);
  });
  it('die Zahl ist die der Leiste', () => {
    expect(doneSheet(cards, ME, NOW, TZ).length).toBe(taskStats(cards, ME, NOW, TZ).done);
  });
  it.each([
    [{ today: 3, overdue: 5, done: 4 }, { done: 4, total: 7, open: 3, fraction: 4 / 7 }],
    [{ today: 0, overdue: 0, done: 2 }, { done: 2, total: 2, open: 0, fraction: 1 }],
    [{ today: 2, overdue: 0, done: 0 }, { done: 0, total: 2, open: 2, fraction: 0 }],
    [{ today: 0, overdue: 1, done: 0 }, { done: 0, total: 0, open: 0, fraction: 0 }],
  ])('Ring %j', (stats, want) => {
    expect(doneProgress(stats)).toEqual(want);
  });
});

describe('timeOfDay', () => {
  it('Uhrzeit in der Zeitzone des Haushalts', () => {
    expect(timeOfDay('2026-11-04T06:42:00Z', TZ)).toBe('07:42');
    expect(timeOfDay('2026-07-04T06:42:00Z', TZ)).toBe('08:42');
    expect(timeOfDay('2026-11-04T23:00:00Z', TZ)).toBe('00:00');
  });
});
