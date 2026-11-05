import { describe, expect, it } from 'vitest';
import { createLatest } from '../src/lib/latest';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe('createLatest', () => {
  it('nur die zuletzt gestartete Anfrage zählt', () => {
    const l = createLatest();
    const a = l.next();
    const b = l.next();
    expect(l.isCurrent(a)).toBe(false);
    expect(l.isCurrent(b)).toBe(true);
  });

  it('run: eine langsame alte Antwort überschreibt die neuere nicht', async () => {
    const l = createLatest();
    const slow = deferred<string>();
    const first = l.run(() => slow.promise);
    const second = await l.run(async () => 'neu');
    slow.resolve('alt');
    expect(second).toEqual({ current: true, value: 'neu' });
    expect(await first).toEqual({ current: false });
  });

  it('run: die alte Anfrage wird abgebrochen, ihr Fehler wirft nicht', async () => {
    const l = createLatest();
    let aborted = false;
    const first = l.run(
      (signal) =>
        new Promise<string>((_res, rej) =>
          signal.addEventListener('abort', () => {
            aborted = true;
            rej(new DOMException('abgebrochen', 'AbortError'));
          }),
        ),
    );
    await l.run(async () => 'neu');
    expect(aborted).toBe(true);
    expect(await first).toEqual({ current: false });
  });

  it('run: ein Fehler der aktuellen Anfrage wird weitergegeben', async () => {
    const l = createLatest();
    await expect(l.run(async () => Promise.reject(new Error('kaputt')))).rejects.toThrow('kaputt');
  });
});
