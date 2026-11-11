import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { type PushGateway, type PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({
  'x-remote-user-id': id,
  'x-remote-user-name': name,
  'x-remote-user-display-name': name,
});
const chef = as('ha-chef', 'Chef'); // Administrator, selbst keine Person
const anna = as('ha-anna', 'Anna Beispiel');
const ben = as('ha-ben', 'Ben');

let app: FastifyInstance;
let store: Store;
let sent: { to: string; message: PushMessage; via: string }[];
let annaId: string;
let benId: string;

const gateway = (via: string, reach: (id: string) => boolean): PushGateway => ({
  canReach: reach,
  send: async (to, message) => (sent.push({ to, message, via }), true),
  clear: async () => undefined,
});

async function build(opts: { gated?: boolean } = {}) {
  store = createStore(openDb(':memory:'));
  annaId = store.addPerson({ haUserId: 'ha-anna', name: 'Anna Beispiel' }).id;
  benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.setNotifyServices(annaId, ['mobile_app_anna']);
  sent = [];
  // Beta: das Tor lässt für die Familie nichts durch (canReach false), die Testnachricht der Einrichtung geht am Tor vorbei
  const normal = gateway('tor', (id) => !opts.gated && id === annaId);
  const test = gateway('test', (id) => id === annaId);
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    push: normal,
    testPush: test,
    now: () => new Date('2026-11-10T11:00:00Z'),
    timeZone: () => 'Europe/Berlin',
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
  });
}
beforeEach(() => build());

const post = (who: object, payload?: object) => app.inject({ method: 'POST', url: '/api/push/test', headers: who as Record<string, string>, payload });

describe('Testnachricht der Einrichtung', () => {
  it('ohne Rumpf bleibt es beim bisherigen Test (über den normalen Weg)', async () => {
    const res = await post(anna);
    expect(res.statusCode).toBe(200);
    expect(sent[0]!.message).toMatchObject({ title: 'Stups: Test', tag: 'stups-test' });
    expect(sent[0]!.message.actions).toBeUndefined();
    expect(sent[0]!.via).toBe('tor');
  });

  it('kind „onboarding": so wie eine Wächter-Nachricht, mit Kartentitel, „Neue Karte für dich · fällig …“ und nur dem Knopf Erledigt', async () => {
    const res = await post(anna, { kind: 'onboarding' });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(annaId);
    expect(sent[0]!.message).toMatchObject({
      title: 'Waschmaschine ausräumen',
      body: 'Neue Karte für dich · fällig heute 12:30',
      tag: 'stups-test',
      group: 'stups',
      level: 'time-sensitive',
    });
    // „Später" gibt es nur bei einem Stups, nicht bei einer Wächter-Karte
    expect(sent[0]!.message.actions!.map((a) => a.title)).toEqual(['Erledigt']);
    expect(sent[0]!.message.kind).toBeUndefined();
  });

  it('der Kartentitel kommt vom Wächter, den die Person eingerichtet hat', async () => {
    await post(anna, { kind: 'onboarding', cardTitle: 'Müll rausstellen' });
    expect(sent[0]!.message.title).toBe('Müll rausstellen');
  });

  it('in der Sprache der Person, die sie bekommt', async () => {
    store.setLanguage(annaId, { choice: 'en', effective: 'en' });
    await post(anna, { kind: 'onboarding' });
    expect(sent[0]!.message).toMatchObject({ title: 'Empty the washing machine', body: 'New card for you · due today 12:30' });
    expect(sent[0]!.message.actions!.map((a) => a.title)).toEqual(['Done']);
  });

  it('geht in der Beta am Tor vorbei (Push dort zunächst aus), der normale Test nicht', async () => {
    await build({ gated: true });
    expect((await post(anna, { kind: 'onboarding' })).statusCode).toBe(200);
    expect(sent[0]!.via).toBe('test');
    expect((await post(anna)).statusCode).toBe(409);
  });

  it('ein Administrator, der selbst keine Person ist, schickt sie an eine Person mit Handy', async () => {
    const res = await post(chef, { kind: 'onboarding', personId: annaId });
    expect(res.statusCode).toBe(200);
    expect(sent[0]!.to).toBe(annaId);
    // ohne Empfänger gibt es für ihn keinen Weg
    expect((await post(chef, { kind: 'onboarding' })).statusCode).toBe(409);
  });

  it('ein Kind schickt die Testnachricht an das eigene Handy (der Handy-Schritt der Einrichtung), an niemand anderen', async () => {
    store.setChild(annaId, { isChild: true });
    store.setNotifyServices(benId, ['mobile_app_ben']);
    const own = await post(anna, { kind: 'onboarding' });
    expect(own.statusCode, own.body).toBe(200);
    expect(sent.map((s) => s.to)).toEqual([annaId]);
    const other = await post(anna, { kind: 'onboarding', personId: benId });
    expect(other.statusCode).toBe(403);
    expect(other.json().error).toMatch(/Administratoren/); // die Route verweigert, nicht erst die Rolle
    expect(sent).toHaveLength(1);
  });

  it('ein Mitglied schickt nur an sich selbst', async () => {
    expect((await post(ben, { kind: 'onboarding', personId: annaId })).statusCode).toBe(403);
    expect((await post(anna, { kind: 'onboarding', personId: annaId })).statusCode).toBe(200);
  });

  it('der Empfänger muss eine Person mit Handy sein', async () => {
    expect((await post(chef, { kind: 'onboarding', personId: 'gibt-es-nicht' })).statusCode).toBe(404);
    const res = await post(chef, { kind: 'onboarding', personId: benId });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Push-Weg/);
    expect(sent).toHaveLength(0);
  });

  it('prüft die Eingaben', async () => {
    for (const bad of [{ kind: 'wetter' }, { kind: 'onboarding', cardTitle: 5 }, { kind: 'onboarding', cardTitle: 'x'.repeat(300) }, { kind: 'onboarding', cardTitle: '  ' }, { kind: 'onboarding', personId: 7 }]) {
      expect((await post(anna, bad)).statusCode).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });
});
