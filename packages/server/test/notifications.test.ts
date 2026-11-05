import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notifications.js';
import { createHaNotifyPush } from '../src/push.js';
import { parseOptions } from '../src/config.js';
import { createStore, type ClosedNudge, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';

interface Call {
  service: string;
  data: any;
}

let now: Date;
let store: Store;
let db: ReturnType<typeof openDb>;
let calls: Call[];
let failing: Set<string>;
let rene: { id: string };
let conny: { id: string };
let boardId: string;
let openCol: string;

// Die Zusammenfassung ist außerhalb der eigenen Tests auf 23:59 gestellt, damit sie die anderen Tests nicht stört.
const optionsWith = (summaryTime: string) =>
  parseOptions({
    daily_summary_time: summaryTime,
    overdue_nag_time: '18:00',
  });

// Verbindet den Store mit dem jeweils zuletzt gebauten Notifier (wie in main.ts)
let hook: ((list: ClosedNudge[]) => void) | null = null;

function makeNotifier(extra: { onChange?: () => void; summaryTime?: string; actionPrefix?: string; log?:{ info: (m: string) => void; warn: (m: string) => void } } = {}) {
  const options = optionsWith(extra.summaryTime ?? '23:59');
  const notifier = createNotifier({
    store,
    push: createHaNotifyPush({
      ha: {
        callService: async (_d: string, service: string, data: Record<string, unknown>) => {
          if (failing.has(service)) throw new Error('HA nicht erreichbar');
          calls.push({ service, data });
        },
      },
      servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
      panelPath: () => store.getSettings().panelPath ?? '/',
      log: extra.log,
    }),
    options,
    now: () => now,
    timeZone: () => TZ,
    ...extra,
  });
  hook = (list) => void notifier.nudgesClosed(list);
  return notifier;
}

beforeEach(() => {
  now = new Date('2026-11-01T07:00:00Z'); // Sa 08:00 Berlin
  db = openDb(':memory:');
  hook = null;
  store = createStore(db, { now: () => now, timeZone: () => TZ, onNudgesClosed: (list) => hook?.(list) });
  store.syncPeople([
    { name: 'Rene', notify: ['svc_rene', 'svc_rene_ipad'] },
    { name: 'Conny', notify: ['svc_conny'] },
  ]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openCol = store.getBoardView(b.id).columns[0]!.id;
  calls = [];
  failing = new Set();
});

const card = (extra: object) =>
  store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', ...extra }, rene.id);

describe('Neue Karte von einem Wächter', () => {
  it('sagt der zugewiesenen Person gleich Bescheid, mit „Erledigt", wenn die Karte einen Termin hat', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] });
    await makeNotifier().notifyAssigned(c, [rene.id]);
    expect(calls.map((x) => x.service).sort()).toEqual(['svc_rene', 'svc_rene_ipad']);
    expect(calls[0]!.data).toMatchObject({
      title: 'Bad putzen',
      message: 'Neue Karte für dich · fällig heute 10:00',
      data: { actions: [{ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, title: 'Erledigt' }] },
    });
  });

  it('ohne Termin gibt es keinen „Erledigt"-Knopf, nur die Karte zum Öffnen', async () => {
    const c = card({ assigneeIds: [conny.id] });
    await makeNotifier().notifyAssigned(c, [conny.id]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.data.message).toBe('Neue Karte für dich');
    expect(calls[0]!.data.data.actions).toBeUndefined();
    expect(calls[0]!.data.data.url).toContain(`?card=${c.id}`);
  });

  it('wer kein Push-Gerät hat, wird übersprungen, die anderen bekommen es trotzdem', async () => {
    store.setNotifyServices(rene.id, []);
    const c = card({ assigneeIds: [rene.id, conny.id] });
    await makeNotifier().notifyAssigned(c, [rene.id, conny.id]);
    expect(calls.map((x) => x.service)).toEqual(['svc_conny']);
  });
});

