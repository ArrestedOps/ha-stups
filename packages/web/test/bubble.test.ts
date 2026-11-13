import { describe, expect, it } from 'vitest';
import { bubbleCounts, bubbleYaml, todaySensor } from '../src/lib/bubble';

// Donnerstag, 05.11.2026, 12:00 in Berlin (Rechner in UTC)
const NOW = Date.parse('2026-11-05T11:00:00Z');
const card = (dueAt: string | null, completedAt: string | null = null) => ({ dueAt, completedAt });

describe('Dashboard-Button', () => {
  it('zählt heute fällige (noch nicht vergangene) und überfällige offene Aufgaben', () => {
    const c = bubbleCounts(
      [
        card('2026-11-05T09:00:00Z'), // 10:00 Berlin: überfällig
        card('2026-11-05T15:00:00Z'), // 16:00 heute
        card('2026-11-05T22:30:00Z'), // 23:30 heute
        card('2026-11-05T23:30:00Z'), // 00:30 morgen
        card('2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z'), // erledigt
        card(null),
      ],
      NOW,
      'Europe/Berlin',
    );
    expect(c).toEqual({ today: 2, overdue: 1 });
  });

  it('Sensorname: Beta hat eigene Namen (channel.ts)', () => {
    expect(todaySensor('stable')).toBe('sensor.stups_heute_faellig');
    expect(todaySensor(undefined)).toBe('sensor.stups_heute_faellig');
    expect(todaySensor('beta')).toBe('sensor.stups_beta_heute_faellig');
  });

  it('YAML mit Sensor und Panel-Pfad', () => {
    const y = bubbleYaml({ panelPath: '/c552c524_stups_beta', channel: 'beta' });
    expect(y).toContain('entity: sensor.stups_beta_heute_faellig');
    expect(y).toContain('navigation_path: /c552c524_stups_beta');
    expect(bubbleYaml({ panelPath: null })).toContain('/<panel-pfad>');
  });
});
