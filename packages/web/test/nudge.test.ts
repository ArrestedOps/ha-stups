import { describe, expect, it } from 'vitest';
import type { NudgeTarget } from '../src/lib/api';
import { canNudge, clock, nudgeBadge, preselected, sentMessage, targetHint } from '../src/lib/nudge';

describe('canNudge', () => {
  it('nur bei Aufgaben, die jemand anderem zugewiesen sind', () => {
    expect(canNudge({ assigneeIds: ['conny'] }, 'rene')).toBe(true);
    expect(canNudge({ assigneeIds: ['rene', 'conny'] }, 'rene')).toBe(true);
    expect(canNudge({ assigneeIds: ['rene'] }, 'rene')).toBe(false);
    expect(canNudge({ assigneeIds: [] }, 'rene')).toBe(false);
    expect(canNudge({ assigneeIds: ['conny'] }, null)).toBe(false);
  });
});

const TZ = 'Europe/Berlin';
const target = (extra: Partial<NudgeTarget> = {}): NudgeTarget => ({
  id: 'u',
  name: 'Conny',
  color: null,
  selectable: true,
  reason: null,
  retryAt: null,
  deliverAt: null,
  preselected: false,
  ...extra,
});

describe('clock', () => {
  it('zeigt die Uhrzeit in der Zeitzone', () => {
    expect(clock('2026-11-04T13:32:00Z', TZ)).toBe('14:32');
    expect(clock('2026-07-04T13:32:00Z', TZ)).toBe('15:32');
  });
});

describe('targetHint', () => {
  it('erklärt, warum jemand nicht wählbar ist', () => {
    expect(targetHint(target({ selectable: false, reason: 'no_device' }), TZ)).toBe('hat kein Push-Gerät');
    expect(targetHint(target({ selectable: false, reason: 'rate', retryAt: '2026-11-04T13:32:00Z' }), TZ)).toBe('wieder ab 14:32');
  });

  it('nennt bei Ruhezeit den Zustellzeitpunkt', () => {
    expect(targetHint(target({ deliverAt: '2026-11-05T06:00:00Z' }), TZ)).toBe('wird um 07:00 zugestellt');
  });

  it('sonst kein Hinweis', () => {
    expect(targetHint(target(), TZ)).toBeNull();
  });
});

describe('nudgeBadge', () => {
  const nudges = [
    { id: '1', fromId: 'a', toId: 'me', delivered: true },
    { id: '2', fromId: 'me', toId: 'b', delivered: false },
    { id: '3', fromId: 'c', toId: 'b', delivered: true },
  ];
  it('trennt Stupse an mich und von mir', () => {
    const b = nudgeBadge({ openNudges: nudges }, 'me');
    expect(b.toMe.map((n) => n.id)).toEqual(['1']);
    expect(b.fromMe.map((n) => n.id)).toEqual(['2']);
  });
  it('ohne Person oder Stupse ist alles leer', () => {
    expect(nudgeBadge({ openNudges: nudges }, null)).toEqual({ toMe: [], fromMe: [] });
    expect(nudgeBadge({}, 'me')).toEqual({ toMe: [], fromMe: [] });
  });
});

describe('sentMessage', () => {
  const names: Record<string, string> = { b: 'Ben', c: 'Conny' };
  const nameOf = (id: string) => names[id] ?? '?';

  it('einfach: „Gestupst!"', () => {
    expect(sentMessage({ sent: [{ nudgeId: '1', to: 'b', status: 'sent', deliverAt: '2026-11-04T10:00:00Z' }], skipped: [] }, nameOf, TZ)).toBe('Gestupst!');
  });

  it('nennt die Zustellung nach der Ruhezeit und gesperrte Empfänger', () => {
    const r = {
      sent: [{ nudgeId: '1', to: 'b', status: 'queued' as const, deliverAt: '2026-11-05T06:00:00Z' }],
      skipped: [{ to: 'c', reason: 'rate' as const, retryAt: '2026-11-04T13:32:00Z' }],
    };
    expect(sentMessage(r, nameOf, TZ)).toBe('Gestupst! Ben bekommt es um 07:00. Conny: erst wieder ab 14:32.');
  });
});

describe('preselected', () => {
  it('nimmt nur vorgeschlagene und wählbare Personen', () => {
    expect(preselected([target({ id: 'a', preselected: true }), target({ id: 'b', preselected: true, selectable: false }), target({ id: 'c' })])).toEqual(['a']);
  });
});
