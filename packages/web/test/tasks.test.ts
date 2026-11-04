import { describe, expect, it } from 'vitest';
import { groupTasks, nudgesToMe, parseTasksView, taskStats } from '../src/lib/tasks';
import type { ScheduleCard } from '../src/lib/schedule';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 04.11.2026, 11:00 Berlin

const mk = (id: string, dueAt: string, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({ id, boardId: 'b', boardName: 'B', boardColor: null, title: id, dueAt, completedAt: null, assigneeIds: [], ...extra }) as unknown as ScheduleCard;
const ids = (list: ScheduleCard[]) => list.map((c) => c.id);

describe('groupTasks: Überfällig, Heute, Diese Woche, Später', () => {
  const cards = [
    mk('spaet', '2026-11-12T09:00:00Z'), // nächste Woche
    mk('woche', '2026-11-06T09:00:00Z'), // Fr
    mk('morgen', '2026-11-05T09:00:00Z'), // Do: noch diese Woche
    mk('heute-spaet', '2026-11-04T17:00:00Z'), // heute 18:00
    mk('heute-frueh', '2026-11-04T07:00:00Z'), // heute 08:00, vorbei
    mk('gestern', '2026-11-03T09:00:00Z'),
    mk('erledigt', '2026-11-03T09:00:00Z', { completedAt: '2026-11-03T10:00:00Z' }),
  ];

  it('teilt offene Karten nach Termin und sortiert nach Termin', () => {
    const g = groupTasks(cards, NOW, TZ);
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'week', 'later']);
    expect(ids(g[0]!.cards)).toEqual(['gestern', 'heute-frueh']);
    expect(ids(g[1]!.cards)).toEqual(['heute-spaet']);
    expect(ids(g[2]!.cards)).toEqual(['morgen', 'woche']);
    expect(ids(g[3]!.cards)).toEqual(['spaet']);
  });

  it('leere Gruppen fehlen, Erledigtes gehört in keine der vier', () => {
    expect(groupTasks([mk('x', '2026-11-12T09:00:00Z')], NOW, TZ).map((x) => x.key)).toEqual(['later']);
    expect(groupTasks([cards[6]!], NOW, TZ)).toEqual([]);
  });

  it('mit Erledigten: eine fünfte Gruppe am Ende', () => {
    const g = groupTasks(cards, NOW, TZ, { withDone: true });
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'week', 'later', 'done']);
    expect(ids(g[4]!.cards)).toEqual(['erledigt']);
  });

  it('Zeitgrenze 23:59 / 00:00 in der Zeitzone des Haushalts', () => {
    // 04.11. 23:59 Berlin = 22:59 UTC: heute; 05.11. 00:00 Berlin = 23:00 UTC: schon morgen (Diese Woche)
    const g = groupTasks([mk('a', '2026-11-04T22:59:00Z'), mk('b', '2026-11-04T23:00:00Z')], NOW, TZ);
    expect(g.map((x) => [x.key, ids(x.cards)])).toEqual([
      ['today', ['a']],
      ['week', ['b']],
    ]);
  });

  it('die Woche endet am Sonntag um Mitternacht (Montag 00:00 ist Später)', () => {
    // So 08.11. 23:59 Berlin = 22:59 UTC; Mo 09.11. 00:00 Berlin = 23:00 UTC
    const g = groupTasks([mk('so', '2026-11-08T22:59:00Z'), mk('mo', '2026-11-08T23:00:00Z')], NOW, TZ);
    expect(g.map((x) => [x.key, ids(x.cards)])).toEqual([
      ['week', ['so']],
      ['later', ['mo']],
    ]);
  });

  it('am Sonntag ist Diese Woche leer, morgen ist schon Später', () => {
    const sunday = Date.parse('2026-11-08T10:00:00Z');
    const g = groupTasks([mk('mo', '2026-11-09T09:00:00Z'), mk('heute', '2026-11-08T15:00:00Z')], sunday, TZ);
    expect(g.map((x) => x.key)).toEqual(['today', 'later']);
  });

  it('um Mitternacht in UTC ist der Tag in Berlin schon weiter', () => {
    const late = Date.parse('2026-11-04T23:30:00Z'); // Do 05.11., 00:30 Berlin
    const g = groupTasks([mk('a', '2026-11-05T05:00:00Z'), mk('b', '2026-11-04T22:00:00Z')], late, TZ);
    expect(g.map((x) => [x.key, ids(x.cards)])).toEqual([
      ['overdue', ['b']],
      ['today', ['a']],
    ]);
  });
});