describe('Fälligkeit', () => {
  it('sendet genau zum Termin an die zugewiesene Person, mit allen ihren Geräten', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] }); // 10:00 Berlin
    const n = makeNotifier();

    now = new Date('2026-11-01T08:59:00Z');
    expect(await n.tick()).toBe(0);
    expect(calls).toHaveLength(0);

    now = new Date('2026-11-01T09:00:00Z');
    expect(await n.tick()).toBe(1);
    expect(calls.map((c) => c.service).sort()).toEqual(['svc_rene', 'svc_rene_ipad']);
    expect(calls[0]!.data).toMatchObject({
      title: 'Bad putzen',
      message: 'Fällig: heute 10:00 · Haushalt',
    });
  });

  it('beide zugewiesen → beide bekommen die Nachricht; ohne Zuweisung niemand', async () => {
    card({ title: 'zu zweit', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id, conny.id] });
    card({ title: 'niemand', dueAt: '2026-11-01T09:00:00Z' });
    now = new Date('2026-11-01T09:00:00Z');
    await makeNotifier().tick();
    expect(calls.map((c) => c.service).sort()).toEqual(['svc_conny', 'svc_rene', 'svc_rene_ipad']);
    expect(calls.every((c) => c.data.title === 'zu zweit')).toBe(true);
  });

  it('sendet nie doppelt, auch nicht nach einem Neustart (neuer Notifier, gleiche Datenbank)', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-01T09:00:30Z');
    await makeNotifier().tick();
    await makeNotifier().tick();
    now = new Date('2026-11-01T09:10:00Z');
    await makeNotifier().tick();
    expect(calls).toHaveLength(1);
  });

  it('holt eine verpasste Fälligkeit bis 12 Stunden später nach, mit Hinweis', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-01T14:00:00Z'); // 5 Stunden zu spät (Add-on war aus)
    await makeNotifier().tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.data.message).toBe('Fällig: heute 10:00 · Haushalt (verspätet)');
  });

  it('überspringt Fälligkeiten, die länger als 12 Stunden zurückliegen, und holt sie später nicht mehr nach', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-02T09:00:01Z');
    const n = makeNotifier();
    await n.tick();
    now = new Date('2026-11-02T09:05:00Z');
    await n.tick();
    expect(calls).toHaveLength(0);
  });

  it('meldet erledigte, archivierte und gelöschte Karten nicht', async () => {
    const done = card({ title: 'erledigt', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const gone = card({ title: 'gelöscht', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    store.completeCard(done.id, { by: rene.id, source: 'app' });
    store.deleteCard(gone.id);
    now = new Date('2026-11-01T09:00:00Z');
    await makeNotifier().tick();
    expect(calls).toHaveLength(0);
  });

  it('überspringt Personen ohne Notify-Dienst, ohne Fehler', async () => {
    const lonely = store.resolveUser({ haId: 'ha-x', name: 'xaver', displayName: 'Xaver' });
    expect(lonely.isPerson).toBe(false); // keine Person → nicht zuweisbar
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-01T09:00:00Z');
    await expect(makeNotifier().tick()).resolves.toBe(1);
  });

  it('eine wiederkehrende Karte meldet sich zum neuen Termin erneut', async () => {
    const c = card({
      dueAt: '2026-11-01T09:00:00Z',
      assigneeIds: [conny.id],
      recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] },
    });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    store.completeCard(c.id, { by: conny.id, source: 'app' }); // nächster Termin: Sa 07.11. 10:00
    now = new Date('2026-11-07T09:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
  });

  it('ein auf später verschobener Termin am selben Tag meldet sich noch einmal', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(1);

    store.updateCard(c.id, { dueAt: '2026-11-01T09:02:00Z' }, conny.id); // zwei Minuten später
    now = new Date('2026-11-01T09:01:00Z');
    await n.tick();
    expect(calls).toHaveLength(1); // noch nicht fällig
    now = new Date('2026-11-01T09:02:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.data.data.actions[0].action).toBe(`KANBAN_DONE:${c.id}:2026-11-01T09:02:00.000Z`);
  });

  it('eine wiederkehrende Karte, per Push erledigt und auf „gleich" gestellt, meldet sich zum neuen Termin', async () => {
    const c = card({
      dueAt: '2026-11-01T09:00:00Z',
      assigneeIds: [conny.id],
      recurrence: { type: 'fixed', freq: 'daily', every: 2 },
    });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' });
    // Die nächste Karte hat den Termin zwei Tage später; wer ihn auf „in 2 Minuten" ändert, bekommt eine Nachricht
    const next = store.getBoardView(boardId).cards.find((x) => x.repeatedFrom === c.id)!;
    expect(next.dueAt).toBe('2026-11-03T09:00:00.000Z');
    store.updateCard(next.id, { dueAt: '2026-11-01T09:02:00Z' }, conny.id);
    now = new Date('2026-11-01T09:02:00Z');
    await n.tick();
    // Aufruf 1: Erinnerung, 2: Bestätigung, die die erste Nachricht ersetzt, 3: die neue Erinnerung (nur sie hat einen Button)
    const reminders = calls.filter((x) => x.data.data?.actions);
    expect(reminders).toHaveLength(2);
    expect(reminders[1]!.data.data.actions[0].action).toBe(`KANBAN_DONE:${next.id}:2026-11-01T09:02:00.000Z`);
  });

  it('Erledigen per Push bei einer Wiederholung ersetzt die Nachricht durch eine Bestätigung mit dem nächsten Termin', async () => {
    const c = card({
      title: 'Müll',
      dueAt: '2026-11-01T09:00:00Z',
      assigneeIds: [conny.id],
      recurrence: { type: 'fixed', freq: 'daily', every: 2 },
    });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    calls.length = 0;
    await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.service).toBe('svc_conny');
    expect(calls[0]!.data).toMatchObject({
      title: 'Müll',
      message: 'Erledigt · nächste Karte Di 10:00', // der 01.11.2026 ist ein Sonntag, zwei Tage später Dienstag
      data: { tag: `stups-card-${c.id}`, push: { 'interruption-level': 'passive' } },
    });
    expect(calls[0]!.data.data.actions).toBeUndefined();
  });

  it('Erledigen per Push ohne Wiederholung entfernt die Nachricht wie bisher', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    calls.length = 0;
    await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' });
    expect(calls).toEqual([{ service: 'svc_conny', data: { message: 'clear_notification', data: { tag: `stups-card-${c.id}` } } }]);
  });

  it('enthält Erledigt-Button, Tag und Link zur Karte', async () => {
    store.setSettings({ panelPath: '/c552c524_stups' });
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-01T09:00:00Z');
    await makeNotifier().tick();
    expect(calls[0]!.data.data).toMatchObject({
      tag: `stups-card-${c.id}`,
      group: 'stups',
      url: `/c552c524_stups?card=${c.id}`,
      push: { 'interruption-level': 'time-sensitive' },
      actions: [{ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, title: 'Erledigt' }],
    });
  });
});

