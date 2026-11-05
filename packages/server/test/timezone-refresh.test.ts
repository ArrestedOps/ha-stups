import { describe, expect, it } from 'vitest';
import { startTimeZoneRefresh } from '../src/timezone-refresh.js';

describe('Zeitzone aktuell halten', () => {
  function setup(zones: (string | Error)[]) {
    const set: string[] = [];
    const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    let connected: () => void = () => undefined;
    let calls = 0;
    const r = startTimeZoneRefresh({
      getConfig: async () => {
        const z = zones[Math.min(calls++, zones.length - 1)]!;
        if (z instanceof Error) throw z;
        return { time_zone: z };
      },
      set: (z) => void set.push(z),
      onConnected: (cb) => (connected = cb),
      setTimer: (fn, ms) => {
        const t = { fn, ms, cancelled: false };
        timers.push(t);
        return () => (t.cancelled = true);
      },
    });
    const flush = () => new Promise((res) => setImmediate(res));
    return { set, timers, connected: () => connected(), flush, r, calls: () => calls };
  }

  it('lädt beim Start, versucht es nach einem Fehler nach 30 Sekunden erneut und erneuert stündlich', async () => {
    const s = setup([new Error('weg'), 'Europe/Berlin', 'Europe/London']);
    await s.flush();
    expect(s.set).toEqual([]);
    expect(s.timers.at(-1)!.ms).toBe(30_000);
    s.timers.at(-1)!.fn();
    await s.flush();
    expect(s.set).toEqual(['Europe/Berlin']);
    expect(s.timers.at(-1)!.ms).toBe(3_600_000);
    s.timers.at(-1)!.fn(); // eine Stunde später hat sich die Zeitzone geändert
    await s.flush();
    expect(s.set).toEqual(['Europe/Berlin', 'Europe/London']);
  });

  it('lädt auch nach einer neuen Verbindung zu Home Assistant und setzt gleiche Werte nicht doppelt', async () => {
    const s = setup(['Europe/Berlin']);
    await s.flush();
    s.connected();
    await s.flush();
    expect(s.calls()).toBe(2);
    expect(s.set).toEqual(['Europe/Berlin']);
    expect(s.timers.filter((t) => !t.cancelled)).toHaveLength(1); // nur ein Zeitgeber ist aktiv
  });
});
