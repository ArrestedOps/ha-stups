import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createActionTokens, createNtfyPush } from '../src/ntfy.js';
import { createRoundTrips } from '../src/push-action.js';
import { combinePush } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({
  'x-remote-user-id': id,
  'x-remote-user-name': name,
  'x-remote-user-display-name': name,
});
const chef = as('ha-chef', 'Chef'); // Administrator
const anna = as('ha-anna', 'Anna');
const ben = as('ha-ben', 'Ben');

let app: FastifyInstance;
let store: Store;
let published: any[];
let accept: boolean;
let publicUrl: string | null;
const roundTrips = createRoundTrips();

async function build(opts: { ntfy: boolean }) {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  published = [];
  accept = true;
  const push = createNtfyPush({
    config: { url: 'https://ntfy.example.org' },
    topicFor: (id) => store.ntfyTopic(id),
    publicUrl,
    tokens: createActionTokens({ secret: () => store.pushSecret() }),
    fetch: (async (_url: string, init: RequestInit) => {
      published.push(JSON.parse(init.body as string));
      return new Response('{}', { status: accept ? 200 : 500 });
    }) as unknown as typeof fetch,
  });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
    push: opts.ntfy ? combinePush([push]) : undefined,
    ntfy: opts.ntfy ? { url: 'https://ntfy.example.org', roundTrip: (id) => roundTrips.last(id) } : undefined,
    capabilities: {
      mode: 'standalone',
      channel: 'stable',
      auth: 'ingress',
      ha: false,
      watchers: false,
      sensors: false,
      house: false,
      push: opts.ntfy ? ['ntfy'] : [],
      publicUrl,
      passkeys: false,
    },
  });
}

beforeEach(async () => {
  publicUrl = 'https://stups.example.org';
  await build({ ntfy: true });
});

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

const idOf = (name: string) => store.people().find((p) => p.name === name)!.id;

describe('ntfy-Thema der Person', () => {
  it('die Person selbst setzt es, ein Administrator auch, andere nicht', async () => {
    const own = await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-geheim-123' });
    expect(own.status).toBe(200);
    expect(own.body.ntfy).toBe(true);
    expect(own.body.ntfyTopic).toBeUndefined(); // das Thema selbst steht nicht in der Antwort der Personenliste
    expect((await call(ben, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'x' })).status).toBe(403);
    expect((await call(chef, 'PATCH', `/api/access/people/${idOf('Ben')}`, { ntfyTopic: 'ben-topf' })).status).toBe(200);
    expect(store.ntfyTopic(idOf('Anna'))).toBe('anna-geheim-123');
    expect(store.ntfyTopic(idOf('Ben'))).toBe('ben-topf');
  });

  it('leer entfernt es, Unsinn wird abgelehnt', async () => {
    const id = idOf('Anna');
    await call(anna, 'PATCH', `/api/access/people/${id}`, { ntfyTopic: 'anna-topf' });
    expect((await call(anna, 'PATCH', `/api/access/people/${id}`, { ntfyTopic: '' })).body.ntfy).toBe(false);
    expect(store.ntfyTopic(id)).toBeNull();
    for (const bad of ['mit leerzeichen', 'ä', 'a/b', 'x'.repeat(65), 5, ['a']]) {
      const res = await call(anna, 'PATCH', `/api/access/people/${id}`, { ntfyTopic: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('das Thema schützt die Nachrichten: in der Liste sehen es nur die Person und Administratoren', async () => {
    await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-topf' });
    const topics = (who: object) => call(who, 'GET', '/api/access').then((r) => Object.fromEntries(r.body.people.map((p: any) => [p.name, p.ntfyTopic])));
    expect(await topics(anna)).toEqual({ Anna: 'anna-topf', Ben: undefined });
    expect(await topics(chef)).toEqual({ Anna: 'anna-topf', Ben: null });
    expect(await topics(ben)).toEqual({ Anna: undefined, Ben: null });
    expect((await call(ben, 'GET', '/api/people')).body.map((p: any) => p.ntfyTopic)).toEqual([undefined, undefined]);
    expect(JSON.stringify((await call(ben, 'GET', '/api/me')).body)).not.toContain('anna-topf');
  });

  it('die Anleitung nennt die Adresse des Servers und ob Knöpfe möglich sind', async () => {
    expect((await call(anna, 'GET', '/api/access')).body.ntfy).toEqual({ url: 'https://ntfy.example.org', buttons: true });
    publicUrl = null;
    await build({ ntfy: true });
    expect((await call(anna, 'GET', '/api/access')).body.ntfy).toEqual({ url: 'https://ntfy.example.org', buttons: false });
  });

  it('ohne ntfy: kein Feld, keine Anleitung, Ändern geht nicht', async () => {
    await build({ ntfy: false });
    expect((await call(anna, 'GET', '/api/access')).body.ntfy).toBeNull();
    expect((await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'x' })).status).toBe(409);
  });
});

describe('Test-Nachricht', () => {
  it('geht an das eigene Thema, mit Knopf für den Rückweg', async () => {
    await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-topf' });
    const res = await call(anna, 'POST', '/api/push/test');
    expect(res.status).toBe(200);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ topic: 'anna-topf', title: 'Stups: Test', actions: [{ label: 'Rückweg prüfen' }] });
  });

  it('ohne Thema: freundliche Meldung, nichts gesendet', async () => {
    const res = await call(ben, 'POST', '/api/push/test');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Push-Weg/);
    expect(published).toHaveLength(0);
  });

  it('lehnt der Server ab, steht das in der Meldung', async () => {
    await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-topf' });
    accept = false;
    const res = await call(anna, 'POST', '/api/push/test');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/nicht angekommen/);
  });
});

