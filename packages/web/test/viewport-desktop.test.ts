import { describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, isDesktop, watchDesktop, type MediaWatcher } from '../src/lib/viewport';

/** Ein Fenster, dessen Breite sich ändern lässt */
function fakeMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mq: MediaWatcher = {
    matches: initial,
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
  };
  return {
    mq,
    listeners,
    set(matches: boolean) {
      mq.matches = matches;
      for (const l of [...listeners]) l({ matches });
    },
  };
}

describe('isDesktop', () => {
  it('fragt ab 1024 px Breite', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 1024px)');
    let asked = '';
    const fake = fakeMedia(true);
    expect(isDesktop((q) => ((asked = q), fake.mq))).toBe(true);
    expect(asked).toBe(DESKTOP_QUERY);
    fake.mq.matches = false;
    expect(isDesktop(() => fake.mq)).toBe(false);
  });

  it('ohne matchMedia (Server, Test) ist es nie Desktop', () => {
    expect(isDesktop(() => null)).toBe(false);
    expect(isDesktop()).toBe(false); // Node hat kein matchMedia
  });
});

describe('watchDesktop', () => {
  it('meldet sofort den Stand und danach jeden Wechsel', () => {
    const fake = fakeMedia(false);
    const seen: boolean[] = [];
    const stop = watchDesktop((d) => seen.push(d), () => fake.mq);
    expect(seen).toEqual([false]);
    fake.set(true);
    fake.set(false);
    expect(seen).toEqual([false, true, false]);
    stop();
  });

  it('hört nach stop auf und lässt keinen Beobachter zurück', () => {
    const fake = fakeMedia(true);
    const seen: boolean[] = [];
    const stop = watchDesktop((d) => seen.push(d), () => fake.mq);
    expect(fake.listeners.size).toBe(1);
    stop();
    expect(fake.listeners.size).toBe(0);
    fake.set(false);
    expect(seen).toEqual([true]);
  });

  it('ohne matchMedia: kein Fehler, stop ist leer', () => {
    const seen: boolean[] = [];
    const stop = watchDesktop((d) => seen.push(d), () => null);
    expect(() => stop()).not.toThrow();
    expect(seen).toEqual([]);
  });
});
