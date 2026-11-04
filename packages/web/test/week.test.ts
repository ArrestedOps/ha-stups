import { describe, expect, it } from 'vitest';
import { weekStrip } from '../src/lib/week';
import type { ScheduleCard } from '../src/lib/schedule';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-04T10:00:00Z'); // Mi 04.11.2026, 11:00 Berlin; Woche Mo 02.11. bis So 08.11.

const mk = (id: string, dueAt: string, extra: Partial<ScheduleCard> = {}): ScheduleCard =>
  ({ id, boardId: 'b', boardName: 'B', boardColor: null, title: id, dueAt, completedAt: null, assigneeIds: [], ...extra }) as unknown as ScheduleCard;

describe('weekStrip: die sieben Tage der Woche mit Punkten', () => {
  it('Montag bis Sonntag, heute ist markiert', () => {
    const w = weekStrip([], NOW, TZ);
    expect(w.map((d) => d.key)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(w.map((d) => d.number)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(w.filter((d) => d.today).map((d) => d.key)).toEqual(['2026-11-04']);
    expect(w.every((d) => d.dots.length === 0)).toBe(true);
  });

  it('Punkte nach Dringlichkeit: überfällig, heute noch, später, erledigt', () => {
    const w = weekStrip(
      [
        mk('a', '2026-11-03T09:00:00Z'), // Di, vorbei und offen
        mk('b', '2026-11-04T07:00:00Z'), // heute 08:00, vorbei: überfällig
        mk('c', '2026-11-04T17:00:00Z'), // heute 18:00, noch offen
        mk('d', '2026-11-06T09:00:00Z'), // Fr
        mk('e', '2026-11-02T09:00:00Z', { completedAt: '2026-11-02T10:00:00Z' }), // Mo erledigt
      ],
      NOW,
      TZ,
    );
    const by = Object.fromEntries(w.map((d) => [d.key, d.dots]));
    expect(by['2026-11-03']).toEqual(['overdue']);
    expect(by['2026-11-04']).toEqual(['overdue', 'today']);
    expect(by['2026-11-06']).toEqual(['upcoming']);
    expect(by['2026-11-02']).toEqual(['done']);
  });

  it('höchstens drei Punkte je Tag, die dringendsten zuerst', () => {
    const cards = ['06:00', '07:00', '16:00', '17:00', '18:00'].map((h, i) => mk(`k${i}`, `2026-11-04T${h}:00Z`));
    const dots = weekStrip(cards, NOW, TZ)[2]!.dots;
    expect(dots).toEqual(['overdue', 'overdue', 'today']);
  });

  it('rechnet in der Zeitzone des Haushalts: 23:30 UTC ist in Berlin schon der nächste Tag', () => {
    // Do 05.11., 00:30 Berlin = 23:30 UTC am 04.11.
    const nearMidnight = Date.parse('2026-11-04T23:30:00Z');
    const w = weekStrip([mk('x', '2026-11-05T05:00:00Z')], nearMidnight, TZ);
    expect(w.find((d) => d.today)!.key).toBe('2026-11-05');
    expect(w.find((d) => d.key === '2026-11-05')!.dots).toEqual(['today']);
    const utc = weekStrip([], nearMidnight, 'UTC');
    expect(utc.find((d) => d.today)!.key).toBe('2026-11-04');
  });

  it('am Sonntag und am Montag steht die richtige Woche da', () => {
    const sunday = Date.parse('2026-11-08T12:00:00Z');
    expect(weekStrip([], sunday, TZ)[0]!.key).toBe('2026-11-02');
    expect(weekStrip([], sunday, TZ)[6]!.today).toBe(true);
    const monday = Date.parse('2026-11-09T12:00:00Z');
    expect(weekStrip([], monday, TZ)[0]).toMatchObject({ key: '2026-11-09', today: true });
  });

  it('Karten außerhalb der Woche und ohne Termin zählen nicht', () => {
    const w = weekStrip([mk('x', '2026-11-09T08:00:00Z'), mk('y', '2026-11-01T08:00:00Z'), mk('z', null as unknown as string)], NOW, TZ);
    expect(w.every((d) => d.dots.length === 0)).toBe(true);
  });
});

describe('shortMonthTitle: „Jan 2025" über der Wochenleiste', () => {
  it('kurzer Monatsname und Jahr, in der Zeitzone des Haushalts', async () => {
    const { shortMonthTitle } = await import('../src/lib/week');
    expect(shortMonthTitle(Date.parse('2026-11-04T10:00:00Z'), 'Europe/Berlin')).toBe('Nov 2026');
    // 31.12. 23:30 UTC ist in Berlin schon der 1.1.
    expect(shortMonthTitle(Date.parse('2026-12-31T23:30:00Z'), 'Europe/Berlin')).toBe('Jan 2027');
    expect(shortMonthTitle(Date.parse('2026-03-10T10:00:00Z'), 'Europe/Berlin')).toBe('Mär 2026');
  });
  it('auf Englisch', async () => {
    const { setLanguage } = await import('../src/lib/i18n/index.svelte');
    const { shortMonthTitle } = await import('../src/lib/week');
    setLanguage('en');
    expect(shortMonthTitle(Date.parse('2026-03-10T10:00:00Z'), 'Europe/Berlin')).toBe('Mar 2026');
  });
});