describe('Stand der Zustellung', () => {
  it('zeigt je Person, ob ein Thema da ist, und wann der Rückweg zuletzt klappte', async () => {
    await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-topf' });
    roundTrips.record(idOf('Anna'));
    const res = await call(anna, 'GET', '/api/notifications/status');
    expect(res.body.people.map((p: any) => [p.name, p.ntfy])).toEqual([
      ['Anna', true],
      ['Ben', false],
    ]);
    expect(res.body.ntfy).toMatchObject({ url: 'https://ntfy.example.org', buttons: true });
    expect(typeof res.body.ntfy.roundTrip).toBe('string');
    expect((await call(ben, 'GET', '/api/notifications/status')).body.ntfy.roundTrip).toBeNull();
  });

  it('ein Thema zählt als Gerät: Karten mit Zuständigen ohne Gerät werden gemeldet, mit Thema nicht', async () => {
    const board = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(board.id).columns[0]!.id;
    store.createCard(board.id, { columnId: col, title: 'Bad', dueAt: '2099-01-01T09:00:00.000Z', assigneeIds: [idOf('Anna')] }, idOf('Anna'));
    expect((await call(anna, 'GET', '/api/notifications/status')).body.upcoming[0].note).toMatch(/Kein Push-Gerät/);
    await call(anna, 'PATCH', `/api/access/people/${idOf('Anna')}`, { ntfyTopic: 'anna-topf' });
    expect((await call(anna, 'GET', '/api/notifications/status')).body.upcoming[0].note).toBeNull();
  });

  it('Stupsen geht an Personen mit Thema, an andere nicht', async () => {
    const board = store.createBoard({ name: 'Haushalt' });
    const col = store.getBoardView(board.id).columns[0]!.id;
    const card = store.createCard(board.id, { columnId: col, title: 'Bad', assigneeIds: [idOf('Ben')] }, idOf('Anna'));
    expect(store.createNudges(card.id, idOf('Anna'), { to: [idOf('Ben')], template: 'think' }).skipped).toEqual([
      expect.objectContaining({ reason: 'no_device' }),
    ]);
    store.setNtfyTopic(idOf('Ben'), 'ben-topf');
    expect(store.createNudges(card.id, idOf('Anna'), { to: [idOf('Ben')], template: 'think' }).sent).toHaveLength(1);
  });
});
