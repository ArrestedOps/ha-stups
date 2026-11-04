import { describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { inboxFilters, inboxItems, type InboxInput } from '../src/lib/inbox';
import type { ScheduleCard } from '../src/lib/schedule';
import type { TodayCard } from '../src/lib/api';

const ME = 'me';
const names: Record<string, string> = { me: 'Anna', ben: 'Ben', conny: 'Conny', kid: 'Mia' };
const sched = (id: string, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({ id, title: `Karte ${id}`, boardId: 'b', boardName: 'Haushalt', completedAt: null, assigneeIds: [], openNudges: [], confirmRequestedAt: null, confirmRequestedBy: null, updatedAt: '2026-11-04T08:00:00Z', ...extra }) as unknown as ScheduleCard;
const house = (id: string, extra: Partial<TodayCard> = {}): TodayCard =>
  ({ id, title: `Haus ${id}`, boardId: 'b', boardName: 'Haushalt', dueAt: null, assigneeIds: [], watcherId: 'w', watcherName: 'Waschmaschine fertig', createdAt: '2026-11-04T09:00:00Z', why: null, ...extra }) as TodayCard;
const input = (extra: Partial<InboxInput> = {}): InboxInput => ({
  open: [],
  house: [],
  meId: ME,
  isChild: false,
  mayConfirm: () => true,
  nameOf: (id) => names[id] ?? '?',
  ...extra,
});

describe('inboxItems: was ohne neue Server-Teile für mich offen ist', () => {
  it('ohne alles: leer, kein Punkt', () => {
    expect(inboxItems(input())).toEqual([]);
  });

  it('offene Stupse an mich, mit den Absendern, ohne Doppelte', () => {
    const open = [
      sched('a', { openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }, { id: '2', fromId: 'ben', toId: ME, delivered: true }, { id: '3', fromId: 'conny', toId: ME, delivered: true }] }),
      sched('b', { openNudges: [{ id: '4', fromId: 'ben', toId: 'conny', delivered: true }] }), // an eine andere Person
    ];
    const items = inboxItems(input({ open }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'nudge', cardId: 'a', title: 'Ben, Conny stupst dich! 👋', sub: 'Karte a' });
  });

  it('erledigte Karten zählen nicht', () => {
    const open = [sched('a', { completedAt: '2026-11-04T08:00:00Z', openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }] })];
    expect(inboxItems(input({ open }))).toEqual([]);
  });

  it('Karten vom Haus, die auf mich warten: schon meine oder noch ohne Zuständige', () => {
    const items = inboxItems(input({ house: [house('h1', { assigneeIds: [ME] }), house('h2'), house('h3', { assigneeIds: ['ben'] })] }));
    expect(items.map((i) => [i.kind, i.cardId])).toEqual([['house', 'h1'], ['house', 'h2']]); // h3 gehört Ben
    expect(items[0]!.title).toBe('Wächter: Waschmaschine fertig');
    expect(items[0]!.sub).toBe('Karte „Haus h1“ ist jetzt deine');
    expect(items[1]!.sub).toBe('„Haus h2“ sucht jemanden, der sie übernimmt');
    expect(items[0]!.since).toBe('2026-11-04T09:00:00Z');
  });

  it('Bestätigungen: nur wenn ich sie geben darf', () => {
    const open = [sched('c', { assigneeIds: ['kid'], confirmRequestedAt: '2026-11-04T07:00:00Z', confirmRequestedBy: 'kid' })];
    const yes = inboxItems(input({ open }));
    expect(yes[0]).toMatchObject({ kind: 'confirm', cardId: 'c', title: 'Mia wartet auf deine Bestätigung', sub: 'Karte c', since: '2026-11-04T07:00:00Z' });
    expect(inboxItems(input({ open, mayConfirm: () => false }))).toEqual([]);
  });

  it('ein Kind sieht nur Stupse an sich: kein Haus, keine Bestätigungen', () => {
    const open = [
      sched('a', { openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }] }),
      sched('c', { confirmRequestedAt: '2026-11-04T07:00:00Z', confirmRequestedBy: 'kid' }),
    ];
    const items = inboxItems(input({ open, house: [house('h1', { assigneeIds: [ME] })], isChild: true }));
    expect(items.map((i) => i.kind)).toEqual(['nudge']);
  });

  it('Reihenfolge: Stupse, Bestätigungen, Haus', () => {
    const open = [
      sched('c', { confirmRequestedAt: '2026-11-04T07:00:00Z', confirmRequestedBy: 'kid' }),
      sched('a', { openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }] }),
    ];
    expect(inboxItems(input({ open, house: [house('h1')] })).map((i) => i.kind)).toEqual(['nudge', 'confirm', 'house']);
  });

  it('ohne eigene Person: nichts', () => {
    expect(inboxItems(input({ meId: null, open: [sched('a', { openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }] })] }))).toEqual([]);
  });

  it('auf Englisch', () => {
    setLanguage('en');
    const items = inboxItems(input({ house: [house('h2')] }));
    expect(items[0]!.title).toBe('Watcher: Waschmaschine fertig');
  });
});

describe('inboxFilters: Chips nur für das, was da ist', () => {
  it('Alle immer, dazu je Art mit Zähler', () => {
    const items = inboxItems(input({ house: [house('h1'), house('h2')], open: [sched('a', { openNudges: [{ id: '1', fromId: 'ben', toId: ME, delivered: true }] })] }));
    expect(inboxFilters(items)).toEqual([
      { id: 'all', count: 3 },
      { id: 'nudge', count: 1 },
      { id: 'house', count: 2 },
    ]);
    expect(inboxFilters([])).toEqual([{ id: 'all', count: 0 }]);
  });
});
