import { describe, expect, it } from 'vitest';
import { nextDue as serverNextDue, type Recurrence as ServerRule } from '../../server/src/recurrence';
import { nextDue } from '../src/lib/nextDue';
import type { Recurrence } from '../src/lib/recurrence';

// Die Oberfläche rechnet Beispiele und Vorschau mit ihrer Kopie von nextDue: Sie muss dem Server auf den Tag genau entsprechen.
const RULES: Recurrence[] = [
  { type: 'fixed', freq: 'hourly', every: 1 },
  { type: 'fixed', freq: 'hourly', every: 5 },
  { type: 'fixed', freq: 'hourly', every: 3, window: { from: '08:00', to: '20:00' } },
  { type: 'fixed', freq: 'hourly', every: 1, window: { from: '06:30', to: '09:15' } },
  { type: 'fixed', freq: 'daily', every: 2 },
  { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] },
  { type: 'fixed', freq: 'weekly', every: 2, weekdays: [1, 4], lateTolerance: 2 },
  { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 },
  { type: 'fixed', freq: 'weekly', every: 1, weekdays: [7], lateTolerance: 0 },
  { type: 'fixed', freq: 'monthly', every: 1, monthDay: 31, lateTolerance: 3 },
  { type: 'fixed', freq: 'monthly', every: 3, monthDay: -1, lateTolerance: 10 },
  { type: 'fixed', freq: 'monthly', every: 1, monthDay: 15 },
  { type: 'fixed', freq: 'yearly', every: 1 },
  { type: 'after_completion', every: 4, unit: 'hours' },
  { type: 'after_completion', every: 3, unit: 'days' },
  { type: 'after_completion', every: 2, unit: 'weeks' },
  { type: 'after_completion', every: 1, unit: 'months' },
];
const DUES = ['2026-03-27T17:00:00Z', '2026-10-24T16:00:00Z', '2026-11-14T09:00:00Z', '2027-01-31T08:30:00Z', '2028-02-29T11:00:00Z'];
const OFFSETS_H = [-20, 0, 0.5, 5, 26, 50, 80, 100, 130, 24 * 9, 24 * 40];
const ZONES = ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata'];

describe('nextDue: Oberfläche und Server liefern dieselben Daten', () => {
  it('über Regeln, Termine, Verspätungen und Zeitzonen', () => {
    let n = 0;
    for (const tz of ZONES)
      for (const rule of RULES)
        for (const due of DUES)
          for (const h of OFFSETS_H) {
            const done = new Date(Date.parse(due) + h * 3_600_000).toISOString();
            const a = nextDue(rule, due, done, tz);
            const b = serverNextDue(rule as ServerRule, due, done, tz);
            if (a !== b) throw new Error(`${JSON.stringify(rule)} fällig ${due} erledigt ${done} (${tz}): Oberfläche ${a}, Server ${b}`);
            n++;
          }
    expect(n).toBeGreaterThan(2000);
  });
});