describe('Wiederholungsversuche', () => {
  it('versucht es nach 1, 5 und 15 Minuten erneut und gibt dann auf', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    failing.add('svc_conny');

    now = new Date('2026-11-01T09:00:00Z');
    expect(await n.tick()).toBe(0); // 1. Versuch scheitert
    now = new Date('2026-11-01T09:00:30Z');
    await n.tick(); // noch keine Minute: kein neuer Versuch
    now = new Date('2026-11-01T09:01:00Z');
    await n.tick(); // 2. Versuch scheitert
    now = new Date('2026-11-01T09:05:59Z');
    await n.tick(); // noch keine 5 Minuten seit dem 2. Versuch: nichts
    now = new Date('2026-11-01T09:06:00Z');
    await n.tick(); // 3. Versuch scheitert
    now = new Date('2026-11-01T09:21:00Z');
    await n.tick(); // 4. Versuch scheitert → aufgeben
    failing.clear();
    now = new Date('2026-11-01T09:40:00Z');
    await n.tick();
    expect(calls).toHaveLength(0);
  });

  it('klappt beim zweiten Versuch und sendet dann nicht noch einmal', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    failing.add('svc_conny');
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    failing.clear();
    now = new Date('2026-11-01T09:01:00Z');
    expect(await n.tick()).toBe(1);
    now = new Date('2026-11-01T09:10:00Z');
    await n.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.data.message).toContain('Fällig');
  });

  it('gilt als gesendet, wenn mindestens ein Gerät erreicht wurde', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] });
    failing.add('svc_rene_ipad');
    now = new Date('2026-11-01T09:00:00Z');
    const n = makeNotifier();
    expect(await n.tick()).toBe(1);
    now = new Date('2026-11-01T09:05:00Z');
    await n.tick();
    expect(calls.map((c) => c.service)).toEqual(['svc_rene']);
  });
});

describe('Vorab-Erinnerung', () => {
  it('kommt vor dem Termin, einmal, und die Fälligkeit danach zusätzlich', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id], remindBeforeMin: 60 });
    const n = makeNotifier();
    now = new Date('2026-11-01T07:59:00Z');
    await n.tick();
    expect(calls).toHaveLength(0);
    now = new Date('2026-11-01T08:00:00Z');
    await n.tick();
    now = new Date('2026-11-01T08:30:00Z');
    await n.tick();
    expect(calls.map((c) => c.data.message)).toEqual(['In 1 Std. fällig: heute 10:00 · Haushalt']);
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
  });

  it('entfällt, wenn der Termin beim ersten Prüfen schon erreicht ist', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id], remindBeforeMin: 60 });
    now = new Date('2026-11-01T09:00:10Z');
    await makeNotifier().tick();
    expect(calls.map((c) => c.data.message)).toEqual(['Fällig: heute 10:00 · Haushalt']);
  });
});

