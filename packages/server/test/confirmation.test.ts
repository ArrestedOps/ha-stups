import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { ConflictError } from '../src/errors.js';
import { ingressAuth } from '../src/ingress.js';
import { createNotifier, type Notifier } from '../src/notifications.js';
import type { PushGateway, PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

// Bestätigung: Ein Kind hakt ab, die Aufgabe bleibt offen, bis ein Bestätiger „Bestätigen" sagt. Alles mit fester Uhr.
const TZ = 'Europe/Berlin';
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const mia = as('ha-mia', 'Mia'); // Kind, braucht Bestätigung
const ben = as('ha-ben', 'Ben'); // Bestätiger
const oma = as('ha-oma', 'Oma'); // Mitglied, aber nicht gewählt
const admin = as('ha-admin', 'Admin');

let now: Date;
let db: ReturnType<typeof openDb>;
let store: Store;
let app: FastifyInstance;
let notifier: Notifier;
let sent: { userId: string; message: PushMessage }[];
let cleared: { userId: string; tag: string }[];
let miaId: string;
let benId: string;
let omaId: string;
let adminId: string;
let boardId: string;
let colId: string;
let cardId: string;

const gateway: PushGateway = {
  canReach: () => true,
  send: async (userId, message) => {
    sent.push({ userId, message });
    return true;
  },
  clear: async (userId, tag) => void cleared.push({ userId, tag }),
};
const to = (userId: string) => sent.filter((s) => s.userId === userId).map((s) => s.message);
const at = (iso: string) => void (now = new Date(iso));
const post = (who: object, url: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: who as Record<string, string>, payload });
const state = () => store.getCard(cardId);

beforeEach(async () => {
  at('2026-11-04T09:00:00Z');
  sent = [];
  cleared = [];
  db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => TZ });
  miaId = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  omaId = store.addPerson({ haUserId: 'ha-oma', name: 'Oma' }).id;
  adminId = store.addPerson({ haUserId: 'ha-admin', name: 'Admin' }).id;
  store.setChild(miaId, { isChild: true, confirmDefault: true, confirmers: [benId] });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  colId = store.getBoardView(b.id).columns[0]!.id;
  cardId = store.createCard(boardId, { columnId: colId, title: 'Zimmer aufräumen', dueAt: '2026-11-04T16:00:00.000Z', assigneeIds: [miaId] }, benId).id;

  notifier = createNotifier({ store, push: gateway, options: parseOptions({ daily_summary_time: '23:59', overdue_nag_time: '23:00' }), now: () => now, timeZone: () => TZ });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, notifier, directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] } });
});

describe('Wann braucht „Erledigt" eine Bestätigung', () => {
  it('Vorgabe der Person gilt, wenn die Aufgabe nichts sagt', () => {
    expect(store.needsConfirmation(cardId, miaId)).toBe(true);
  });

  it('die Aufgabe kann es überschreiben: aus oder ein', () => {
    store.updateCard(cardId, { confirm: 'off' });
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
    store.setChild(miaId, { confirmDefault: false });
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
    store.updateCard(cardId, { confirm: 'on' });
    expect(store.needsConfirmation(cardId, miaId)).toBe(true);
    store.updateCard(cardId, { confirm: null });
    expect(store.needsConfirmation(cardId, miaId)).toBe(false); // zurück auf die Vorgabe der Person: aus
  });

  it('nur für ein Kind, dem die Aufgabe zugewiesen ist; nie für Erwachsene', () => {
    expect(store.needsConfirmation(cardId, benId)).toBe(false);
    store.updateCard(cardId, { assigneeIds: [benId] });
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
  });

  it('unbekannte Aufgabe, gelöschte Aufgabe oder unbekannte Person: nie', () => {
    expect(store.needsConfirmation('gibt-es-nicht', miaId)).toBe(false);
    expect(store.needsConfirmation(cardId, 'gibt-es-nicht')).toBe(false);
    db.prepare('update cards set deleted_at = ? where id = ?').run(now.toISOString(), cardId);
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
  });

  it('ein Erwachsener braucht auch bei ausdrücklich eingeschalteter Aufgabe keine Bestätigung', () => {
    store.updateCard(cardId, { confirm: 'on', assigneeIds: [benId] });
    expect(store.needsConfirmation(cardId, benId)).toBe(false);
  });

  it('wer kein Eintrag der Personenliste mehr ist, braucht keine Bestätigung', () => {
    store.updateCard(cardId, { confirm: 'on' });
    expect(store.needsConfirmation(cardId, miaId)).toBe(true);
    db.prepare('update users set is_person = 0 where id = ?').run(miaId);
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
  });

  it('eine schon erledigte Aufgabe braucht nichts mehr', () => {
    store.completeCard(cardId, { by: benId, source: 'app' });
    expect(store.needsConfirmation(cardId, miaId)).toBe(false);
  });

  it('die Einstellung der Aufgabe wird geprüft', () => {
    expect(() => store.updateCard(cardId, { confirm: 'vielleicht' })).toThrow(/Bestätigung/);
  });

  it('die nächste Aufgabe einer Wiederholung und eine Kopie behalten die Einstellung', () => {
    store.updateCard(cardId, { confirm: 'off', recurrence: { type: 'fixed', freq: 'daily', every: 1 } });
    const res = store.completeCard(cardId, { by: benId, source: 'app' });
    expect(store.getCard(res.nextCardId!).confirm).toBe('off');
    expect(store.duplicateCard(res.nextCardId!, benId).confirm).toBe('off');
  });
});

