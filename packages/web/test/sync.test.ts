import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSync, type SyncInfo, type SyncEnv } from '../src/lib/sync';

/** Ein WebSocket zum Steuern: Der Test öffnet, schickt Meldungen und schließt von Hand */
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}

let visible: (() => void) | null;
let changes: (SyncInfo | undefined)[];
let online: boolean[];

const env: SyncEnv = {
  create: (url) => new FakeSocket(url) as unknown as WebSocket,
  url: () => 'ws://stups.test/api/events',
  onVisible: (cb) => void (visible = cb),
};
const sockets = () => FakeSocket.all;
const live = () => sockets().filter((s) => s.readyState <= 1);

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  visible = null;
  changes = [];
  online = [];
  startSync((i) => changes.push(i), (o) => online.push(o), env);
});
afterEach(() => vi.useRealTimers());

describe('Live-Sync: Verbindung', () => {
  it('nach Verbindungsabbruch und Rückkehr in die App gibt es nur eine Verbindung', () => {
    const a = sockets()[0]!;
    a.open();
    a.say({ type: 'hello', seq: 10 });
    a.close(); // iPhone gesperrt: onclose plant die Neuverbindung
    visible!(); // entsperrt vor Ablauf des Timers
    vi.advanceTimersByTime(20_000); // der geplante Timer feuert
    expect(live()).toHaveLength(1);
    expect(sockets()).toHaveLength(2);
  });

  it('mehrfaches Sichtbarwerden und Abbrüche erzeugen keine weiteren Verbindungen', () => {
    sockets()[0]!.open();
    for (let i = 0; i < 5; i++) {
      live().forEach((s) => s.close());
      visible!();
      visible!();
      vi.advanceTimersByTime(30_000);
      live()[0]?.open();
    }
    expect(live()).toHaveLength(1);
  });

  it('eine verwaiste Verbindung meldet nicht „offline“, solange die aktuelle offen ist', () => {
    const a = sockets()[0]!;
    a.open();
    a.close();
    visible!();
    const b = live()[0]!;
    b.open();
    online.length = 0;
    a.onclose?.(); // ein spätes onclose des alten Sockets
    expect(online).toEqual([]);
    expect(live()).toEqual([b]);
  });

  it('die Nummerierung wird nur von der aktuellen Verbindung gezählt: keine falsche Lücke', () => {
    const a = sockets()[0]!;
    a.open();
    a.say({ type: 'hello', seq: 1 });
    a.close();
    visible!();
    vi.advanceTimersByTime(20_000);
    const b = live()[0]!;
    b.open();
    b.say({ type: 'hello', seq: 5 });
    changes.length = 0;
    b.say({ type: 'changed', seq: 6, changes: { full: false, cards: ['x'] } });
    b.say({ type: 'changed', seq: 7, changes: { full: false, cards: ['y'] } });
    expect(changes.map((c) => c?.gap)).toEqual([false, false]);
  });

  it('nach dem Wiederverbinden wird alles neu geladen, beim ersten Verbinden nicht', () => {
    const a = sockets()[0]!;
    a.open();
    a.say({ type: 'hello', seq: 1 });
    expect(changes).toEqual([]);
    a.close();
    vi.advanceTimersByTime(20_000);
    const b = live()[0]!;
    b.open();
    b.say({ type: 'hello', seq: 1 });
    expect(changes).toEqual([undefined]);
  });

  it('der Abstand zwischen Versuchen wächst bis 15 Sekunden', () => {
    let s = sockets()[0]!;
    s.close();
    vi.advanceTimersByTime(999);
    expect(sockets()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets()).toHaveLength(2);
    for (let i = 0; i < 8; i++) {
      s = sockets().at(-1)!;
      s.close();
      vi.advanceTimersByTime(15_000);
    }
    expect(live().length).toBeLessThanOrEqual(1);
  });
});