describe('Nachhaken bei Überfälligkeit', () => {
  it('einmal täglich zur eingestellten Uhrzeit ab dem Tag nach der Fälligkeit, bis erledigt', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id], overdueNag: true });
    const n = makeNotifier();

    now = new Date('2026-11-01T09:00:00Z');
    await n.tick(); // Fälligkeits-Nachricht
    now = new Date('2026-11-01T17:30:00Z'); // 18:30 am Fälligkeitstag: noch kein Nachhaken
    await n.tick();
    expect(calls).toHaveLength(1);

    now = new Date('2026-11-02T16:59:00Z'); // 17:59 am Folgetag: vor 18:00
    await n.tick();
    expect(calls).toHaveLength(1);

    now = new Date('2026-11-02T17:00:00Z'); // 18:00
    await n.tick();
    now = new Date('2026-11-02T20:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.data.message).toBe('Überfällig seit gestern 10:00 · Haushalt');

    now = new Date('2026-11-03T17:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(3);

    store.completeCard(c.id, { by: conny.id, source: 'app' });
    now = new Date('2026-11-04T17:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(3);
  });

  it('ohne Nachhaken-Schalter passiert nichts', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    now = new Date('2026-11-02T17:00:00Z');
    await n.tick();
    expect(calls).toHaveLength(1);
  });
});

