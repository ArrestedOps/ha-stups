import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import { agenda, loadAgenda } from '../src/lib/agenda.svelte';
import { inbox, loadInbox } from '../src/lib/inbox.svelte';

/**
 * Nachladen von Aufgaben und Glocke: Eine neuere Anfrage bricht die überholte ab (sie überträgt nichts mehr zu Ende und belegt keine
 * Verbindung), und nur die letzte schreibt ihr Ergebnis in die Ansicht.
 */
interface Pending {
  signal: AbortSignal | undefined;
  resolve: (v: unknown) => void;
}
const pending: Record<string, Pending[]> = {};
/** Eine Antwort, die erst kommt, wenn der Test es sagt, und bei Abbruch wie ein echtes `fetch` fehlschlägt */
const deferred = <T>(key: string, signal: AbortSignal | undefined): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    (pending[key] ??= []).push({ signal, resolve: resolve as (v: unknown) => void });
    signal?.addEventListener('abort', () => reject(new Error('abgebrochen')), { once: true });
  });

const card = (id: string) => ({ id, title: id, completedAt: null }) as never;

beforeEach(() => {
  for (const k of Object.keys(pending)) delete pending[k];
  vi.spyOn(api, 'today').mockImplementation((signal) => deferred('today', signal));
  vi.spyOn(api, 'schedule').mockImplementation((q, signal) => deferred(q.undated ? 'undated' : q.completedSince ? 'done' : 'open', signal));
  vi.spyOn(api, 'inbox').mockImplementation((_before, signal) => deferred('inbox', signal));
});
afterEach(() => vi.restoreAllMocks());

describe('loadAgenda', () => {
  it('eine neuere Anfrage bricht die überholte ab; nur die letzte schreibt das Ergebnis', async () => {
    const first = loadAgenda();
    const second = loadAgenda();
    const [a, b] = [pending['open']!.slice(0, 1)[0]!, pending['open']![1]!];
    expect(a.signal!.aborted).toBe(true);
    expect(b.signal!.aborted).toBe(false);
    // die überholte hätte noch geantwortet, hat aber keine Wirkung
    a.resolve([card('alt')]);
    for (const k of ['today', 'undated', 'done']) for (const p of pending[k]!) p.resolve(k === 'today' ? { stale: true } : []);
    b.resolve([card('neu')]);
    await Promise.all([first, second]);
    expect(agenda.open.map((c) => c.id)).toEqual(['neu']);
    expect(agenda.failed).toBe(false);
    expect(agenda.loaded).toBe(true);
  });

  it('ein Burst von fünf Aufrufen lässt vier Runden abbrechen: höchstens eine Runde läuft zu Ende', async () => {
    const runs = [1, 2, 3, 4, 5].map(() => loadAgenda());
    const aborted = (key: string) => pending[key]!.filter((p) => p.signal!.aborted).length;
    expect(aborted('open')).toBe(4);
    expect(aborted('done')).toBe(4);
    expect(aborted('undated')).toBe(4);
    expect(aborted('today')).toBe(4);
    for (const k of Object.keys(pending)) pending[k]![4]!.resolve(k === 'today' ? { houseCards: [] } : []);
    await Promise.all(runs);
    expect(agenda.failed).toBe(false);
  });

  it('ein Abbruch ist kein Fehler: die Ansicht zeigt nicht „Laden fehlgeschlagen", solange eine neuere Runde läuft', async () => {
    agenda.failed = false;
    const first = loadAgenda();
    const second = loadAgenda();
    await first; // die abgebrochene Runde endet, ohne etwas zu melden
    expect(agenda.failed).toBe(false);
    for (const k of Object.keys(pending)) pending[k]!.at(-1)!.resolve(k === 'today' ? { houseCards: [] } : []);
    await second;
  });

  it('ein echter Fehler der letzten Runde zeigt sich weiterhin', async () => {
    const run = loadAgenda();
    vi.mocked(api.schedule).mockRejectedValueOnce(new Error('kaputt'));
    const again = loadAgenda();
    await Promise.allSettled([run, again]);
    expect(agenda.failed).toBe(true);
  });
});

describe('loadInbox', () => {
  it('eine neuere Anfrage bricht die überholte ab', async () => {
    const first = loadInbox();
    const second = loadInbox();
    expect(pending['inbox']![0]!.signal!.aborted).toBe(true);
    expect(pending['inbox']![1]!.signal!.aborted).toBe(false);
    pending['inbox']![1]!.resolve({ items: [], seenAt: null, hasMore: false });
    await Promise.all([first, second]);
    expect(inbox.loaded).toBe(true);
    expect(inbox.failed).toBe(false);
  });
});