describe('Wer bestätigen darf', () => {
  it('die gewählten Personen und Administratoren, sonst niemand', () => {
    expect(store.mayConfirm(benId, miaId, false)).toBe(true);
    expect(store.mayConfirm(omaId, miaId, false)).toBe(false);
    expect(store.mayConfirm(omaId, miaId, true)).toBe(true); // Administrator
    expect(store.mayConfirm(miaId, miaId, true)).toBe(false); // nie das Kind selbst
  });

  it('ohne Auswahl dürfen alle Erwachsenen bestätigen, nie ein Kind', () => {
    store.setChild(miaId, { confirmers: [] });
    expect(store.confirmerIds(miaId).sort()).toEqual([benId, omaId, adminId].sort());
    const lena = store.addPerson({ haUserId: 'ha-lena', name: 'Lena' }).id;
    store.setChild(lena, { isChild: true });
    expect(store.confirmerIds(miaId)).not.toContain(lena);
  });

  it('das Kind steht nie unter den gewählten Bestätigern, auch nicht als Altlast in der Datenbank', () => {
    db.prepare('insert into child_confirmers (child_id, user_id) values (?, ?)').run(miaId, miaId);
    expect(store.confirmerIds(miaId)).toEqual([benId]);
    db.prepare('delete from child_confirmers where child_id = ? and user_id = ?').run(miaId, benId);
    // nur das Kind gewählt: gilt als Auswahl, es bleibt niemand übrig
    expect(store.confirmerIds(miaId)).toEqual([]);
  });

  it('mayConfirm: ohne bekanntes Kind nur mit Administratorrecht', () => {
    expect(store.mayConfirm(benId, null, false)).toBe(false);
    expect(store.mayConfirm(benId, null, true)).toBe(true);
  });
});

describe('Anfrage statt Erledigen (Schnittstelle)', () => {
  it('ein Kind löst nur eine Anfrage aus: die Aufgabe bleibt offen, nichts wird gezählt', async () => {
    const res = await post(mia, `/api/cards/${cardId}/complete`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.completionId).toBeNull();
    expect(body.awaitingConfirmation).toBe(true);
    expect(body.card.completedAt).toBeNull();
    expect(body.card.confirmRequestedAt).toBe(now.toISOString());
    expect(body.card.confirmRequestedBy).toBe(miaId);
    expect(store.listCompletions(cardId)).toEqual([]);
    expect(store.fairness('week').total.done).toBe(0);
  });

  it('ein zweites Abhaken ändert nichts und meldet nicht noch einmal', async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    const first = to(benId).length;
    at('2026-11-04T09:05:00Z');
    const res = await post(mia, `/api/cards/${cardId}/complete`);
    expect(res.json().awaitingConfirmation).toBe(true);
    expect(res.json().card.confirmRequestedAt).toBe('2026-11-04T09:00:00.000Z');
    expect(to(benId)).toHaveLength(first);
  });

  it('ohne Bestätigungspflicht erledigt das Kind wie bisher', async () => {
    store.updateCard(cardId, { confirm: 'off' });
    const res = await post(mia, `/api/cards/${cardId}/complete`);
    expect(res.json().completionId).toEqual(expect.any(String));
    expect(res.json().awaitingConfirmation).toBeUndefined();
    expect(store.getCard(cardId).completedAt).not.toBeNull();
  });

  it('Erwachsene erledigen immer sofort, auch Aufgaben von Kindern', async () => {
    const res = await post(ben, `/api/cards/${cardId}/complete`);
    expect(res.json().completionId).toEqual(expect.any(String));
  });
});