describe('Tageszusammenfassung', () => {
  it('geht morgens pro Person mit nur den eigenen Aufgaben raus, einmal am Tag', async () => {
    card({ title: 'Müll', dueAt: '2026-11-01T15:00:00Z', assigneeIds: [conny.id] }); // heute 16:00
    card({ title: 'Steuer', dueAt: '2026-10-31T10:00:00Z', assigneeIds: [conny.id] }); // überfällig
    card({ title: 'Auto', dueAt: '2026-11-01T11:00:00Z', assigneeIds: [rene.id] });
    card({ title: 'nächste Woche', dueAt: '2026-11-09T11:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier({ summaryTime: '08:00' });

    now = new Date('2026-11-01T06:59:00Z'); // 07:59
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(0);

    now = new Date('2026-11-01T07:00:00Z'); // 08:00
    await n.tick();
    now = new Date('2026-11-01T07:10:00Z');
    await n.tick();
    const summaries = calls.filter((c) => c.data.data.tag === 'stups-summary');
    const conn = summaries.find((c) => c.service === 'svc_conny')!;
    expect(conn.data.message).toContain('Heute fällig: 1 · Überfällig: 1');
    expect(conn.data.message).toContain('Müll');
    expect(conn.data.message).toContain('Steuer');
    expect(conn.data.message).not.toContain('Auto');
    expect(conn.data.message).not.toContain('nächste Woche');
    const ren = summaries.filter((c) => c.service.startsWith('svc_rene'));
    expect(ren).toHaveLength(2); // beide Geräte
    expect(ren[0]!.data.message).toContain('Heute fällig: 1 · Überfällig: 0');
    expect(summaries).toHaveLength(3);
  });

  it('bleibt stumm, wenn nichts ansteht, und holt das später am Tag nicht nach', async () => {
    const n = makeNotifier({ summaryTime: '08:00' });
    now = new Date('2026-11-01T07:00:00Z');
    await n.tick();
    card({ title: 'neu', dueAt: '2026-11-01T20:00:00Z', assigneeIds: [conny.id] });
    now = new Date('2026-11-01T12:00:00Z');
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(0);
  });

  it('die in der App eingestellte Uhrzeit hat Vorrang vor der Add-on-Option (feste Uhr, Berlin)', async () => {
    card({ title: 'Müll', dueAt: '2026-11-01T15:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier({ summaryTime: '08:00' }); // Option: 08:00
    store.setSettings({ dailySummaryTime: '10:30' }); // App: 10:30

    now = new Date('2026-11-01T07:30:00Z'); // 08:30, die Option wäre schon dran
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(0);

    now = new Date('2026-11-01T09:30:00Z'); // 10:30
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(1);
  });

  it('ohne Eintrag in der App gilt wieder die Option', async () => {
    card({ title: 'Müll', dueAt: '2026-11-01T15:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier({ summaryTime: '08:00' });
    store.setSettings({ dailySummaryTime: '10:30' });
    store.setSettings({ dailySummaryTime: null });
    now = new Date('2026-11-01T07:00:00Z'); // 08:00
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(1);
  });

  it('kommt am nächsten Tag wieder', async () => {
    card({ title: 'Müll', dueAt: '2026-11-03T15:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier({ summaryTime: '08:00' });
    now = new Date('2026-11-02T07:00:00Z');
    await n.tick();
    now = new Date('2026-11-03T07:00:00Z');
    await n.tick();
    expect(calls.filter((c) => c.data.data.tag === 'stups-summary')).toHaveLength(1);
  });
});

describe('Erledigt-Button in der Push-Nachricht', () => {
  it('erledigt die Karte als die tippende Person und räumt die Nachrichten auf', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id, conny.id] });
    let changed = 0;
    const n = makeNotifier({ onChange: () => (changed += 1) });
    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    calls.length = 0;

    const res = await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' });
    expect(res).toBe('completed');
    expect(store.getCard(c.id)).toMatchObject({ completedAt: now.toISOString() });
    expect(store.listCompletions(c.id)[0]).toMatchObject({ completedBy: conny.id, source: 'push' });
    expect(changed).toBe(1);
    // clear_notification an alle Geräte beider Personen
    expect(calls.map((x) => x.service).sort()).toEqual(['svc_conny', 'svc_rene', 'svc_rene_ipad']);
    expect(calls[0]!.data).toEqual({ message: 'clear_notification', data: { tag: `stups-card-${c.id}` } });
  });

  it('ein zweiter Tipp auf dieselbe Nachricht tut nichts', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    const action = { action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' };
    expect(await n.handleAction(action)).toBe('completed');
    expect(await n.handleAction(action)).toBe('already_done');
    expect(store.listCompletions(c.id)).toHaveLength(1);
  });

  it('eine Nachricht zu einem alten Termin lässt die wiederkehrende Karte in Ruhe', async () => {
    const c = card({
      dueAt: '2026-11-01T09:00:00Z',
      assigneeIds: [conny.id],
      recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] },
    });
    const n = makeNotifier();
    now = new Date('2026-11-01T09:00:00Z');
    expect(await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' })).toBe('completed');
    // Die Karte ist erledigt, eine neue wartet mit dem nächsten Termin
    expect(store.getCard(c.id).completedAt).not.toBeNull();
    const next = store.getBoardView(boardId).cards.find((x) => x.repeatedFrom === c.id)!;
    expect(next.dueAt).toBe('2026-11-07T09:00:00.000Z');
    // alte Nachricht vom 01.11. wird noch einmal angetippt: sie betrifft nur die erledigte Karte
    expect(await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' })).toBe('already_done');
    expect(store.getCard(next.id).completedAt).toBeNull();
    expect(store.getCard(next.id).dueAt).toBe('2026-11-07T09:00:00.000Z');
    expect(store.listCompletions(c.id)).toHaveLength(1);
    expect(store.listCompletions(next.id)).toHaveLength(0);
  });

  it('ignoriert fremde Aktionen und unbekannte Karten', async () => {
    const n = makeNotifier();
    expect(await n.handleAction({ action: 'ANDERE_APP', userId: 'x' })).toBe('ignored');
    expect(await n.handleAction({ action: 'KANBAN_DONE:gibt-es-nicht:2026-11-01T09:00:00.000Z' })).toBe('unknown_card');
  });

  it('trägt „per Push" ein, wenn die HA-Nutzer-ID unbekannt ist', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'unbekannt' });
    expect(store.listCompletions(c.id)[0]).toMatchObject({ completedBy: null, source: 'push' });
  });

  it('clearFor räumt Nachrichten auf, wenn in der App erledigt wurde', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    await n.clearFor(c.id);
    expect(calls).toEqual([
      { service: 'svc_conny', data: { message: 'clear_notification', data: { tag: `stups-card-${c.id}` } } },
    ]);
  });
});

