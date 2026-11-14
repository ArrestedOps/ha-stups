import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccounts } from '../src/accounts.js';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { identityAuth } from '../src/identity.js';
import { createNotifier } from '../src/notifications.js';
import { createActionTokens } from '../src/ntfy.js';
import { createRoundTrips, pushActionRoutes } from '../src/push-action.js';
import { TEST_ACTION, type PushMessage } from '../src/push.js';
import { clientGuard, createSessionIdentity } from '../src/session-auth.js';
import { createStore, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';
const DUE = '2026-11-01T09:00:00.000Z';

let app: FastifyInstance;
let store: Store;
let now: Date;
let sent: { to: string; message: PushMessage }[];
let cleared: { to: string; tag: string }[];
let tokens: ReturnType<typeof createActionTokens>;
let roundTrips: ReturnType<typeof createRoundTrips>;
let anna: { id: string };
let ben: { id: string };
let boardId: string;
let openCol: string;

beforeEach(async () => {
  now = new Date('2026-11-01T07:00:00Z');
  const db = openDb(':memory:');
  store = createStore(db, { now: () => now, timeZone: () => TZ });
  const accounts = createAccounts(db, store);
  anna = { id: (await accounts.create({ username: 'anna', password: 'ein-langes-passwort' })).userId };
  // Ben ist eine Person ohne Konto (und ohne Kennung): Knöpfe müssen auch für ihn gehen
  ben = store.addPerson({ name: 'Ben' });
  store.setNtfyTopic(ben.id, 'ben-topf');
  const board = store.createBoard({ name: 'Haushalt' });
  boardId = board.id;
  openCol = store.getBoardView(board.id).columns[0]!.id;

  sent = [];
  cleared = [];
  tokens = createActionTokens({ secret: () => store.pushSecret(), now: () => now.getTime() });
  roundTrips = createRoundTrips(() => now);
  const notifier = createNotifier({
    store,
    push: {
      canReach: () => true,
      send: async (to, message) => {
        sent.push({ to, message });
        return true;
      },
      clear: async (to, tag) => void cleared.push({ to, tag }),
    },
    options: parseOptions({ daily_summary_time: '23:59', overdue_nag_time: '18:00' }),
    now: () => now,
    timeZone: () => TZ,
  });

  app = Fastify();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  await app.register(pushActionRoutes, { tokens, notifier, store, roundTrips });
  app.get('/api/boards', async () => []);
});

const card = (extra: object = {}) => store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', dueAt: DUE, assigneeIds: [anna.id], ...extra }, anna.id);

// So kommt der Knopf an: text/plain, das Token im Rumpf, weder Cookie noch Kopfzeile des Clients
const press = (token: string) => app.inject({ method: 'POST', url: '/api/push/action', headers: { 'content-type': 'text/plain' }, payload: token });

describe('Rückweg der Knöpfe (ntfy)', () => {
  it('„Erledigt" erledigt die Aufgabe für die Person im Token, ohne Sitzung und ohne Kopfzeile des Clients', async () => {
    const c = card();
    const res = await press(tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'completed' });
    expect(store.getCard(c.id).completedAt).not.toBeNull();
    expect(cleared).toEqual([{ to: anna.id, tag: `stups-card-${c.id}` }]);
  });

  it('ein zweiter Tipp ist kein Fehler: „schon erledigt", damit die Nachricht trotzdem verschwindet', async () => {
    const c = card();
    const token = tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` });
    await press(token);
    const again = await press(token);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ result: 'already_done' });
  });

  it('ein Termin, der sich inzwischen geändert hat, erledigt nichts', async () => {
    const c = card();
    const token = tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` });
    store.updateCard(c.id, { dueAt: '2026-11-02T09:00:00.000Z' });
    expect((await press(token)).json()).toEqual({ result: 'stale' });
    expect(store.getCard(c.id).completedAt).toBeNull();
  });

  it('Stups beantworten: „Mach ich" und „Später" gehen auch für eine Person ohne Konto', async () => {
    const c = card({ assigneeIds: [ben.id] });
    const nudge = store.createNudges(c.id, anna.id, { to: [ben.id], template: 'think' }).sent[0]!;
    const ack = await press(tokens.sign({ personId: ben.id, action: `KANBAN_NUDGE_ACK:${nudge.nudgeId}` }));
    expect(ack.json()).toEqual({ result: 'acked' });
    expect(store.getNudge(nudge.nudgeId)?.reply).toBe('ack');
  });

  it('ein Stups, der nicht an die Person im Token ging, wird nicht beantwortet', async () => {
    const c = card({ assigneeIds: [ben.id] });
    const nudge = store.createNudges(c.id, anna.id, { to: [ben.id], template: 'think' }).sent[0]!;
    const res = await press(tokens.sign({ personId: anna.id, action: `KANBAN_NUDGE_DONE:${nudge.nudgeId}` }));
    expect(res.json()).toEqual({ result: 'ignored' });
    expect(store.getCard(c.id).completedAt).toBeNull();
  });

  it('der Testknopf merkt sich den Zeitpunkt und fasst keine Aufgabe an', async () => {
    const c = card();
    expect(roundTrips.last(anna.id)).toBeNull();
    const res = await press(tokens.sign({ personId: anna.id, action: TEST_ACTION }));
    expect(res.json()).toEqual({ result: 'test' });
    expect(roundTrips.last(anna.id)).toBe(now.toISOString());
    expect(store.getCard(c.id).completedAt).toBeNull();
  });

  it('das Token darf auch als JSON kommen', async () => {
    const c = card();
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/action',
      headers: { 'x-stups-client': 'test' },
      payload: { token: tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` }) },
    });
    expect(res.json()).toEqual({ result: 'completed' });
  });
});

describe('Abwehr', () => {
  it('ohne Token, mit kaputtem, fremd signiertem oder abgelaufenem Token: 403 und nichts passiert', async () => {
    const c = card();
    const good = tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` });
    const foreign = createActionTokens({ secret: () => 'anderes-geheimnis', now: () => now.getTime() }).sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` });
    const expired = tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` }, -1000);

    for (const payload of ['unsinn', `${good}x`, foreign, expired]) {
      const res = await press(payload);
      expect(res.statusCode).toBe(403);
    }
    expect((await app.inject({ method: 'POST', url: '/api/push/action' })).statusCode).toBe(403);
    expect(store.getCard(c.id).completedAt).toBeNull();
  });

  it('ein Token für eine Person, die es nicht mehr gibt, gilt nicht', async () => {
    const c = card();
    expect((await press(tokens.sign({ personId: 'gibt-es-nicht', action: `KANBAN_DONE:${c.id}:${DUE}` }))).statusCode).toBe(403);
  });

  it('falsche Tokens sperren nichts: richtige gelten danach weiter (kein Weg, die Knöpfe aller lahmzulegen)', async () => {
    const c = card();
    for (let i = 0; i < 20; i++) expect((await press('falsch')).statusCode).toBe(403);
    expect((await press(tokens.sign({ personId: anna.id, action: `KANBAN_DONE:${c.id}:${DUE}` }))).statusCode).toBe(200);
  });

  it('der Rest der API bleibt hinter der Anmeldung, und die Kopfzeile des Clients bleibt Pflicht', async () => {
    expect((await app.inject({ url: '/api/boards' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/boards', payload: {} })).statusCode).toBe(403);
  });
});

describe('Geheimnis der Knöpfe', () => {
  it('entsteht beim ersten Gebrauch und bleibt danach gleich', () => {
    const first = store.pushSecret();
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(store.pushSecret()).toBe(first);
  });
});