describe('Bestätigen und „Nochmal" (Schnittstelle)', () => {
  beforeEach(async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    sent = [];
  });

  it('Bestätigen erledigt die Aufgabe und zählt auf das Kind', async () => {
    at('2026-11-04T10:00:00Z');
    const res = await post(ben, `/api/cards/${cardId}/confirm`);
    expect(res.statusCode).toBe(200);
    expect(res.json().card.completedAt).toBe(now.toISOString());
    expect(res.json().card.confirmRequestedAt).toBeNull();
    const [c] = store.listCompletions(cardId);
    expect(c!.completedBy).toBe(miaId);
    const mine = store.fairness('week').people.find((p) => p.id === miaId)!;
    expect(mine.done).toBe(1);
  });

  it('Administratoren dürfen immer, auch wenn sie nicht gewählt sind', async () => {
    expect((await post(admin, `/api/cards/${cardId}/confirm`)).statusCode).toBe(200);
  });

  it('wer nicht gewählt ist, darf nicht: 403 und nichts ändert sich', async () => {
    const res = await post(oma, `/api/cards/${cardId}/confirm`);
    expect(res.statusCode).toBe(403);
    expect((await post(oma, `/api/cards/${cardId}/reject`)).statusCode).toBe(403);
    expect(state().confirmRequestedAt).not.toBeNull();
    expect(state().completedAt).toBeNull();
  });

  it('das Kind kann sich nicht selbst bestätigen', async () => {
    expect((await post(mia, `/api/cards/${cardId}/confirm`)).statusCode).toBe(403);
    expect((await post(mia, `/api/cards/${cardId}/reject`)).statusCode).toBe(403);
  });

  it('„Nochmal" nimmt die Anfrage zurück, die Aufgabe bleibt offen und zählt nicht', async () => {
    const res = await post(ben, `/api/cards/${cardId}/reject`);
    expect(res.statusCode).toBe(200);
    expect(res.json().confirmRequestedAt).toBeNull();
    expect(state().completedAt).toBeNull();
    expect(store.listCompletions(cardId)).toEqual([]);
  });

  it('danach kann das Kind es noch einmal versuchen', async () => {
    await post(ben, `/api/cards/${cardId}/reject`);
    const res = await post(mia, `/api/cards/${cardId}/complete`);
    expect(res.json().awaitingConfirmation).toBe(true);
  });

  it('wer zuerst antwortet, gewinnt: die zweite Antwort ist ein Konflikt', async () => {
    expect((await post(ben, `/api/cards/${cardId}/confirm`)).statusCode).toBe(200);
    expect((await post(admin, `/api/cards/${cardId}/confirm`)).statusCode).toBe(409);
    expect((await post(admin, `/api/cards/${cardId}/reject`)).statusCode).toBe(409);
    expect(store.listCompletions(cardId)).toHaveLength(1);
  });

  it('ohne Anfrage gibt es nichts zu bestätigen', async () => {
    const other = store.createCard(boardId, { columnId: colId, title: 'Andere', assigneeIds: [miaId] }, benId).id;
    expect((await post(ben, `/api/cards/${other}/confirm`)).statusCode).toBe(409);
  });

  it('wird die Aufgabe anders erledigt, entfällt die Anfrage', async () => {
    await post(admin, `/api/cards/${cardId}/complete`);
    expect(state().confirmRequestedAt).toBeNull();
    expect((await post(ben, `/api/cards/${cardId}/confirm`)).statusCode).toBe(409);
  });

  it('bei einer Wiederholung zählt die Bestätigung und die nächste Aufgabe beginnt ohne Anfrage', async () => {
    const rec = store.createCard(boardId, { columnId: colId, title: 'Müll', dueAt: '2026-11-04T16:00:00.000Z', assigneeIds: [miaId], recurrence: { type: 'fixed', freq: 'daily', every: 1 } }, benId).id;
    await post(mia, `/api/cards/${rec}/complete`);
    const res = await post(ben, `/api/cards/${rec}/confirm`);
    expect(res.json().nextCardId).toEqual(expect.any(String));
    expect(store.getCard(res.json().nextCardId).confirmRequestedAt).toBeNull();
  });
});