describe('taskStats: nur die eigenen Zahlen', () => {
  const me = 'anna';
  const open = [
    mk('ueber', '2026-11-04T07:00:00Z', { assigneeIds: [me] }),
    mk('ueber2', '2026-11-02T07:00:00Z', { assigneeIds: [me, 'ben'] }),
    mk('heute', '2026-11-04T17:00:00Z', { assigneeIds: [me] }),
    mk('morgen', '2026-11-05T09:00:00Z', { assigneeIds: [me] }),
    mk('fremd', '2026-11-04T07:00:00Z', { assigneeIds: ['ben'] }),
    mk('niemand', '2026-11-04T17:00:00Z'),
  ];
  const done = [
    mk('d1', '2026-11-04T06:00:00Z', { assigneeIds: [me], completedAt: '2026-11-04T08:00:00Z' }), // heute erledigt
    mk('d2', '2026-11-03T06:00:00Z', { assigneeIds: [me], completedAt: '2026-11-03T20:00:00Z' }), // gestern
    mk('d3', '2026-11-04T06:00:00Z', { assigneeIds: ['ben'], completedAt: '2026-11-04T08:00:00Z' }), // fremd
  ];

  it('fällig heute, überfällig und heute erledigt, nur Karten, die mir zugewiesen sind', () => {
    expect(taskStats([...open, ...done], me, NOW, TZ)).toEqual({ today: 1, overdue: 2, done: 1 });
  });

  it('ohne Person alles null', () => {
    expect(taskStats([...open, ...done], null, NOW, TZ)).toEqual({ today: 0, overdue: 0, done: 0 });
  });

  it('„heute erledigt" zählt nach dem Tag in der Zeitzone des Haushalts', () => {
    const c = mk('x', '2026-11-04T06:00:00Z', { assigneeIds: [me], completedAt: '2026-11-04T23:10:00Z' }); // 00:10 am 05.11. Berlin
    expect(taskStats([c], me, Date.parse('2026-11-04T23:30:00Z'), TZ).done).toBe(1);
    expect(taskStats([c], me, Date.parse('2026-11-04T22:30:00Z'), TZ).done).toBe(0);
  });
});

describe('parseTasksView: gemerkte Ansicht', () => {
  it('Liste ist der Standard, gemerkte Kalenderansichten bleiben lesbar', () => {
    expect(parseTasksView(null)).toBe('list');
    expect(parseTasksView('unsinn')).toBe('list');
    for (const v of ['list', 'day', 'week', 'month'] as const) expect(parseTasksView(v)).toBe(v);
  });
});

describe('nudgesToMe: das Stups-Banner oben', () => {
  const n = (id: string, fromId: string, toId: string) => ({ id, fromId, toId, delivered: true });
  const cards = [
    mk('a', '2026-11-04T17:00:00Z', { openNudges: [n('1', 'conny', 'anna'), n('2', 'ben', 'anna')] }),
    mk('b', '2026-11-05T17:00:00Z', { openNudges: [n('3', 'conny', 'ben')] }),
    mk('c', '2026-11-05T17:00:00Z', { openNudges: [n('4', 'anna', 'conny')] }),
    mk('d', '2026-11-06T17:00:00Z', { openNudges: [n('5', 'conny', 'anna')], completedAt: '2026-11-06T18:00:00Z' }),
    mk('e', '2026-11-06T17:00:00Z', { openNudges: [n('6', 'conny', 'anna')] }),
  ];
  it('Karten mit einem offenen Stups an mich, mit den Absendern ohne Doppelte; Erledigtes nicht', () => {
    expect(nudgesToMe(cards, 'anna').map((x) => [x.card.id, x.fromIds])).toEqual([
      ['a', ['conny', 'ben']],
      ['e', ['conny']],
    ]);
  });
  it('ohne Person oder ohne Stups nichts', () => {
    expect(nudgesToMe(cards, null)).toEqual([]);
    expect(nudgesToMe(cards, 'nobody')).toEqual([]);
    expect(nudgesToMe([mk('x', '2026-11-04T17:00:00Z', { openNudges: undefined })], 'anna')).toEqual([]);
  });
});
