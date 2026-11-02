import { describe, expect, it } from 'vitest';
import { describeActivity } from '../src/lib/activity';
import type { ActivityEntry } from '../src/lib/api';
import { dayNumber, rangeTitle, weekdayShort } from '../src/lib/calendar';
import { formatCost, formatCreated, formatDue, formatLead, parseCost } from '../src/lib/datetime';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { sentMessage, targetHint } from '../src/lib/nudge';
import { noteText } from '../src/lib/watchers';
import { dayLabel, groupByDay } from '../src/lib/schedule';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-02T10:00:00Z'); // Montag

describe('Zeiten auf Englisch (24 Stunden)', () => {
  it('formatDue', () => {
    setLanguage('en');
    expect(formatDue('2026-11-02T18:00:00Z', NOW, TZ)).toBe('today 19:00');
    expect(formatDue('2026-11-03T18:00:00Z', NOW, TZ)).toBe('tomorrow 19:00');
    expect(formatDue('2026-11-01T18:00:00Z', NOW, TZ)).toBe('yesterday 19:00');
    expect(formatDue('2026-11-05T18:00:00Z', NOW, TZ)).toBe('Thu 19:00');
    expect(formatDue('2026-12-01T18:00:00Z', NOW, TZ)).toBe('1 Dec 19:00');
    expect(formatDue('2027-01-05T18:00:00Z', NOW, TZ)).toBe('5 Jan 2027 19:00');
  });

  it('formatDue auf Deutsch bleibt, wie es war', () => {
    expect(formatDue('2026-11-02T18:00:00Z', NOW, TZ)).toBe('heute 19:00');
    expect(formatDue('2026-12-01T18:00:00Z', NOW, TZ)).toBe('1. Dez 19:00');
  });

  it('formatLead mit Mehrzahl', () => {
    setLanguage('en');
    expect(formatLead(1440)).toBe('1 day');
    expect(formatLead(2880)).toBe('2 days');
    expect(formatLead(120)).toBe('2 h');
    expect(formatLead(45)).toBe('45 min');
    setLanguage('de');
    expect(formatLead(1440)).toBe('1 Tag');
    expect(formatLead(2880)).toBe('2 Tage');
    expect(formatLead(120)).toBe('2 Std.');
    expect(formatLead(45)).toBe('45 Min.');
  });

  it('formatCreated', () => {
    setLanguage('en');
    expect(formatCreated('2026-11-02T08:00:00Z', NOW, TZ)).toBe('today');
    expect(formatCreated('2026-11-01T08:00:00Z', NOW, TZ)).toBe('yesterday');
    expect(formatCreated('2026-10-30T08:00:00Z', NOW, TZ)).toBe('3 days ago');
    expect(formatCreated('2026-10-20T08:00:00Z', NOW, TZ)).toBe('20 Oct');
  });
});

describe('Kosten', () => {
  it('Anzeige: Euro in beiden Formaten', () => {
    setLanguage('en');
    expect(formatCost(16990)).toBe('€169.90');
    setLanguage('de');
    expect(formatCost(16990).replace(/\s/g, ' ')).toBe('169,90 €');
  });

  it('Eingabe: Punkt oder Komma als Dezimalzeichen, das letzte Zeichen entscheidet', () => {
    expect(parseCost('4.200,50')).toBe(420050);
    expect(parseCost('4,200.50')).toBe(420050);
    expect(parseCost('4200.5')).toBe(420050);
    expect(parseCost('19,99 €')).toBe(1999);
    expect(parseCost('')).toBeNull();
    expect(parseCost('abc')).toBeNaN();
  });
});

describe('Kalender auf Englisch', () => {
  it('Kopfzeile und Wochentage', () => {
    setLanguage('en');
    expect(rangeTitle('month', '2026-11-02')).toBe('November 2026');
    expect(rangeTitle('day', '2026-11-02')).toBe('Mon 2 Nov 2026');
    expect(rangeTitle('week', '2026-11-04')).toBe('2–8 Nov 2026');
    expect(rangeTitle('week', '2026-11-30')).toBe('30 Nov – 6 Dec 2026');
    expect(weekdayShort('2026-11-02')).toBe('Mon');
    expect(dayNumber('2026-11-02')).toBe(2);
  });

  it('Deutsch bleibt', () => {
    expect(rangeTitle('day', '2026-11-02')).toBe('Mo 2. Nov 2026');
    expect(rangeTitle('week', '2026-11-04')).toBe('2.–8. Nov 2026');
  });
});

