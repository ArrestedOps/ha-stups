import { beforeEach, describe, expect, it } from 'vitest';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notifications.js';
import type { PushGateway, PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

// Sonntags-Zusammenfassung: eine wertschätzende Nachricht je Woche, aus, bis jemand sie einschaltet. Alles mit fester Uhr.
const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let sent: { userId: string; message: PushMessage }[];
let ben: string;
let anna: string;
let boardId: string;
let openId: string;

const gateway: PushGateway = {
  canReach: () => true,
  send: async (userId, message) => {
    sent.push({ userId, message });
    return true;
  },
  clear: async () => undefined,
};
const notifier = () => createNotifier({ store, push: gateway, options: parseOptions({ daily_summary_time: '23:59', overdue_nag_time: '18:00' }), now: () => now, timeZone: () => TZ });
const weekly = (userId: string) => sent.filter((s) => s.userId === userId && s.message.tag === 'stups-weekly').map((s) => s.message);
const at = (iso: string) => void (now = new Date(iso));
const done = (title: string, by: string) => store.completeCard(store.createCard(boardId, { columnId: openId, title }, by).id, { by, source: 'app' });

beforeEach(() => {
  at('2026-11-04T09:00:00Z'); // Mi 10:00 Berlin
  sent = [];
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openId = store.getBoardView(b.id).columns[0]!.id;
});

describe('Schalter je Person', () => {
  it('ist aus, bis jemand ihn einschaltet', () => {
    expect(store.people().map((p) => p.weeklySummary)).toEqual([false, false]);
    store.setWeeklySummary(ben, true);
    expect(store.people().map((p) => p.weeklySummary)).toEqual([true, false]);
    store.setWeeklySummary(ben, false);
    expect(store.people()[0]!.weeklySummary).toBe(false);
  });
});

describe('Nachricht am Sonntagabend', () => {
  beforeEach(() => {
    store.setWeeklySummary(ben, true);
    for (let i = 0; i < 3; i++) done(`B${i}`, ben);
    for (let i = 0; i < 2; i++) done(`A${i}`, anna);
  });

  it('Sonntag ab 18:00 Ortszeit: genau eine, wertschätzend, mit den Zahlen der Woche, in der Sprache des Empfängers', async () => {
    at('2026-11-08T17:00:00Z'); // So 18:00 Berlin
    await notifier().tick();
    const m = weekly(ben);
    expect(m).toHaveLength(1);
    expect(m[0]!.body).toBe('Diese Woche habt ihr 5 Aufgaben erledigt. Ben 3, Anna 2. 💪');
    expect(m[0]!.kind).toBeUndefined(); // erreicht das Haus nie
    expect(weekly(anna)).toEqual([]); // nicht eingeschaltet
  });

  it('englisch, wenn das Gerät Englisch meldet', async () => {
    store.setLanguage(ben, { choice: 'en', effective: 'en' });
    at('2026-11-08T17:00:00Z');
    await notifier().tick();
    expect(weekly(ben)[0]!.body).toBe('This week you completed 5 tasks together. Ben 3, Anna 2. 💪');
  });

  it('Sonntag 17:59 noch nicht, danach genau einmal je Woche', async () => {
    at('2026-11-08T16:59:00Z'); // So 17:59 Berlin
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
    at('2026-11-08T17:00:00Z');
    await notifier().tick();
    await notifier().tick();
    at('2026-11-08T18:30:00Z');
    await notifier().tick();
    expect(weekly(ben)).toHaveLength(1);
  });

  it('an anderen Tagen nie', async () => {
    for (const iso of ['2026-11-07T17:00:00Z', '2026-11-09T17:00:00Z', '2026-11-05T17:00:00Z']) {
      at(iso);
      await notifier().tick();
    }
    expect(weekly(ben)).toEqual([]);
  });

  it('bei 0 erledigten Aufgaben keine Nachricht', async () => {
    at('2026-11-15T17:00:00Z'); // Sonntag der nächsten Woche: nichts erledigt
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
  });

  it('die nächste Woche bekommt wieder eine', async () => {
    at('2026-11-08T17:00:00Z');
    await notifier().tick();
    at('2026-11-11T09:00:00Z');
    done('Neu', ben);
    at('2026-11-15T17:00:00Z');
    await notifier().tick();
    expect(weekly(ben)).toHaveLength(2);
    expect(weekly(ben)[1]!.body).toBe('Diese Woche habt ihr 1 Aufgabe erledigt. Ben 1. 💪');
  });

  it('nicht in der Ruhezeit der Person; das Fenster endet nach vier Stunden, dann entfällt sie für diese Woche', async () => {
    store.setNudgeQuiet(ben, { start: '17:30', end: '19:00' }); // Ruhezeit am Sonntagabend
    at('2026-11-08T17:00:00Z'); // 18:00 Berlin: in der Ruhezeit
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
    at('2026-11-08T18:15:00Z'); // 19:15 Berlin: Ruhezeit vorbei, noch im Fenster
    await notifier().tick();
    expect(weekly(ben)).toHaveLength(1);
  });

  it('wer erst nach dem Fenster (22:00) drankommt, bekommt sie in dieser Woche nicht mehr', async () => {
    at('2026-11-08T21:30:00Z'); // So 22:30 Berlin: außerhalb des Vier-Stunden-Fensters
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
    at('2026-11-08T21:50:00Z');
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
  });

  it('ausgeschaltet nach dem Einschalten: nichts', async () => {
    store.setWeeklySummary(ben, false);
    at('2026-11-08T17:00:00Z');
    await notifier().tick();
    expect(weekly(ben)).toEqual([]);
  });
});
