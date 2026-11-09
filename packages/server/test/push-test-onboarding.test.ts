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
const anna = as('ha-anna', 'Anna Beispiel');
const ben = as('ha-ben', 'Ben');

let app: FastifyInstance;
let store: Store;
let sent: { to: string; message: PushMessage }[];

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna Beispiel' });
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  store.setNotifyServices(store.userByHaId('ha-anna')!.id, ['mobile_app_anna']);
  sent = [];
  const push: PushGateway = {
    canReach: (id) => id === store.userByHaId('ha-anna')!.id,
    send: async (to, message) => (sent.push({ to, message }), true),
    clear: async () => undefined,
  };
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, { store, push, directory: { isAdmin: async () => false, persons: async () => [] } });
});

const post = (who: object, payload?: object) => app.inject({ method: 'POST', url: '/api/push/test', headers: who as Record<string, string>, payload });

describe('Testnachricht der Einrichtung', () => {
  it('ohne Rumpf bleibt es beim bisherigen Test', async () => {
    const res = await post(anna);
    expect(res.statusCode).toBe(200);
    expect(sent[0]!.message).toMatchObject({ title: 'Stups: Test', tag: 'stups-test' });
    expect(sent[0]!.message.actions).toBeUndefined();
  });

  it('kind „onboarding": eigene Texte mit den Knöpfen Erledigt und Später', async () => {
    const res = await post(anna, { kind: 'onboarding', title: 'Spülmaschine fertig', body: 'Anna, ausräumen?' });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(store.userByHaId('ha-anna')!.id);
    expect(sent[0]!.message).toMatchObject({ title: 'Spülmaschine fertig', body: 'Anna, ausräumen?', tag: 'stups-test', group: 'stups' });
    expect(sent[0]!.message.actions!.map((a) => a.title)).toEqual(['Erledigt', 'Später']);
    // ein Knopf, den ein echter Wächter nicht kennt, bleibt harmlos: der Notifier ignoriert unbekannte Aktionen
    expect(sent[0]!.message.kind).toBeUndefined();
  });

  it('ohne Texte: die Vorschau-Texte mit dem Vornamen, in der Sprache der Person', async () => {
    await post(anna, { kind: 'onboarding' });
    expect(sent[0]!.message).toMatchObject({ title: 'Waschmaschine fertig', body: 'Anna, die Waschmaschine ist fertig. Ausräumen?' });

    sent = [];
    store.setLanguage(store.userByHaId('ha-anna')!.id, { choice: 'en', effective: 'en' });
    await post(anna, { kind: 'onboarding' });
    expect(sent[0]!.message).toMatchObject({ title: 'Washing machine done', body: 'Anna, the washing machine is done. Empty it?' });
    expect(sent[0]!.message.actions!.map((a) => a.title)).toEqual(['Done', 'Later']);
  });

  it('prüft die Eingaben: nur kind „onboarding", Texte als kurzer Text', async () => {
    for (const bad of [{ kind: 'wetter' }, { kind: 'onboarding', title: 5 }, { kind: 'onboarding', body: 'x'.repeat(300) }, { kind: 'onboarding', title: '  ' }]) {
      expect((await post(anna, bad)).statusCode).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });

  it('kein Push-Weg für die Person: dieselbe freundliche Meldung wie beim Test', async () => {
    const res = await post(ben, { kind: 'onboarding' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Push-Weg/);
    expect(sent).toHaveLength(0);
  });
});
