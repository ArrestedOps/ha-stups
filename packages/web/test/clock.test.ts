import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('Minutentakt', () => {
  it('zählt jede Minute hoch und lässt sich beenden', async () => {
    vi.useFakeTimers();
    const { clock, startClock } = await import('../src/lib/clock.svelte');
    const start = clock.tick;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clock.tick).toBe(start + 1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(clock.tick).toBe(start + 3);
    const stop = startClock(); // zweiter Start ändert nichts (es läuft schon einer)
    stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(clock.tick).toBe(start + 3);
  });
});