describe('Antwort direkt im Store', () => {
  it('ohne Anfrage: Konflikt mit Meldung, nichts wird erledigt', () => {
    expect(() => store.answerConfirmation(cardId, 'confirm', 'app')).toThrow(ConflictError);
    expect(() => store.answerConfirmation(cardId, 'reject', 'app')).toThrow('Es wartet nichts auf Bestätigung');
    expect(state().completedAt).toBeNull();
    expect(store.listCompletions(cardId)).toEqual([]);
  });

  it('„Nochmal“ zählt die Aufgabe als geändert (Version steigt, Anfrage weg)', () => {
    store.requestConfirmation(cardId, miaId);
    const before = state().version;
    const res = store.answerConfirmation(cardId, 'reject', 'app');
    expect(res.childId).toBe(miaId);
    expect(res.result).toBeNull();
    expect(res.card.confirmRequestedAt).toBeNull();
    expect(state().version).toBeGreaterThan(before);
  });
});

describe('Benachrichtigungen', () => {
  it('die gewählten Bestätiger bekommen eine Nachricht mit „Bestätigen" und „Nochmal", das Kind eine leise Notiz', async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    const m = to(benId);
    expect(m).toHaveLength(1);
    expect(m[0]!.body).toContain('Mia');
    expect(m[0]!.actions!.map((a) => a.title)).toEqual(['Bestätigen', 'Nochmal']);
    expect(to(omaId)).toEqual([]); // nicht gewählt
    const note = to(miaId);
    expect(note).toHaveLength(1);
    expect(note[0]!.body).toBe('Wartet auf Bestätigung');
    expect(note[0]!.tag).toBe(`stups-card-${cardId}`); // ersetzt die Erinnerung
  });

  it('ohne Auswahl bekommen alle Erwachsenen die Nachricht', async () => {
    store.setChild(miaId, { confirmers: [] });
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    expect([benId, omaId, adminId].map((id) => to(id).length)).toEqual([1, 1, 1]);
  });

  it('Tipp auf „Bestätigen" in der Nachricht: erledigt, das Kind erfährt es, die Nachricht der anderen verschwindet', async () => {
    store.setChild(miaId, { confirmers: [benId, adminId] });
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    const yes = to(benId)[0]!.actions![0]!.id;
    sent = [];
    const result = await notifier.handleAction({ action: yes, personId: benId });
    expect(result).toBe('confirmed');
    expect(state().completedAt).not.toBeNull();
    expect(store.listCompletions(cardId)[0]!.completedBy).toBe(miaId);
    expect(to(miaId).map((m) => m.body)).toEqual(['Bestätigt von Ben ✓']);
    expect(cleared.map((c) => c.userId).sort()).toEqual([benId, adminId].sort());
    // wer danach tippt, kommt zu spät
    expect(await notifier.handleAction({ action: yes, personId: adminId })).toBe('stale');
  });

  it('Tipp auf „Nochmal": die Anfrage entfällt, das Kind bekommt es leise und, wenn es nicht schläft, ins Haus', async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    const no = to(benId)[0]!.actions![1]!.id;
    sent = [];
    expect(await notifier.handleAction({ action: no, personId: benId })).toBe('rejected');
    expect(state().confirmRequestedAt).toBeNull();
    expect(state().completedAt).toBeNull();
    const m = to(miaId);
    expect(m).toHaveLength(1);
    expect(m[0]!.body).toBe('Ben: Nochmal, bitte');
    expect(m[0]!.kind).toBe('nudge');
    expect(m[0]!.spoken).toContain('Zimmer aufräumen');
  });

  it('in der Ruhezeit des Kindes keine Ansage im Haus', async () => {
    store.setNudgeQuiet(miaId, { start: '22:00', end: '07:00', off: false });
    at('2026-11-04T22:30:00Z'); // 23:30 Berlin
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    const no = to(benId)[0]!.actions![1]!.id;
    sent = [];
    await notifier.handleAction({ action: no, personId: benId });
    expect(to(miaId)).toHaveLength(1);
    expect(to(miaId)[0]!.kind).toBeUndefined(); // aufs Handy ja, ins Haus nicht
  });

  it('wer nicht bestätigen darf, wird ignoriert', async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    const yes = to(benId)[0]!.actions![0]!.id;
    expect(await notifier.handleAction({ action: yes, personId: omaId })).toBe('ignored');
    expect(await notifier.handleAction({ action: yes, personId: miaId })).toBe('ignored');
    expect(state().completedAt).toBeNull();
  });

  it('„Erledigt" aus einer Erinnerung oder einem Stups wird für ein Kind ebenfalls zur Anfrage', async () => {
    const dueKey = state().dueAt!;
    const r1 = await notifier.handleAction({ action: `KANBAN_DONE:${cardId}:${dueKey}`, personId: miaId });
    expect(r1).toBe('awaiting');
    expect(state().completedAt).toBeNull();
    expect(state().confirmRequestedAt).not.toBeNull();
    expect(to(benId)).toHaveLength(1);

    const other = store.createCard(boardId, { columnId: colId, title: 'Spülmaschine', assigneeIds: [miaId] }, benId).id;
    store.setNotifyServices(miaId, ['notify.mobile_app_mia']);
    const { sent: nudges } = store.createNudges(other, benId, { to: [miaId], template: 'think' });
    const r2 = await notifier.handleAction({ action: `KANBAN_NUDGE_DONE:${nudges[0]!.nudgeId}`, personId: miaId });
    expect(r2).toBe('awaiting');
    expect(store.getCard(other).completedAt).toBeNull();
    expect(store.getCard(other).confirmRequestedAt).not.toBeNull();
  });

  it('unbeantwortete Anfragen: höchstens eine Erinnerung am Tag, erst nach zwei Stunden', async () => {
    await post(mia, `/api/cards/${cardId}/complete`);
    await notifier.idle();
    sent = [];
    at('2026-11-04T10:00:00Z'); // eine Stunde
    await notifier.tick();
    expect(to(benId)).toEqual([]);
    at('2026-11-04T11:30:00Z'); // 2,5 Stunden
    await notifier.tick();
    await notifier.tick();
    expect(to(benId)).toHaveLength(1);
    expect(to(benId)[0]!.body).toContain('Mia');
    at('2026-11-04T15:00:00Z'); // am selben Tag nicht noch einmal
    await notifier.tick();
    expect(to(benId)).toHaveLength(1);
    at('2026-11-05T11:00:00Z'); // am nächsten Tag wieder
    await notifier.tick();
    expect(to(benId)).toHaveLength(2);
  });
});