describe('Protokoll', () => {
  it('schreibt jeden Versand ins Log und ins Sendeprotokoll', async () => {
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] });
    const lines: string[] = [];
    const n = makeNotifier({ log: { info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m) } } as any);

    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();

    expect(lines).toEqual(['Push (due) „Bad putzen" an Rene gesendet']);
    expect(store.recentNotifications()).toEqual([
      { kind: 'due', status: 'sent', at: now.toISOString(), title: 'Bad putzen', user: 'Rene' },
    ]);
  });

  it('meldet einmal, wenn eine zuständige Person keinen Notify-Dienst hat', async () => {
    store.syncPeople([{ name: 'Gast' }]);
    const gast = store.people().find((p) => p.name === 'Gast')!;
    card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [gast.id] });
    const lines: string[] = [];
    const n = makeNotifier({ log: { info: () => undefined, warn: (m: string) => lines.push(m) } } as any);

    now = new Date('2026-11-01T09:00:00Z');
    await n.tick();
    await n.tick();

    expect(lines).toEqual(['Kein Push-Gerät für Gast: keine Push-Nachrichten (einstellbar unter Personen & Zugriff)']);
    expect(calls).toHaveLength(0);
  });

  it('vermerkt einen übersprungenen Termin (mehr als 12 Stunden her)', async () => {
    card({ dueAt: '2026-10-31T09:00:00Z', assigneeIds: [rene.id] });
    const n = makeNotifier();
    await n.tick();
    expect(store.recentNotifications()[0]).toMatchObject({ kind: 'due', status: 'skipped', title: 'Bad putzen' });
  });
});

