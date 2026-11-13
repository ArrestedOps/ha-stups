import { describe, expect, it } from 'vitest';
import { shiftBatch, undoShifts, type ShiftRecord } from '../src/lib/undoShift';

/**
 * „Rückgängig" nach „Überfällige verschieben": zurückgesetzt wird nur, was noch so dasteht, wie die Aktion es hinterlassen hat.
 * Hat jemand inzwischen einen anderen Termin gesetzt, bleibt die neuere Entscheidung; ein Fehler bei einer Aufgabe bricht die anderen nicht ab.
 */
const rec = (id: string, from: string, to: string): ShiftRecord => ({ id, title: `Aufgabe ${id}`, from, to });

/** Ein Server aus dem Speicher: Aufgaben mit Termin und Version, `update` prüft die Vorbedingung wie der echte */
function fake(cards: Record<string, { dueAt: string | null; version: number }>, opts: { failOn?: string; raceOn?: string } = {}) {
  const calls: { id: string; dueAt: string; expectedVersion: number }[] = [];
  return {
    calls,
    cards,
    io: {
      card: async (id: string) => {
        if (!cards[id]) throw Object.assign(new Error('weg'), { status: 404 });
        return { ...cards[id]! };
      },
      update: async (id: string, p: { dueAt: string; expectedVersion: number }) => {
        if (id === opts.failOn) throw Object.assign(new Error('kaputt'), { status: 500 });
        if (id === opts.raceOn) cards[id]!.version += 1; // jemand war zwischen Lesen und Schreiben schneller
        if (p.expectedVersion !== cards[id]!.version) throw Object.assign(new Error('geändert'), { status: 409 });
        calls.push({ id, ...p });
        cards[id] = { dueAt: p.dueAt, version: cards[id]!.version + 1 };
      },
    },
  };
}

describe('undoShifts', () => {
  const A = rec('a', '2026-11-01T09:00:00.000Z', '2026-11-04T09:00:00.000Z');
  const B = rec('b', '2026-11-02T09:00:00.000Z', '2026-11-04T10:00:00.000Z');

  it('stellt die alten Termine wieder her, wenn alles noch so dasteht, und schreibt mit der gelesenen Version', async () => {
    const s = fake({ a: { dueAt: '2026-11-04T09:00:00Z', version: 3 }, b: { dueAt: '2026-11-04T10:00:00.000Z', version: 5 } });
    const r = await undoShifts([A, B], s.io);
    expect(r).toEqual({ restored: [A, B], conflicts: [], failed: 0 });
    expect(s.calls).toEqual([
      { id: 'a', dueAt: A.from, expectedVersion: 3 },
      { id: 'b', dueAt: B.from, expectedVersion: 5 },
    ]);
  });

  it('hat jemand inzwischen einen anderen Termin gesetzt, bleibt dessen Entscheidung; die übrigen werden trotzdem zurückgesetzt', async () => {
    const s = fake({ a: { dueAt: '2026-11-09T09:00:00.000Z', version: 4 }, b: { dueAt: B.to, version: 5 } });
    const r = await undoShifts([A, B], s.io);
    expect(r).toEqual({ restored: [B], conflicts: [A], failed: 0 });
    expect(s.cards['a']).toEqual({ dueAt: '2026-11-09T09:00:00.000Z', version: 4 }); // unberührt
  });

  it('wurde die Aufgabe zwischen Lesen und Schreiben geändert (409), zählt das als Konflikt, nicht als Fehler', async () => {
    const s = fake({ a: { dueAt: A.to, version: 1 }, b: { dueAt: B.to, version: 1 } }, { raceOn: 'a' });
    const r = await undoShifts([A, B], s.io);
    expect(r).toEqual({ restored: [B], conflicts: [A], failed: 0 });
  });

  it('ein Fehler bei einer Aufgabe bricht die anderen nicht ab (Teilerfolg), eine gelöschte Aufgabe zählt als Fehler', async () => {
    const C = rec('c', '2026-11-03T09:00:00.000Z', '2026-11-04T11:00:00.000Z');
    const s = fake({ a: { dueAt: A.to, version: 1 }, c: { dueAt: C.to, version: 1 } }, { failOn: 'a' });
    const r = await undoShifts([A, B, C], s.io); // b gibt es nicht mehr
    expect(r.restored).toEqual([C]);
    expect(r.conflicts).toEqual([]);
    expect(r.failed).toBe(2);
  });

  it('eine Aufgabe ohne Termin ist inzwischen geändert worden: Konflikt', async () => {
    const s = fake({ a: { dueAt: null, version: 2 } });
    expect(await undoShifts([A], s.io)).toEqual({ restored: [], conflicts: [A], failed: 0 });
  });
});

describe('shiftBatch (Überfällige verschieben mit der gesehenen Version)', () => {
  const NOW = Date.parse('2026-11-11T12:00:00.000Z');
  const items = [
    { id: 'a', title: 'A', dueAt: '2026-11-05T09:00:00.000Z', version: 3 },
    { id: 'b', title: 'B', dueAt: '2026-11-06T09:00:00.000Z', version: 7 },
  ];

  it('schreibt jede Aufgabe mit der Version, die die Liste gesehen hat, als Vorbedingung', async () => {
    const calls: { id: string; patch: { dueAt: string; expectedVersion?: number } }[] = [];
    const r = await shiftBatch(items, 'tomorrow', NOW, async (id, patch) => void calls.push({ id, patch }));
    expect(r.failed).toBe(0);
    expect(r.moved.map((m) => m.id)).toEqual(['a', 'b']);
    expect(calls.map((c) => [c.id, c.patch.expectedVersion])).toEqual([
      ['a', 3],
      ['b', 7],
    ]);
  });

  it('eine Aufgabe, die inzwischen jemand geändert hat (409), bleibt, wie sie ist; die übrigen werden verschoben', async () => {
    const r = await shiftBatch(items, 'tomorrow', NOW, async (id) => {
      if (id === 'a') throw Object.assign(new Error('geändert'), { status: 409 });
    });
    expect(r.moved.map((m) => m.id)).toEqual(['b']);
    expect(r.failed).toBe(1);
    expect((r.first as { status: number }).status).toBe(409);
  });

  it('ohne bekannte Version wird ohne Vorbedingung geschrieben (wie bisher)', async () => {
    const seen: unknown[] = [];
    await shiftBatch([{ id: 'c', title: 'C', dueAt: '2026-11-05T09:00:00.000Z' }], 'today', NOW, async (_id, patch) => void seen.push(patch));
    expect(Object.keys(seen[0] as object)).toEqual(['dueAt']);
  });

  it('schlägt alles fehl, steht nichts als verschoben da und der erste Fehler ist zur Hand', async () => {
    const r = await shiftBatch(items, 'weekend', NOW, async () => {
      throw new Error('kaputt');
    });
    expect(r.moved).toEqual([]);
    expect(r.failed).toBe(2);
    expect((r.first as Error).message).toBe('kaputt');
  });
});