describe('Agenda auf Englisch', () => {
  const card = (id: string, dueAt: string) => ({ id, dueAt, completedAt: null }) as never;

  it('Abschnitte und Zähler', () => {
    setLanguage('en');
    const sections = groupByDay([card('a', '2026-11-01T08:00:00Z'), card('b', '2026-11-02T18:00:00Z'), card('c', '2026-11-02T19:00:00Z'), card('d', '2026-11-03T18:00:00Z')], NOW, TZ);
    expect(sections.map((s) => [s.title, s.sub])).toEqual([
      ['Overdue', '1 card'],
      ['Today', 'Mon 2 Nov · 2 cards'],
      ['Tomorrow', 'Tue 3 Nov · 1 card'],
    ]);
    expect(dayLabel('2026-10-31', '2026-11-02')).toBe('Sat 31 Oct');
    expect(dayLabel('2027-01-02', '2026-11-02')).toBe('Sat 2 Jan 2027');
  });
});

describe('Verlauf auf Englisch', () => {
  const e = (extra: Partial<ActivityEntry>): ActivityEntry => ({ id: 'x', kind: 'created', at: '2026-11-02T18:00:00Z', byName: 'Anna', ...extra }) as ActivityEntry;

  it('Überschriften', () => {
    setLanguage('en');
    const d = (x: Partial<ActivityEntry>) => describeActivity(e(x), NOW, TZ);
    expect(d({ kind: 'created' })).toEqual({ title: 'Created', detail: 'today 19:00 · Anna' });
    expect(d({ kind: 'completed', source: 'push' }).detail).toBe('today 19:00 · Anna (via push)');
    expect(d({ kind: 'moved', from: 'Open', to: 'Doing' }).title).toBe('Moved: Open → Doing');
    expect(d({ kind: 'nudged', to: 'Ben', text: 'Are you on it?' }).title).toBe('Nudged: Ben · Are you on it?');
    expect(d({ kind: 'due', from: null, to: '2026-11-03T18:00:00Z' }).title).toBe('Due date set: tomorrow 19:00');
    expect(d({ kind: 'due', from: '2026-11-03T18:00:00Z', to: null }).title).toBe('Due date removed');
    expect(d({ kind: 'reopened', to: 'Open' }).title).toBe('Reopened: Open');
  });
});

describe('Notizen der Läufe', () => {
  it('bekannte Notizen werden übersetzt, alte und fremde bleiben, wie sie sind', () => {
    setLanguage('en');
    expect(noteText('erste Person zu Hause')).toBe('first person at home');
    expect(noteText('Sperrzeit 10 Min.')).toBe('Lock time 10 min');
    expect(noteText('2 von 3')).toBe('2 of 3');
    expect(noteText('3 Auslösungen seit dem letzten Zurücksetzen')).toBe('3 triggers since the last reset');
    expect(noteText('nach 60 Min.')).toBe('after 60 min');
    expect(noteText('Zeitüberschreitung bei Home Assistant')).toBe('Zeitüberschreitung bei Home Assistant');
    expect(noteText(null)).toBe('');
    setLanguage('de');
    expect(noteText('erste Person zu Hause')).toBe('erste Person zu Hause');
    expect(noteText('2 von 3')).toBe('2 von 3');
  });
});

describe('Stupsen auf Englisch', () => {
  it('Hinweise', () => {
    setLanguage('en');
    expect(targetHint({ reason: 'no_device' } as never, TZ)).toBe('has no push device');
    expect(targetHint({ reason: 'rate', retryAt: '2026-11-02T13:32:00Z' } as never, TZ)).toBe('again from 14:32');
    expect(targetHint({ deliverAt: '2026-11-03T06:30:00Z' } as never, TZ)).toBe('delivered at 07:30');
    const msg = sentMessage({ sent: [{ to: 'b', status: 'queued', deliverAt: '2026-11-03T06:30:00Z' }], skipped: [] } as never, () => 'Ben', TZ);
    expect(msg).toBe('Nudged! Ben will get it at 07:30.');
  });
});
