import { describe, expect, it } from 'vitest';
import {
  addDays,
  cardsByDay,
  columnForNew,
  inMonth,
  layoutDay,
  mondayOf,
  minutesOfDay,
  monthGrid,
  rangeFor,
  rangeTitle,
  slotIso,
  step,
  visibleDays,
  weekDays,
} from '../src/lib/calendar';
import type { ScheduleCard } from '../src/lib/schedule';

const TZ = 'Europe/Berlin';
const mk = (id: string, dueAt: string): ScheduleCard => ({ id, dueAt, boardId: 'b', boardName: 'B', boardColor: null, completedAt: null, assigneeIds: [] }) as unknown as ScheduleCard;

describe('Tage und Wochen', () => {
  it('addDays rechnet über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('die Woche beginnt am Montag', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // Sonntag
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(weekDays('2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('der Monatsraster deckt den Monat in ganzen Wochen ab', () => {
    const g = monthGrid('2026-11-15');
    expect(g).toHaveLength(6); // 1.11.2026 ist ein Sonntag, der 30.11. ein Montag
    expect(g[0]![0]).toBe('2026-10-26');
    expect(g[5]![6]).toBe('2026-12-06');
    expect(g.flat().filter((d) => inMonth(d, '2026-11-15'))).toHaveLength(30);
    expect(monthGrid('2026-02-10')).toHaveLength(5);
  });
});

describe('step und Titel', () => {
  it('Tag, Woche und Monat', () => {
    expect(step('day', '2026-11-01', 1)).toBe('2026-11-02');
    expect(step('week', '2026-11-01', -1)).toBe('2026-10-25');
    expect(step('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(step('month', '2026-03-31', -1)).toBe('2026-02-28');
    expect(step('month', '2026-12-15', 1)).toBe('2027-01-15');
  });

  it('Titel der Kopfzeile', () => {
    expect(rangeTitle('month', '2026-11-15')).toBe('November 2026');
    expect(rangeTitle('day', '2026-11-05')).toBe('Do 5. Nov 2026');
    expect(rangeTitle('week', '2026-11-04')).toBe('2.–8. Nov 2026');
    expect(rangeTitle('week', '2026-10-28')).toBe('26. Okt – 1. Nov 2026');
  });
});

describe('Zeitraum und Zeitpunkte', () => {
  it('rangeFor: von 00:00 des ersten bis 00:00 nach dem letzten Tag, in Ortszeit', () => {
    expect(rangeFor('day', '2026-11-05', TZ)).toEqual({ from: '2026-11-04T23:00:00.000Z', to: '2026-11-05T23:00:00.000Z' });
    const w = rangeFor('week', '2026-11-04', TZ);
    expect(w.from).toBe('2026-11-01T23:00:00.000Z');
    expect(w.to).toBe('2026-11-08T23:00:00.000Z');
  });

  it('Sommerzeit: der Tag der Umstellung ist 25 Stunden lang', () => {
    const r = rangeFor('day', '2026-10-25', TZ);
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(25 * 3600_000);
  });

  it('visibleDays', () => {
    expect(visibleDays('day', '2026-11-05')).toEqual(['2026-11-05']);
    expect(visibleDays('week', '2026-11-05')).toHaveLength(7);
    expect(visibleDays('month', '2026-11-05')).toHaveLength(42);
  });

  it('minutesOfDay und slotIso sind Gegenstücke, gerundet auf 15 Minuten', () => {
    expect(minutesOfDay('2026-11-05T08:15:00Z', TZ)).toBe(9 * 60 + 15);
    expect(slotIso('2026-11-05', 9 * 60 + 15, TZ)).toBe('2026-11-05T08:15:00.000Z');
    expect(slotIso('2026-11-05', 9 * 60 + 22, TZ)).toBe('2026-11-05T08:15:00.000Z');
    expect(slotIso('2026-11-05', 9 * 60 + 23, TZ)).toBe('2026-11-05T08:30:00.000Z');
    expect(slotIso('2026-11-05', 24 * 60, TZ)).toBe('2026-11-05T22:45:00.000Z'); // nie über den Tag hinaus
  });

  it('cardsByDay gruppiert nach Ortstag und sortiert nach Zeit', () => {
    const m = cardsByDay([mk('spät', '2026-11-05T20:00:00Z'), mk('früh', '2026-11-05T07:00:00Z'), mk('nacht', '2026-11-05T23:30:00Z')], TZ);
    expect([...m.keys()]).toEqual(['2026-11-05', '2026-11-06']);
    expect(m.get('2026-11-05')!.map((c) => c.id)).toEqual(['früh', 'spät']);
    expect(m.get('2026-11-06')!.map((c) => c.id)).toEqual(['nacht']);
  });
});

describe('columnForNew', () => {
  const cols = [
    { id: 'plan', isDone: false, isPlanned: true },
    { id: 'offen', isDone: false, isPlanned: false },
    { id: 'fertig', isDone: true, isPlanned: false },
  ];
  it('Termin nach heute → Geplant, sonst Offen', () => {
    expect(columnForNew(cols, true)).toBe('plan');
    expect(columnForNew(cols, false)).toBe('offen');
  });
  it('ohne Geplant-Spalte immer Offen', () => {
    expect(columnForNew(cols.slice(1), true)).toBe('offen');
  });
});

describe('layoutDay', () => {
  it('einzelne Karten stehen voll breit auf ihrer Uhrzeit', () => {
    const p = layoutDay([mk('a', '2026-11-05T08:00:00Z')], TZ);
    expect(p).toMatchObject([{ top: 9 * 60, col: 0, cols: 1 }]);
  });

  it('überlappende Karten stehen nebeneinander', () => {
    const p = layoutDay([mk('a', '2026-11-05T08:00:00Z'), mk('b', '2026-11-05T08:15:00Z'), mk('c', '2026-11-05T08:30:00Z')], TZ);
    expect(p.map((x) => [x.card.id, x.col, x.cols])).toEqual([
      ['a', 0, 3],
      ['b', 1, 3],
      ['c', 2, 3],
    ]);
  });

  it('eine Spalte wird wiederverwendet, sobald die Karte davor zu Ende ist', () => {
    const p = layoutDay([mk('a', '2026-11-05T08:00:00Z'), mk('b', '2026-11-05T08:15:00Z'), mk('c', '2026-11-05T08:50:00Z')], TZ);
    expect(p.map((x) => [x.card.id, x.col, x.cols])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ]);
  });

  it('getrennte Gruppen teilen sich nichts', () => {
    const p = layoutDay([mk('a', '2026-11-05T08:00:00Z'), mk('b', '2026-11-05T08:10:00Z'), mk('c', '2026-11-05T12:00:00Z')], TZ);
    expect(p.find((x) => x.card.id === 'c')).toMatchObject({ col: 0, cols: 1 });
    expect(p.find((x) => x.card.id === 'a')).toMatchObject({ cols: 2 });
  });
});

describe('parseCalendarView', () => {
  it('kennt Tag, Monat und Liste; alles andere ist die Woche', async () => {
    const { parseCalendarView } = await import('../src/lib/calendar');
    expect(parseCalendarView('day')).toBe('day');
    expect(parseCalendarView('month')).toBe('month');
    expect(parseCalendarView('list')).toBe('list');
    for (const bad of [null, undefined, '', 'week', 'agenda', 'x']) expect(parseCalendarView(bad as string | null), String(bad)).toBe('week');
  });
});