describe('Stupsen', () => {
  const nudge = (cardId: string, from = rene.id, to = conny.id, template: string = 'think') =>
    store.createNudges(cardId, from, { to: [to], template }).sent[0]!.nudgeId;
  const nudgeCalls = () => calls.filter((c) => c.data.data?.actions);

  it('stellt einen Stups als Nachricht mit drei Knöpfen zu', async () => {
    const c = card({ title: 'Mülltonne raus' });
    const id = nudge(c.id);
    const n = makeNotifier();
    await n.tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.service).toBe('svc_conny');
    expect(calls[0]!.data).toMatchObject({
      title: 'Rene stupst dich',
      message: 'Mülltonne raus · Denkst du dran?',
      data: { tag: `stups-card-${c.id}`, group: 'stups' },
    });
    expect(calls[0]!.data.data.actions).toEqual([
      { action: `KANBAN_NUDGE_DONE:${id}`, title: 'Erledigt' },
      { action: `KANBAN_NUDGE_ACK:${id}`, title: 'Mach ich' },
      { action: `KANBAN_NUDGE_LATER:${id}`, title: 'Später' },
    ]);
    expect(calls[0]!.data.data.push).toBeUndefined(); // normale Stufe, bricht nicht durch den Fokus
  });

  it('sendet nicht doppelt, auch nicht nach einem Neustart', async () => {
    nudge(card({}).id);
    await makeNotifier().tick();
    await makeNotifier().tick(); // „Neustart": neuer Notifier, gleiche Datenbank
    expect(calls).toHaveLength(1);
  });

  it('hält einen Stups in der Ruhezeit zurück und stellt ihn zum Ende zu', async () => {
    now = new Date('2026-11-01T22:30:00Z'); // 23:30 Berlin
    const c = card({});
    nudge(c.id);
    const n = makeNotifier();
    await n.tick();
    expect(calls).toHaveLength(0);

    now = new Date('2026-11-02T05:59:00Z');
    await n.tick();
    expect(calls).toHaveLength(0);
    now = new Date('2026-11-02T06:00:00Z'); // 07:00 Berlin
    await n.tick();
    expect(calls).toHaveLength(1);
  });

  it('versucht es bei einem Fehler erneut und gibt nach drei Versuchen auf', async () => {
    nudge(card({}).id);
    failing.add('svc_conny');
    const lines: string[] = [];
    const n = makeNotifier({ log: { info: () => undefined, warn: (m: string) => lines.push(m) } } as never);
    await n.tick();
    expect(calls).toHaveLength(0);

    failing.delete('svc_conny');
    now = new Date(now.getTime() + 30_000);
    await n.tick();
    expect(calls).toHaveLength(0); // erst nach einer Minute wieder
    now = new Date(now.getTime() + 61_000);
    await n.tick();
    expect(calls).toHaveLength(1);
  });

  it('„Mach ich" antwortet dem Absender leise und räumt die Nachricht ab', async () => {
    const c = card({ title: 'Mülltonne raus' });
    const id = nudge(c.id);
    const n = makeNotifier();
    await n.tick();
    calls.length = 0;

    expect(await n.handleAction({ action: `KANBAN_NUDGE_ACK:${id}`, userId: 'ha-conny' })).toBe('acked');
    expect(store.getNudge(id)!.reply).toBe('ack');
    const feedback = calls.filter((x) => x.data.message?.includes("macht's"));
    expect(feedback).toHaveLength(2); // beide Geräte von René
    expect(feedback[0]!.data).toMatchObject({
      title: 'Mülltonne raus',
      message: "Conny macht's 👍",
      data: { push: { 'interruption-level': 'passive' } },
    });
    expect(calls.some((x) => x.service === 'svc_conny' && x.data.message === 'clear_notification')).toBe(true);

    calls.length = 0;
    expect(await n.handleAction({ action: `KANBAN_NUDGE_ACK:${id}`, userId: 'ha-conny' })).toBe('stale'); // zweiter Tipp
    expect(calls).toHaveLength(0);
  });

  it('„Später" stellt in einer Stunde noch einmal zu, nach dem dritten Mal ohne den Knopf, ohne Rückmeldung an den Absender', async () => {
    const id = nudge(card({}).id);
    const n = makeNotifier();
    await n.tick();

    for (let round = 1; round <= 3; round++) {
      calls.length = 0;
      expect(await n.handleAction({ action: `KANBAN_NUDGE_LATER:${id}`, userId: 'ha-conny' })).toBe('postponed');
      expect(calls.every((x) => x.service === 'svc_conny')).toBe(true); // nur Abräumen, der Absender erfährt nichts
      expect(store.getNudge(id)!.laterCount).toBe(round);

      now = new Date(now.getTime() + 59 * 60_000);
      await n.tick();
      expect(nudgeCalls()).toHaveLength(0);
      now = new Date(now.getTime() + 60_000);
      await n.tick();
      expect(nudgeCalls()).toHaveLength(1);
      const names = nudgeCalls()[0]!.data.data.actions.map((a: { title: string }) => a.title);
      expect(names).toEqual(round < 3 ? ['Erledigt', 'Mach ich', 'Später'] : ['Erledigt', 'Mach ich']);
    }
    expect(await n.handleAction({ action: `KANBAN_NUDGE_LATER:${id}`, userId: 'ha-conny' })).toBe('stale');
  });

  it('„Erledigt" erledigt die Karte und meldet es dem Absender', async () => {
    const c = card({ title: 'Mülltonne raus', assigneeIds: [conny.id] });
    const id = nudge(c.id);
    const n = makeNotifier();
    await n.tick();
    calls.length = 0;

    expect(await n.handleAction({ action: `KANBAN_NUDGE_DONE:${id}`, userId: 'ha-conny' })).toBe('completed');
    await n.idle();
    expect(store.getCard(c.id).completedAt).not.toBeNull();
    expect(store.listCompletions(c.id)[0]).toMatchObject({ source: 'push', completedBy: conny.id });
    const feedback = calls.filter((x) => x.data.message === 'Conny hat erledigt ✓');
    expect(feedback.map((x) => x.service).sort()).toEqual(['svc_rene', 'svc_rene_ipad']);
    expect(calls.some((x) => x.service === 'svc_conny' && x.data.message === 'clear_notification')).toBe(true);
  });

  it('„Erledigt" bei einer Wiederholung: neue Karte, Nachricht wird durch die Bestätigung ersetzt', async () => {
    const c = card({ title: 'Müll', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id], recurrence: { type: 'fixed', freq: 'daily', every: 2 } });
    const id = nudge(c.id);
    const n = makeNotifier();
    await n.tick();
    calls.length = 0;

    expect(await n.handleAction({ action: `KANBAN_NUDGE_DONE:${id}`, userId: 'ha-conny' })).toBe('completed');
    await n.idle();
    expect(store.getBoardView(boardId).cards.some((x) => x.repeatedFrom === c.id)).toBe(true);
    expect(calls.some((x) => x.service === 'svc_conny' && String(x.data.message).startsWith('Erledigt · nächste Karte'))).toBe(true);
  });

  it('wer erledigt, ohne der Empfänger zu sein, löst dieselbe Rückmeldung aus; erledigt der Absender selbst, gibt es keine', async () => {
    const c1 = card({ title: 'A' });
    nudge(c1.id);
    const n = makeNotifier();
    await n.tick();
    calls.length = 0;
    store.completeCard(c1.id, { by: conny.id, source: 'app' }); // Conny erledigt in der App
    await n.idle();
    expect(calls.filter((x) => x.data.message === 'Conny hat erledigt ✓')).toHaveLength(2);
    // ihre Nachricht auf dem Gerät wird abgeräumt, auch wenn sie nicht zuständig war
    await n.clearFor(c1.id);
    expect(calls.some((x) => x.service === 'svc_conny' && x.data.message === 'clear_notification')).toBe(true);

    calls.length = 0;
    const c2 = card({ title: 'B' });
    nudge(c2.id);
    store.completeCard(c2.id, { by: rene.id, source: 'app' }); // der Absender selbst
    await n.idle();
    expect(calls.filter((x) => String(x.data.message).includes('erledigt'))).toHaveLength(0);
  });

  it('veraltete oder fremde Tipps tun nichts', async () => {
    const c = card({ title: 'Mülltonne raus' });
    const id = nudge(c.id);
    const n = makeNotifier();
    await n.tick();
    calls.length = 0;

    expect(await n.handleAction({ action: `KANBAN_NUDGE_ACK:${id}`, userId: 'ha-rene' })).toBe('ignored'); // nicht der Empfänger
    expect(await n.handleAction({ action: `KANBAN_NUDGE_ACK:${id}` })).toBe('ignored'); // unbekannter Benutzer
    expect(await n.handleAction({ action: 'KANBAN_NUDGE_ACK:gibt-es-nicht', userId: 'ha-conny' })).toBe('stale');
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    calls.length = 0;
    expect(await n.handleAction({ action: `KANBAN_NUDGE_DONE:${id}`, userId: 'ha-conny' })).toBe('stale'); // Karte schon erledigt
    expect(calls).toHaveLength(0);
    expect(store.getNudge(id)!.reply).toBe('closed');
  });

  it('das bestehende „Erledigt" aus alten Nachrichten funktioniert weiter', async () => {
    const c = card({ dueAt: '2026-11-01T09:00:00Z', assigneeIds: [conny.id] });
    const n = makeNotifier();
    expect(await n.handleAction({ action: `KANBAN_DONE:${c.id}:2026-11-01T09:00:00.000Z`, userId: 'ha-conny' })).toBe('completed');
  });
});
describe('Beta: Aktionen mit eigenem Präfix', () => {
  const due = '2026-11-01T09:00:00.000Z';

  it('die Knöpfe der Beta tragen BETA_ vor der Aktion', async () => {
    const c = card({ dueAt: due, assigneeIds: [conny.id] });
    const n = makeNotifier({ actionPrefix: 'BETA_' });
    now = new Date(due);
    await n.tick();
    expect(calls[0]!.data.data.actions[0].action).toBe(`BETA_KANBAN_DONE:${c.id}:${due}`);
  });

  it('die Beta führt nur ihre eigenen Aktionen aus; die der normalen App ignoriert sie', async () => {
    const c = card({ dueAt: due, assigneeIds: [conny.id] });
    const beta = makeNotifier({ actionPrefix: 'BETA_' });
    expect(await beta.handleAction({ action: `KANBAN_DONE:${c.id}:${due}`, userId: 'ha-conny' })).toBe('ignored');
    expect(store.getCard(c.id).completedAt).toBeNull();
    expect(await beta.handleAction({ action: `BETA_KANBAN_DONE:${c.id}:${due}`, userId: 'ha-conny' })).toBe('completed');
    expect(store.getCard(c.id).completedAt).not.toBeNull();
  });

  it('die normale App ignoriert Aktionen der Beta, auch wenn die Karte bei ihr dieselbe Kennung hat (kopierte Daten)', async () => {
    const c = card({ dueAt: due, assigneeIds: [conny.id] });
    const stable = makeNotifier();
    expect(await stable.handleAction({ action: `BETA_KANBAN_DONE:${c.id}:${due}`, userId: 'ha-conny' })).toBe('ignored');
    expect(await stable.handleAction({ action: 'BETA_KANBAN_NUDGE_ACK:x', userId: 'ha-conny' })).toBe('ignored');
    expect(store.getCard(c.id).completedAt).toBeNull();
  });

  it('Stups-Knöpfe der Beta: Erledigt, Mach ich und Später tragen das Präfix und kommen so zurück', async () => {
    const c = card({ title: 'Mülltonne raus' });
    const id = store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' }).sent[0]!.nudgeId;
    const n = makeNotifier({ actionPrefix: 'BETA_' });
    await n.tick();
    const actions = calls.filter((x) => x.data.data?.actions)[0]!.data.data.actions.map((a: { action: string }) => a.action);
    expect(actions).toEqual([`BETA_KANBAN_NUDGE_DONE:${id}`, `BETA_KANBAN_NUDGE_ACK:${id}`, `BETA_KANBAN_NUDGE_LATER:${id}`]);
    expect(await n.handleAction({ action: `KANBAN_NUDGE_ACK:${id}`, userId: 'ha-conny' })).toBe('ignored');
    expect(await n.handleAction({ action: `BETA_KANBAN_NUDGE_ACK:${id}`, userId: 'ha-conny' })).toBe('acked');
  });
});
