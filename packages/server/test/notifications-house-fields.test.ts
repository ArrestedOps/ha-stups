import { beforeEach, describe, expect, it } from 'vitest';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notifications.js';
import type { PushGateway, PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

// Die Felder `kind` und `spoken` an der Nachricht: der Haus-Weg (Ansage, Lampe) braucht die Art und einen eigenen, kurzen Satz.
const TZ = 'Europe/Berlin';

let now: Date;
let store: Store;
let sent: { userId: string; message: PushMessage }[];
let rene: { id: string; displayName: string };
let conny: { id: string; displayName: string };
let boardId: string;
let openCol: string;

const gateway: PushGateway = {
  canReach: () => true,
  send: async (userId, message) => {
    sent.push({ userId, message });
    return true;
  },
  clear: async () => undefined,
};

const notifier = (daily = '23:59') =>
  createNotifier({ store, push: gateway, options: parseOptions({ daily_summary_time: daily, overdue_nag_time: '18:00' }), now: () => now, timeZone: () => TZ });

const to = (userId: string) => sent.filter((s) => s.userId === userId).map((s) => s.message);

beforeEach(() => {
  now = new Date('2026-11-01T07:00:00Z'); // Sa 08:00 Berlin
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  store.syncPeople([
    { name: 'Rene', notify: ['svc_rene'] },
    { name: 'Conny', notify: ['svc_conny'] },
  ]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openCol = store.getBoardView(b.id).columns[0]!.id;
  sent = [];
});

describe('kind und spoken an der Nachricht', () => {
  it('fällige Aufgabe: kind due und ein kurzer Satz mit Namen, deutsch', async () => {
    store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', dueAt: '2026-11-01T07:00:00Z', assigneeIds: [rene.id] }, rene.id);
    await notifier().tick();
    const m = to(rene.id)[0]!;
    expect(m.kind).toBe('due');
    expect(m.spoken).toBe(`${rene.displayName}, Bad putzen ist fällig.`);
  });

  it('dieselbe Aufgabe in der Sprache des Empfängers (englisch)', async () => {
    store.setLanguage(rene.id, { choice: 'en', effective: 'en' });
    store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', dueAt: '2026-11-01T07:00:00Z', assigneeIds: [rene.id] }, rene.id);
    await notifier().tick();
    expect(to(rene.id)[0]!.spoken).toBe(`${rene.displayName}, Bad putzen is due.`);
  });

  it('Vorab-Erinnerung und Nachhaken sind auch kind due, mit eigenem Satz', async () => {
    store.createCard(boardId, { columnId: openCol, title: 'A', dueAt: '2026-11-01T07:30:00Z', remindBeforeMin: 60, assigneeIds: [rene.id] }, rene.id);
    await notifier().tick();
    expect(to(rene.id)[0]).toMatchObject({ kind: 'due', spoken: `${rene.displayName}, A ist in 1 Stunde fällig.` });

    sent = [];
    now = new Date('2026-11-01T17:30:00Z'); // 18:30 Berlin, am Tag der Fälligkeit
    const muell = store.createCard(boardId, { columnId: openCol, title: 'Müll', dueAt: '2026-10-31T10:00:00Z', assigneeIds: [conny.id] }, rene.id);
    store.setReminder(muell.id, conny.id, { anchor: 'due', afterMin: 1440, everyMin: 1440, max: 99, atTime: null });
    await notifier().tick();
    const nag = to(conny.id).find((m) => m.body.startsWith('Überfällig'));
    expect(nag).toMatchObject({ kind: 'due', spoken: `${conny.displayName}, Müll ist überfällig.` });
  });

  it('Aufgabe vom Wächter zugewiesen: kind watcher', async () => {
    const card = store.createCard(boardId, { columnId: openCol, title: 'Waschmaschine ausräumen', assigneeIds: [rene.id] }, rene.id);
    await notifier().notifyAssigned({ id: card.id, title: card.title, dueAt: null }, [rene.id]);
    expect(to(rene.id)[0]).toMatchObject({ kind: 'watcher', spoken: `${rene.displayName}, neue Aufgabe: Waschmaschine ausräumen.` });
  });

  it('Nachhaken ohne Überfälligkeit: kind due, „noch offen“ im Satz', async () => {
    const card = store.createCard(boardId, { columnId: openCol, title: 'Waschmaschine ausräumen', assigneeIds: [rene.id] }, rene.id);
    store.setReminder(card.id, rene.id, { anchor: 'created', afterMin: 5, everyMin: null, max: 1, atTime: null });
    now = new Date(now.getTime() + 6 * 60_000);
    await notifier().tick();
    expect(to(rene.id)[0]).toMatchObject({ kind: 'due', spoken: `${rene.displayName}, noch offen: Waschmaschine ausräumen.` });
  });

  it('Stups mit Vorlage: kind nudge, Absender, Aufgabe und Text im Satz, Kennung des Stupses dabei', async () => {
    const card = store.createCard(boardId, { columnId: openCol, title: 'Müll rausbringen', assigneeIds: [rene.id, conny.id] }, rene.id);
    store.createNudges(card.id, rene.id, { to: [conny.id], template: 'think' });
    await notifier().tick();
    const m = to(conny.id)[0]!;
    expect(m.kind).toBe('nudge');
    expect(m.nudgeId).toBeTruthy();
    expect(m.open).toEqual({ cardId: card.id });
    expect(m.spoken).toBe(`${conny.displayName}, ${rene.displayName} stupst dich: Müll rausbringen. Denkst du dran?`);
  });

  it('Stups mit eigenem Text: Sonderzeichen und Emoji fallen weg, lange Titel werden gekürzt', async () => {
    const longTitle = 'Ein sehr langer Titel für eine Aufgabe, die im Haus laut vorgelesen werden soll und deshalb gekürzt wird';
    const card = store.createCard(boardId, { columnId: openCol, title: longTitle, assigneeIds: [rene.id, conny.id] }, rene.id);
    store.createNudges(card.id, rene.id, { to: [conny.id], text: 'Bitte bis 18 Uhr 🙏 <b>danke</b>' });
    await notifier().tick();
    const spoken = to(conny.id)[0]!.spoken!;
    expect(spoken).not.toMatch(/[🙏<>]/u);
    expect(spoken).toContain('Bitte bis 18 Uhr');
    expect(spoken).not.toContain(longTitle); // gekürzt auf höchstens 80 Zeichen
    expect(spoken).toContain(longTitle.slice(0, 40));
  });

  it('Stups in der Sprache des Empfängers (englisch)', async () => {
    store.setLanguage(conny.id, { choice: 'en', effective: 'en' });
    const card = store.createCard(boardId, { columnId: openCol, title: 'Müll', assigneeIds: [rene.id, conny.id] }, rene.id);
    store.createNudges(card.id, rene.id, { to: [conny.id], template: 'think' });
    await notifier().tick();
    expect(to(conny.id)[0]!.spoken).toBe(`${conny.displayName}, ${rene.displayName} nudges you: Müll. Are you on it?`);
  });

  it('Tageszusammenfassung und Rückmeldungen tragen kein kind: sie erreichen das Haus nie', async () => {
    store.createCard(boardId, { columnId: openCol, title: 'Heute dran', dueAt: '2026-11-01T15:00:00Z', assigneeIds: [rene.id] }, rene.id);
    await notifier('07:00').tick();
    const summary = to(rene.id).find((m) => m.tag === 'stups-summary');
    expect(summary).toBeDefined();
    expect(summary!.kind).toBeUndefined();
    expect(summary!.spoken).toBeUndefined();
  });
});