describe('Offene Anfrage und Verschieben der Aufgabe', () => {
  const doneCol = () => store.getBoardView(boardId).columns.find((c) => c.isDone)!.id;

  it('Ablegen in „Erledigt“ beendet die Anfrage; Zurückziehen bringt sie nicht wieder', () => {
    store.requestConfirmation(cardId, miaId);
    expect(store.openConfirmations()).toHaveLength(1);
    store.moveCard(cardId, { columnId: doneCol() }, benId);
    expect(state().confirmRequestedAt).toBeNull();
    store.moveCard(cardId, { columnId: colId }, benId);
    expect(state().confirmRequestedAt).toBeNull();
    expect(store.openConfirmations()).toHaveLength(0);
  });

  it('Wiedereröffnen aus „Erledigt“ löscht eine übrig gebliebene Anfrage', () => {
    store.moveCard(cardId, { columnId: doneCol() }, benId);
    store.requestConfirmation(cardId, miaId); // Anfrage trotz erledigter Aufgabe (Altbestand)
    store.moveCard(cardId, { columnId: colId }, benId);
    expect(state().confirmRequestedAt).toBeNull();
  });

  it('Zurückholen aus dem Archiv ebenso', () => {
    store.moveCard(cardId, { columnId: doneCol() }, benId);
    store.setArchived(cardId, true);
    store.requestConfirmation(cardId, miaId);
    store.restoreArchived(cardId, colId, benId);
    expect(state().confirmRequestedAt).toBeNull();
    expect(store.openConfirmations()).toHaveLength(0);
  });
});
