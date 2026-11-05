import { describe, expect, it } from 'vitest';
import { groupArchive } from '../src/lib/archiveGroups';

const card = (id: string, completedAt: string | null, archivedAt: string | null = null) => ({ id, completedAt, archivedAt });
// Mittwoch, 29.10.2026, 12 Uhr in Berlin (die Rechneruhr läuft in UTC)
const NOW = Date.parse('2026-10-29T11:00:00Z');

describe('Archiv nach Erledigungstag', () => {
  it('„Diese Woche" ab Montag, davor je Monat, Neuestes zuerst', () => {
    const groups = groupArchive(
      [card('alt', '2026-09-30T10:00:00Z'), card('mo', '2026-10-26T06:00:00Z'), card('vorwoche', '2026-10-25T10:00:00Z'), card('mi', '2026-10-29T09:00:00Z'), card('okt1', '2026-10-02T10:00:00Z')],
      NOW,
      'Europe/Berlin',
    );
    expect(groups.map((g) => [g.key, g.items.map((c) => c.id)])).toEqual([
      ['week', ['mi', 'mo']],
      ['2026-10', ['vorwoche', 'okt1']],
      ['2026-09', ['alt']],
    ]);
    expect(groups[0]!.week).toBe(true);
  });

  it('der Montag um Mitternacht zählt in Berlin schon zur Woche, ohne Erledigungstag zählt der Archivtag', () => {
    const groups = groupArchive([card('mitternacht', '2026-10-25T23:30:00Z'), card('ohne', null, '2026-10-28T10:00:00Z')], NOW, 'Europe/Berlin');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((c) => c.id)).toEqual(['ohne', 'mitternacht']);
  });
});
