import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../src/lib/api';
import { describeActivity } from '../src/lib/activity';

const NOW = Date.parse('2026-10-30T10:00:00Z');
const TZ = 'Europe/Berlin';
const entry = (e: Partial<ActivityEntry> & Pick<ActivityEntry, 'kind'>): ActivityEntry => ({
  id: 'x',
  at: '2026-10-30T09:05:00Z',
  byName: 'Conny',
  ...e,
});

describe('describeActivity', () => {
  it('Angelegt', () => {
    expect(describeActivity(entry({ kind: 'created' }), NOW, TZ)).toEqual({
      title: 'Angelegt',
      detail: 'heute 10:05 · Conny',
    });
  });

  it('Aus Wiederholung angelegt', () => {
    expect(describeActivity(entry({ kind: 'repeated' }), NOW, TZ)).toEqual({
      title: 'Aus Wiederholung angelegt',
      detail: 'heute 10:05 · Conny',
    });
  });

  it('Erledigt, auch per Push', () => {
    expect(describeActivity(entry({ kind: 'completed' }), NOW, TZ).title).toBe('Erledigt');
    expect(describeActivity(entry({ kind: 'completed', source: 'push' }), NOW, TZ).detail).toBe(
      'heute 10:05 · Conny (per Push)',
    );
  });

  it('Verschoben nennt Von und Nach', () => {
    expect(describeActivity(entry({ kind: 'moved', from: 'Offen', to: 'In Arbeit' }), NOW, TZ)).toEqual({
      title: 'Verschoben: Offen → In Arbeit',
      detail: 'heute 10:05 · Conny',
    });
  });

  it('Wieder geöffnet nennt die Spalte', () => {
    expect(describeActivity(entry({ kind: 'reopened', to: 'Offen' }), NOW, TZ).title).toBe('Wieder geöffnet: Offen');
    expect(describeActivity(entry({ kind: 'reopened', to: null }), NOW, TZ).title).toBe('Wieder geöffnet');
  });

  it('Termin geändert, gesetzt und entfernt', () => {
    const changed = entry({ kind: 'due', from: '2026-10-30T12:00:00Z', to: '2026-10-31T15:00:00Z' });
    expect(describeActivity(changed, NOW, TZ).title).toBe('Termin: heute 13:00 → morgen 16:00');
    expect(describeActivity(entry({ kind: 'due', from: null, to: '2026-10-31T15:00:00Z' }), NOW, TZ).title).toBe(
      'Termin gesetzt: morgen 16:00',
    );
    expect(describeActivity(entry({ kind: 'due', from: '2026-10-31T15:00:00Z', to: null }), NOW, TZ).title).toBe(
      'Termin entfernt',
    );
  });

  it('ohne Person steht nur die Zeit', () => {
    expect(describeActivity(entry({ kind: 'created', byName: null }), NOW, TZ).detail).toBe('heute 10:05');
  });
});
