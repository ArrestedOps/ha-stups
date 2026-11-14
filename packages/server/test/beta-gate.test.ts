import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createBetaGate, type BetaGate } from '../src/beta-gate.js';
import type { PushGateway, PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

let store: Store;
let sent: { userId: string; message: PushMessage }[];
let inner: PushGateway;
let anna: string;
let ben: string;

const msg: PushMessage = { title: 'T', body: 'B', tag: 't' };

beforeEach(() => {
  store = createStore(openDb(':memory:'));
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  sent = [];
  inner = {
    canReach: () => true,
    send: async (userId, message) => {
      sent.push({ userId, message });
      return true;
    },
    clear: async () => undefined,
  };
});

const gate = (enabled = true): BetaGate =>
  createBetaGate({ enabled, settings: { get: (k) => store.rawSetting(k), put: (k, v) => store.putRawSetting(k, v) }, people: () => store.people().map((p) => p.id) });

describe('Beta: Push ist zunächst aus, die Wächter laufen', () => {
  it('Vorgabe: Push aus, Wächter an', () => {
    expect(gate().state()).toEqual({ push: { mode: 'off' }, watchers: true });
  });

  it('bei „aus" geht nichts raus und niemand gilt als erreichbar', async () => {
    const g = gate();
    const push = g.gatePush(inner);
    expect(push.canReach(anna)).toBe(false);
    expect(await push.send(anna, msg)).toBe(false);
    expect(sent).toEqual([]);
  });

  it('„nur für mich" lässt nur diese Person durch', async () => {
    const g = gate();
    g.set({ push: { mode: 'only', personId: anna } });
    const push = g.gatePush(inner);
    expect(push.canReach(anna)).toBe(true);
    expect(push.canReach(ben)).toBe(false);
    expect(await push.send(anna, msg)).toBe(true);
    expect(await push.send(ben, msg)).toBe(false);
    expect(sent.map((s) => s.userId)).toEqual([anna]);
  });

  it('„an" lässt alle durch; die Einstellung gilt sofort und bleibt gespeichert', async () => {
    const g = gate();
    const push = g.gatePush(inner);
    expect(await push.send(ben, msg)).toBe(false);
    g.set({ push: { mode: 'all' } });
    expect(await push.send(ben, msg)).toBe(true);
    // ein neues Tor liest dieselbe Datenbank (Neustart)
    expect(gate().state().push).toEqual({ mode: 'all' });
  });

  it('Wächter lassen sich ein- und ausschalten; der Wechsel wird gemeldet', () => {
    const g = gate();
    const seen: boolean[] = [];
    g.onWatchers((on) => seen.push(on));
    expect(g.watchersEnabled()).toBe(true);
    g.set({ watchers: false });
    g.set({ watchers: false }); // keine Änderung, keine Meldung
    expect(g.watchersEnabled()).toBe(false);
    g.set({ watchers: true });
    expect(seen).toEqual([false, true]);
    // ein neues Tor liest dieselbe Datenbank (Neustart)
    g.set({ watchers: false });
    expect(gate().watchersEnabled()).toBe(false);
  });

  it('prüft die Eingaben: unbekannte Person, unbekannter Modus', () => {
    const g = gate();
    expect(() => g.set({ push: { mode: 'only', personId: 'gibt-es-nicht' } })).toThrow(/Person/);
    expect(() => g.set({ push: { mode: 'sonstwas' as 'all' } })).toThrow();
    expect(() => g.set({ watchers: 'ja' as unknown as boolean })).toThrow();
    expect(g.state()).toEqual({ push: { mode: 'off' }, watchers: true });
  });

  it('eine gespeicherte Person, die es nicht mehr gibt, gilt als „aus"', () => {
    const g = gate();
    g.set({ push: { mode: 'only', personId: ben } });
    store.removePerson(ben);
    expect(g.state().push).toEqual({ mode: 'off' });
  });
});

describe('Normale App: das Tor tut nichts', () => {
  it('Push und Wächter laufen wie bisher, Einstellungen sind nicht möglich', async () => {
    const g = gate(false);
    expect(g.enabled).toBe(false);
    expect(g.gatePush(inner)).toBe(inner);
    expect(g.watchersEnabled()).toBe(true);
    expect(g.state()).toEqual({ push: { mode: 'all' }, watchers: true });
    expect(() => g.set({ push: { mode: 'off' } })).toThrow(/Beta/);
  });
});
