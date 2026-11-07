import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notifications.js';
import { createHaNotifyPush } from '../src/push.js';
import { parseOptions } from '../src/config.js';
import { firstAt, nextAfter, parseReminder, schedule, usesClock, type ReminderSpec } from '../src/reminders.js';
import { createStore, type Store } from '../src/store.js';
import { createWatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';

const TZ = 'Europe/Berlin';
const MIN = 60_000;
const spec = (extra: Partial<ReminderSpec> = {}): ReminderSpec => ({ anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null, ...extra });

describe('Zeitpunkte des Nachhakens', () => {
  const base = Date.parse('2026-11-04T09:00:00Z'); // Mi 10:00 Berlin

  it('Minuten und Stunden: ab dem Anker plus die Zeit, danach alle … Minuten', () => {
    const s = spec({ afterMin: 60, everyMin: 30, max: 3 });
    expect(schedule(s, base, TZ, '18:00').map((ms) => new Date(ms).toISOString())).toEqual(['2026-11-04T10:00:00.000Z', '2026-11-04T10:30:00.000Z', '2026-11-04T11:00:00.000Z']);
  });

  it('nur einmal: genau ein Zeitpunkt, egal was „Höchstens“ sagt', () => {
    expect(schedule(spec({ afterMin: 30, everyMin: null, max: 9 }), base, TZ, '18:00')).toHaveLength(1);
    expect(nextAfter(spec({ everyMin: null }), base, TZ, '18:00')).toBeNull();
  });

  it('Tage: zur Uhrzeit, die Standard-Uhrzeit gilt bei leerer Uhrzeit', () => {
    const s = spec({ afterMin: 1440, everyMin: 1440, max: 3, atTime: '09:30' });
    expect(schedule(s, base, TZ, '18:00').map((ms) => new Date(ms).toISOString())).toEqual(['2026-11-05T08:30:00.000Z', '2026-11-06T08:30:00.000Z', '2026-11-07T08:30:00.000Z']);
    expect(new Date(firstAt(spec({ afterMin: 1440, everyMin: 1440 }), base, TZ, '18:00')).toISOString()).toBe('2026-11-05T17:00:00.000Z');
  });

  it('Wochen und die Zeitumstellung: die Uhrzeit bleibt, auch wenn die Uhr umgestellt wird (Sommerzeit endet am 25.10.2026)', () => {
    const s = spec({ afterMin: 10080, everyMin: 10080, max: 2, atTime: '09:00' });
    const start = Date.parse('2026-10-20T07:00:00Z'); // Di 09:00 MESZ
    const at = schedule(s, start, TZ, '18:00');
    expect(at.map((ms) => new Date(ms).toISOString())).toEqual(['2026-10-27T08:00:00.000Z', '2026-11-03T08:00:00.000Z']); // 09:00 MEZ nach der Umstellung
  });

  it('Stunden plus täglich zur Uhrzeit: erst nach der Zeit, danach jeden Tag zur Uhrzeit', () => {
    const s = spec({ afterMin: 60, everyMin: 1440, max: 2, atTime: '08:00' });
    expect(usesClock(s)).toBe(true);
    expect(schedule(s, base, TZ, '18:00').map((ms) => new Date(ms).toISOString())).toEqual(['2026-11-04T10:00:00.000Z', '2026-11-05T07:00:00.000Z']);
  });

  it('prüft die Eingabe: Grenzen, Standardwerte, Uhrzeit nur bei Tagen/Wochen', () => {
    expect(parseReminder({ afterMin: 60 })).toEqual({ anchor: 'created', afterMin: 60, everyMin: null, max: 1, atTime: null });
    expect(parseReminder({ anchor: 'due', afterMin: 60, everyMin: 60 })).toMatchObject({ max: 5 });
    expect(parseReminder({ anchor: 'due', afterMin: 60, everyMin: 60, atTime: '09:00' }).atTime).toBeNull();
    expect(parseReminder({ afterMin: 1440, atTime: '09:00' }).atTime).toBe('09:00');
    for (const bad of [null, [], { afterMin: 4 }, { afterMin: 60, everyMin: 2 }, { afterMin: 60, everyMin: 60, max: 0 }, { afterMin: 60, everyMin: 60, max: 100 }, { afterMin: 1440, atTime: '25:00' }, { afterMin: 60, anchor: 'x' }, { afterMin: 600000 }]) {
      expect(() => parseReminder(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

// ---------- Planer im Notifier ----------

interface Call {
  service: string;
  data: any;
}
let now: Date;
let store: Store;
let db: ReturnType<typeof openDb>;
let calls: Call[];
let rene: { id: string };
let conny: { id: string };
let anna: { id: string };
let boardId: string;
let openCol: string;

function makeNotifier() {
  return createNotifier({
    store,
    push: createHaNotifyPush({
      ha: { callService: async (_d: string, service: string, data: Record<string, unknown>) => void calls.push({ service, data }) },
      servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
      panelPath: () => '/',
    }),
    options: parseOptions({ daily_summary_time: '23:59', overdue_nag_time: '18:00' }),
    now: () => now,
    timeZone: () => TZ,
    retryDelaysMin: [],
  });
}
const at = (iso: string) => (now = new Date(iso));
const to = (svc: string) => calls.filter((c) => c.service === svc);
const card = (extra: object = {}) => store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', assigneeIds: [rene.id], ...extra }, rene.id);
const rows = () => db.prepare('select * from card_reminders order by rowid').all() as any[];

beforeEach(() => {
  now = new Date('2026-11-04T09:00:00Z'); // Mi 10:00 Berlin
  db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => TZ });
  store.syncPeople([
    { name: 'Rene', notify: ['svc_rene'] },
    { name: 'Conny', notify: ['svc_conny'] },
    { name: 'Anna', notify: ['svc_anna'] },
  ]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
  anna = store.resolveUser({ haId: 'ha-anna', name: 'anna', displayName: 'Anna' });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openCol = store.getBoardView(b.id).columns[0]!.id;
  calls = [];
});

describe('Nachhaken: Planer', () => {
  it('einmal: kommt nach der Zeit, danach nie wieder', async () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z' });
    store.setReminder(c.id, rene.id, spec({ afterMin: 60 }));
    const n = makeNotifier();
    await n.tick(); // Fälligkeit
    expect(calls).toHaveLength(1);
    at('2026-11-04T09:59:00Z');
    await n.tick();
    expect(calls).toHaveLength(1);
    at('2026-11-04T10:01:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.data.message).toBe('Überfällig seit heute 10:00 · Haushalt');
    expect(rows()[0]).toMatchObject({ sent_count: 1, done: 1, next_at: null });
    at('2026-11-05T10:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
  });

  it('wiederholt alle 30 Minuten, höchstens dreimal', async () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z' });
    store.setReminder(c.id, rene.id, spec({ afterMin: 30, everyMin: 30, max: 3 }));
    const n = makeNotifier();
    await n.tick();
    const sentAt: string[] = [];
    for (let i = 1; i <= 12; i++) {
      at(new Date(Date.parse('2026-11-04T09:00:00Z') + i * 10 * MIN).toISOString());
      const before = calls.length;
      await n.tick();
      if (calls.length > before) sentAt.push(now.toISOString());
    }
    expect(sentAt).toEqual(['2026-11-04T09:30:00.000Z', '2026-11-04T10:00:00.000Z', '2026-11-04T10:30:00.000Z']);
    expect(rows()[0]).toMatchObject({ sent_count: 3, done: 1 });
  });

  it('verpasste Zeitpunkte werden nicht nachgeholt: einmal senden, dann weiter zum nächsten künftigen', async () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z' });
    store.setReminder(c.id, rene.id, spec({ afterMin: 30, everyMin: 30, max: 9 }));
    const n = makeNotifier();
    await n.tick();
    at('2026-11-04T10:40:00Z'); // der Server war aus: 09:30, 10:00 und 10:30 verpasst
    await n.tick();
    expect(calls).toHaveLength(2); // Fälligkeit + ein Nachhaken
    expect(rows()[0]).toMatchObject({ sent_count: 1, next_at: '2026-11-04T11:00:00.000Z' });
  });

  it('endet mit der Erledigung, dem Löschen und dem Archivieren', async () => {
    const mk = (title: string) => {
      const c = card({ title, dueAt: '2026-11-04T09:00:00Z' });
      store.setReminder(c.id, rene.id, spec({ afterMin: 30, everyMin: 30, max: 9 }));
      return c;
    };
    const a = mk('A');
    const b = mk('B');
    const d = mk('C');
    const n = makeNotifier();
    await n.tick();
    calls = [];
    store.completeCard(a.id, { by: rene.id, source: 'push' });
    store.deleteCard(b.id);
    db.prepare('update cards set archived_at = ? where id = ?').run(now.toISOString(), d.id);
    at('2026-11-04T09:31:00Z');
    await n.tick();
    expect(calls).toEqual([]);
  });

  it('„Erledigt“ in der Mitteilung beendet es', async () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z' });
    store.setReminder(c.id, rene.id, spec({ afterMin: 30, everyMin: 30, max: 9 }));
    const n = makeNotifier();
    await n.tick();
    at('2026-11-04T09:31:00Z');
    await n.tick();
    const done = calls.at(-1)!.data.data.actions.find((a: any) => a.title === 'Erledigt');
    expect(done.action).toMatch(/^KANBAN_DONE:/);
    expect(await n.handleAction({ action: done.action, userId: 'ha-rene' })).toBe('completed');
    calls = [];
    at('2026-11-04T10:31:00Z');
    await n.tick();
    expect(calls).toEqual([]);
  });

  it('Ruhezeit: wartet bis zum Ende der Ruhezeit, ohne etwas zu zählen', async () => {
    const c = card({ dueAt: '2026-11-04T20:00:00Z' }); // 21:00 Berlin
    store.setReminder(c.id, rene.id, spec({ afterMin: 60, everyMin: null }));
    const n = makeNotifier();
    at('2026-11-04T20:00:00Z');
    await n.tick();
    calls = [];
    at('2026-11-04T21:30:00Z'); // 22:30: Ruhezeit
    await n.tick();
    expect(calls).toEqual([]);
    expect(rows()[0]).toMatchObject({ sent_count: 0, done: 0, next_at: '2026-11-05T06:00:00.000Z' }); // 07:00 Berlin
    at('2026-11-05T05:59:00Z');
    await n.tick();
    expect(calls).toEqual([]);
    at('2026-11-05T06:00:00Z');
    await n.tick();
    expect(to('svc_rene')).toHaveLength(1);
  });

  it('ohne Termin zählt ab dem Anlegen („created“), auch bei Anker „due“', async () => {
    const c = card();
    store.setReminder(c.id, rene.id, spec({ anchor: 'due', afterMin: 60 }));
    const n = makeNotifier();
    await n.tick();
    expect(calls).toEqual([]);
    at('2026-11-04T10:01:00Z');
    await n.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.data.message).toBe('Noch offen: Denkst du dran?');
    expect(calls[0]!.data.data.actions).toBeUndefined(); // ohne Termin gibt es kein „Erledigt“ in der Mitteilung
  });

  it('Termin ändern: Nachhaken ab Termin fängt neu an', async () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z' });
    store.setReminder(c.id, rene.id, spec({ afterMin: 60 }));
    const n = makeNotifier();
    await n.tick();
    store.updateCard(c.id, { dueAt: '2026-11-06T09:00:00Z' }, rene.id);
    at('2026-11-04T10:30:00Z');
    calls = [];
    await n.tick();
    expect(calls).toEqual([]);
    at('2026-11-06T10:01:00Z');
    await n.tick();
    expect(calls.filter((x) => /Überfällig/.test(x.data.message))).toHaveLength(1);
  });

  describe('Empfänger und Sichtbarkeit', () => {
    it('persönlich: nur die einstellende Person, auch wenn mehrere zuständig sind', async () => {
      const c = card({ assigneeIds: [rene.id, conny.id] });
      store.setReminder(c.id, conny.id, spec({ anchor: 'created', afterMin: 30 }));
      const n = makeNotifier();
      await n.tick();
      at('2026-11-04T09:31:00Z');
      await n.tick();
      expect(to('svc_conny')).toHaveLength(1);
      expect(to('svc_rene')).toHaveLength(0);
    });

    it('persönlich für jemanden, der das Board nicht sieht: wird übersprungen', async () => {
      const priv = store.createBoard({ name: 'Meine Ideen', visibility: 'private', ownerId: rene.id });
      const col = store.getBoardView(priv.id).columns[0]!.id;
      const c = store.createCard(priv.id, { columnId: col, title: 'Geheim' }, rene.id);
      store.setReminder(c.id, conny.id, spec({ anchor: 'created', afterMin: 30 }));
      const n = makeNotifier();
      await n.tick();
      at('2026-11-04T09:31:00Z');
      await n.tick();
      expect(calls).toEqual([]);
    });

    it('die Zuständigen (Wächter): die jetzigen zum Sendezeitpunkt, nur wer das Board sieht', async () => {
      const c = card({ assigneeIds: [rene.id] });
      store.setReminder(c.id, null, spec({ anchor: 'created', afterMin: 30 }));
      const n = makeNotifier();
      await n.tick();
      store.updateCard(c.id, { assigneeIds: [conny.id, anna.id] }); // inzwischen anders zugewiesen
      at('2026-11-04T09:31:00Z');
      await n.tick();
      expect(to('svc_rene')).toHaveLength(0);
      expect(to('svc_conny')).toHaveLength(1);
      expect(to('svc_anna')).toHaveLength(1);
    });

    it('niemand zuständig: es wartet, bis jemand zugewiesen ist', async () => {
      const c = card({ assigneeIds: [] });
      store.setReminder(c.id, null, spec({ anchor: 'created', afterMin: 30 }));
      const n = makeNotifier();
      at('2026-11-04T10:00:00Z');
      await n.tick();
      expect(calls).toEqual([]);
      store.updateCard(c.id, { assigneeIds: [conny.id] });
      await n.tick();
      expect(to('svc_conny')).toHaveLength(1);
    });

    it('die Erinnerung einer Person ist für andere unsichtbar', () => {
      const c = card();
      store.setReminder(c.id, rene.id, spec({ afterMin: 60 }));
      expect(store.myReminder(c.id, rene.id)).toMatchObject({ afterMin: 60 });
      expect(store.myReminder(c.id, conny.id)).toBeNull();
      expect(store.myReminder(c.id, null)).toBeNull();
    });
  });

  it('eine neue Karte einer Wiederholung bekommt die Erinnerungen und zählt von vorn', () => {
    const c = card({ dueAt: '2026-11-04T09:00:00Z', recurrence: { type: 'fixed', freq: 'daily', every: 1 } });
    store.setReminder(c.id, rene.id, spec({ afterMin: 60, everyMin: 60, max: 4 }));
    const res = store.completeCard(c.id, { by: rene.id, source: 'app' });
    expect(res.nextCardId).toBeTruthy();
    expect(store.myReminder(res.nextCardId!, rene.id)).toEqual({ anchor: 'due', afterMin: 60, everyMin: 60, max: 4, atTime: null });
    expect(rows().filter((r) => r.card_id === res.nextCardId)).toMatchObject([{ sent_count: 0, next_at: null }]);
  });

  describe('Wächter-Stups über denselben Planer', () => {
    it('Art watcher, Eintrag im Verlauf des Wächters, nur solange der Wächter aktiv ist', async () => {
      const data = createWatcherData(db, () => now);
      const w = data.create(
        parseWatcher({
          name: 'Waschmaschine fertig',
          trigger: { entityId: 'sensor.w', kind: 'below', value: 5, forMin: 0 },
          card: { boardId, columnId: openCol, title: 'Ausräumen' },
          assign: { mode: 'fixed', personIds: [conny.id] },
          nudge: { afterMin: 30, everyMin: 30, max: 3 },
        }),
      );
      const c = card({ title: 'Ausräumen', assigneeIds: [conny.id] });
      store.setCardOrigin(c.id, { watcherId: w.id, dedupeKey: null });
      store.setReminder(c.id, null, { anchor: 'created', afterMin: 30, everyMin: 30, max: 3, atTime: null });
      const n = makeNotifier();
      at('2026-11-04T09:31:00Z');
      await n.tick();
      expect(to('svc_conny')).toHaveLength(1);
      expect(data.runs(w.id)[0]).toMatchObject({ result: 'nudged', cardId: c.id });

      data.setActive(w.id, false);
      at('2026-11-04T10:01:00Z');
      await n.tick();
      expect(to('svc_conny')).toHaveLength(1);
      data.setActive(w.id, true);
      at('2026-11-04T10:02:00Z');
      await n.tick();
      expect(to('svc_conny')).toHaveLength(2);
    });
  });
});
